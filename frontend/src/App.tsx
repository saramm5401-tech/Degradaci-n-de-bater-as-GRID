import { useEffect, useMemo, useState } from "react";
import { ApiError, getJson, postJson } from "./api";
import { ChartPanel } from "./ChartPanel";
import { ExcelCurveUpload } from "./ExcelCurveUpload";
import {
  categoryLabel,
  electrodeParameterLabel,
  modelLabel,
  modelNote,
  parameterDescription,
  parameterLabel,
  terminationLabel,
  translateTechnicalTerms,
  unavailableReason,
  variableLabel,
} from "./translations";
import type {
  ExchangeCurrentTables,
  ExperimentInput,
  ExperimentType,
  ModelInfo,
  OcpPoint,
  OcpTables,
  ParameterInfo,
  ParameterPreset,
  ParameterResponse,
  PresetsResponse,
  RunRecord,
  SavedConfiguration,
  SimulationResult,
  SimulateRequest,
  VariableInfo,
} from "./types";
import { constraintMessage, defaultDisplayMode, displayFactor, displayLabel, formatShown } from "./units";

const STORAGE_KEY = "battery-configurations";
const NOMINAL_CAPACITY_PARAMETER = "Nominal cell capacity [A.h]";
const EXPERIMENT_OWNED_PARAMETERS = new Set(["Current function [A]", "Initial temperature [K]"]);
const PRESETS: Array<[string, string, string]> = [
  ["Voltaje vs tiempo", "Time [s]", "Voltage [V]"],
  ["Voltaje vs capacidad", "Discharge capacity [A.h]", "Voltage [V]"],
  ["Corriente vs tiempo", "Time [s]", "Current [A]"],
  ["Capacidad vs tiempo", "Time [s]", "Discharge capacity [A.h]"],
];

const emptyExperiment = (): ExperimentInput => ({
  type: "discharge",
  current_mode: "c_rate",
  current_A: 0.003,
  c_rate: 1,
  duration_s: 3600,
  discharge_duration_s: 1800,
  charge_duration_s: 1800,
  temperature_K: 298.15,
});

function defaultCurrent(): Pick<ExperimentInput, "current_mode" | "current_A" | "c_rate" | "temperature_K"> {
  const { current_mode, current_A, c_rate, temperature_K } = emptyExperiment();
  return { current_mode, current_A, c_rate, temperature_K };
}

function loadSaved(): SavedConfiguration[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedConfiguration[]) : [];
  } catch {
    return [];
  }
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    return [error.message, ...error.details].map(translateTechnicalTerms).join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}

function cloneOcpTables(tables: OcpTables | null | undefined): OcpTables | null {
  if (!tables) return null;
  return {
    negative: (tables.negative ?? []).map((point) => ({ ...point })),
    positive: (tables.positive ?? []).map((point) => ({ ...point })),
  };
}

function cloneExchangeCurrentTables(
  tables: ExchangeCurrentTables | null | undefined,
): ExchangeCurrentTables | null {
  if (!tables) return null;
  return {
    negative: (tables.negative ?? []).map((point) => ({ ...point })),
    positive: (tables.positive ?? []).map((point) => ({ ...point })),
  };
}

export default function App() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelId, setModelId] = useState("sodium_ion");
  const [catalogue, setCatalogue] = useState<ParameterResponse | null>(null);
  const [presets, setPresets] = useState<ParameterPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState("chayambuka");
  const [ocpTables, setOcpTables] = useState<OcpTables | null>(null);
  const [exchangeCurrentTables, setExchangeCurrentTables] =
    useState<ExchangeCurrentTables | null>(null);
  const [variables, setVariables] = useState<VariableInfo[]>([]);
  const [unavailable, setUnavailable] = useState<Array<{ name: string; reason: string }>>([]);
  const [selectedVariables, setSelectedVariables] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [displayMode, setDisplayMode] = useState<Record<string, "si" | "um">>({});
  const [experiment, setExperiment] = useState<ExperimentInput>(emptyExperiment);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [xKey, setXKey] = useState("Time [s]");
  const [yKey, setYKey] = useState("Voltage [V]");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [configName, setConfigName] = useState("descarga de referencia");
  const [saved, setSaved] = useState<SavedConfiguration[]>(loadSaved);
  const [pybammVersion, setPybammVersion] = useState("");

  useEffect(() => {
    getJson<{ models: ModelInfo[] }>("/api/models").then((data) => setModels(data.models)).catch((reason) => setError(errorText(reason)));
    getJson<{ pybamm: string }>("/api/health").then((data) => setPybammVersion(data.pybamm)).catch(() => setPybammVersion(""));
  }, []);

  useEffect(() => {
    const selected = models.find((model) => model.id === modelId);
    if (!selected?.implemented) return;
    setDrafts({});
    setOcpTables(null);
    setError("");
    Promise.all([
      getJson<ParameterResponse>(`/api/models/${modelId}/parameters`),
      getJson<{ variables: VariableInfo[]; not_available: Array<{ name: string; reason: string }> }>(
        `/api/models/${modelId}/variables`,
      ),
    ])
      .then(([parameters, variablePayload]) => {
        setCatalogue(parameters);
        setVariables(variablePayload.variables);
        setUnavailable(variablePayload.not_available);
        const plottable = variablePayload.variables.filter((item) => item.plottable && item.name !== "Time [s]");
        setSelectedVariables(plottable.map((item) => item.name));
        const modes: Record<string, "si" | "um"> = {};
        for (const parameter of parameters.parameters) modes[parameter.name] = defaultDisplayMode(parameter);
        setDisplayMode(modes);
      })
      .catch((reason) => setError(errorText(reason)));
    getJson<PresetsResponse>(`/api/models/${modelId}/presets`)
      .then((data) => setPresets(data.presets))
      .catch((reason) => {
        setPresets([]);
        setError(errorText(reason));
      });
  }, [modelId, models]);

  const parameters = catalogue?.parameters ?? [];
  const byName = useMemo(() => new Map(parameters.map((parameter) => [parameter.name, parameter])), [parameters]);

  function siValue(parameter: ParameterInfo): number | null {
    const raw = drafts[parameter.name];
    if (raw == null || raw.trim() === "") return parameter.original;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function overrides(): Record<string, number> {
    const values: Record<string, number> = {};
    for (const parameter of parameters) {
      if (!parameter.editable || parameter.original == null) continue;
      const value = siValue(parameter);
      if (value == null || !materiallyDifferent(value, parameter.original)) continue;
      values[parameter.name] = value;
    }
    return values;
  }

  function localErrors(): string[] {
    const messages: string[] = [];
    for (const parameter of parameters) {
      const raw = drafts[parameter.name];
      if (raw == null) continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        messages.push(`${parameterLabel(parameter.name)}: número no válido.`);
        continue;
      }
      const message = constraintMessage(parameter, value);
      if (message) messages.push(`${parameterLabel(parameter.name)}: ${translateTechnicalTerms(message)}.`);
    }
    if (!(experiment.temperature_K > 0)) messages.push("La temperatura tiene que ser > 0 K.");
    return messages;
  }

  function outgoingOcpTables(): OcpTables | null {
    if (!ocpTables) return null;
    if (ocpTables.negative.length === 0 && ocpTables.positive.length === 0) return null;
    return { negative: ocpTables.negative, positive: ocpTables.positive };
  }

  function outgoingExchangeCurrentTables(): ExchangeCurrentTables | null {
    if (!exchangeCurrentTables) return null;
    if (
      exchangeCurrentTables.negative.length === 0 &&
      exchangeCurrentTables.positive.length === 0
    ) return null;
    return exchangeCurrentTables;
  }

  function buildRequest(label: string): SimulateRequest {
    const request: SimulateRequest = {
      model: modelId,
      label,
      parameters: overrides(),
      experiment,
      variables: selectedVariables,
    };
    const tables = outgoingOcpTables();
    if (tables) request.ocp_tables = tables;
    const exchangeTables = outgoingExchangeCurrentTables();
    if (exchangeTables) request.exchange_current_tables = exchangeTables;
    return request;
  }

  async function runRequest(request: SimulateRequest) {
    const result = await postJson<SimulationResult>("/api/simulate", request);
    setRuns((current) => [
      ...current,
      { id: crypto.randomUUID(), request, result, visible: true },
    ]);
  }

  async function onRun() {
    const messages = localErrors();
    if (messages.length) {
      setError(messages.join("\n"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const label = `Simulación ${runs.length + 1}`;
      await runRequest(buildRequest(label));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function onCompare() {
    const previous = runs[runs.length - 1];
    if (!previous) return;
    const messages = localErrors();
    if (messages.length) {
      setError(messages.join("\n"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const current = buildRequest("Configuración actual");
      const payload = {
        cases: [
          { ...previous.request, label: `${previous.result.label} (recalculada)`, variables: selectedVariables },
          current,
        ],
      };
      const response = await postJson<{ cases: SimulationResult[] }>("/api/simulate/compare", payload);
      setRuns((existing) => [
        ...existing.map((run) => ({ ...run, visible: false })),
        ...response.cases.map((result, index) => ({
          id: crypto.randomUUID(),
          request: index === 0 ? previous.request : current,
          result,
          visible: true,
        })),
      ]);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  function persist(next: SavedConfiguration[]) {
    setSaved(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function currentConfiguration(name: string): SavedConfiguration {
    const configuration: SavedConfiguration = {
      name,
      model: modelId,
      parameters: overrides(),
      experiment,
    };
    const tables = outgoingOcpTables();
    if (tables) configuration.ocp_tables = tables;
    const exchangeTables = outgoingExchangeCurrentTables();
    if (exchangeTables) configuration.exchange_current_tables = exchangeTables;
    return configuration;
  }

  async function onSave() {
    const configuration = currentConfiguration(configName.trim() || "sin nombre");
    persist([configuration, ...saved.filter((item) => item.name !== configuration.name)]);
    const blob = new Blob([JSON.stringify(configuration, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${configuration.name}.json`;
    link.click();
    URL.revokeObjectURL(url);
    try {
      await postJson("/api/configurations", configuration);
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  function applyConfiguration(configuration: SavedConfiguration) {
    if (configuration.model !== modelId) {
      setError("Esa configuración pertenece a otro modelo.");
      return;
    }
    const next: Record<string, string> = {};
    for (const [name, value] of Object.entries(configuration.parameters)) {
      next[name] = String(value);
    }
    setDrafts(next);
    setExperiment(configuration.experiment);
    setOcpTables(cloneOcpTables(configuration.ocp_tables));
    setExchangeCurrentTables(cloneExchangeCurrentTables(configuration.exchange_current_tables));
    setError("");
  }

  function applyPreset(id: string) {
    setSelectedPreset(id);
    if (id === "chayambuka") {
      setDrafts({});
      setOcpTables(null);
      setExchangeCurrentTables(null);
      setExperiment((current) => ({ ...current, ...defaultCurrent() }));
      return;
    }
    const preset = presets.find((item) => item.id === id);
    if (!preset) {
      setOcpTables(null);
      setExchangeCurrentTables(null);
      return;
    }
    const next: Record<string, string> = {};
    for (const [name, value] of Object.entries(preset.overrides ?? {})) {
      if (EXPERIMENT_OWNED_PARAMETERS.has(name)) continue;
      next[name] = String(value);
    }
    setDrafts(next);
    setOcpTables(cloneOcpTables(preset.ocp_tables));
    setExchangeCurrentTables(null);
    if (preset.experiment) {
      const { current_mode, current_A, temperature_K } = preset.experiment;
      setExperiment((current) => ({
        ...current,
        ...(current_mode != null ? { current_mode } : {}),
        ...(current_A != null ? { current_A } : {}),
        ...(temperature_K != null ? { temperature_K } : {}),
      }));
    }
  }

  const nominal = byName.get(NOMINAL_CAPACITY_PARAMETER);
  const nominalValue = nominal ? siValue(nominal) : null;
  const magnitude =
    experiment.current_mode === "c_rate"
      ? (experiment.c_rate ?? 0) * (nominalValue ?? 0)
      : experiment.current_A ?? 0;
  const signedCurrent = experiment.type === "charge" ? -magnitude : magnitude;
  const axisOptions = axisKeys(runs.filter((run) => run.visible));
  const activeModel = models.find((model) => model.id === modelId);
  const selectedNote = presets.find((preset) => preset.id === selectedPreset)?.note ?? "";
  const searchTerm = query.trim().toLowerCase();
  const matchesSearch = (parameter: ParameterInfo) =>
    `${parameterLabel(parameter.name)} ${parameter.name} ${parameter.description} ${parameterDescription(parameter)}`
      .toLowerCase()
      .includes(searchTerm);
  const cellParameters = parameters.filter(
    (parameter) =>
      parameter.category === "Celda" &&
      parameter.name !== "Current function [A]" &&
      matchesSearch(parameter),
  );
  const negativeParameters = parameters.filter(
    (parameter) => parameter.category === "Electrodo negativo" && parameter.type === "number",
  );
  const positiveByName = new Map(
    parameters
      .filter((parameter) => parameter.category === "Electrodo positivo")
      .map((parameter) => [parameter.name, parameter]),
  );
  const electrodeRows = negativeParameters
    .map((negative) => [
      negative,
      positiveByName.get(negative.name.replace(/Negative/g, "Positive")),
    ] as const)
    .filter(([negative, positive]) => positive && (matchesSearch(negative) || matchesSearch(positive)));
  const negativeDiffusivity = byName.get("Negative particle diffusivity [m2.s-1]");
  const positiveDiffusivity = byName.get("Positive particle diffusivity [m2.s-1]");

  function renderParameter(parameter: ParameterInfo, compact = false) {
    return (
      <ParameterRow
        key={parameter.name}
        parameter={parameter}
        compact={compact}
        mode={displayMode[parameter.name] ?? "si"}
        raw={drafts[parameter.name]}
        readOnlyValue={
          parameter.name === "Initial temperature [K]"
            ? experiment.temperature_K
            : parameter.name === "Current function [A]"
              ? signedCurrent
              : null
        }
        onMode={(mode) => setDisplayMode((current) => ({ ...current, [parameter.name]: mode }))}
        onDraft={(value) => setDrafts((current) => ({ ...current, [parameter.name]: value }))}
        onReset={() =>
          setDrafts((current) => {
            const next = { ...current };
            delete next[parameter.name];
            return next;
          })
        }
      />
    );
  }

  return (
    <main>
      <header>
        <h1>Parametrización de baterías</h1>
        <p>
          Ion sodio con PyBaMM {pybammVersion || ""} · BasicDFN · conjunto Chayambuka2022.
          La corriente positiva es descarga.
        </p>
      </header>

      <div className="layout">
        <section className="panel">
          <h2>Modelo y parámetros</h2>
          <label className="field">
            Tipo de batería
            <select
              data-testid="model-select"
              value={modelId}
              onChange={(event) => {
                const next = models.find((model) => model.id === event.target.value);
                if (next && !next.implemented) return;
                setModelId(event.target.value);
              }}
            >
              {models.map((model) => (
                <option key={model.id} value={model.id} disabled={!model.implemented}>
                  {modelLabel(model)}{model.implemented ? "" : " (no implementado)"}
                </option>
              ))}
            </select>
          </label>
          {activeModel?.notes && (
            <details className="model-notes">
              <summary>Notas del modelo</summary>
              <ul className="notes">
                {activeModel.notes.map((note) => (
                  <li key={note}>{modelNote(activeModel, note)}</li>
                ))}
              </ul>
            </details>
          )}
          <label className="field">
            Buscar
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="espesor, porosidad, potencial…" />
          </label>
          <div className="toolbar" style={{ alignItems: "end" }}>
            <label className="field">
              Agregado de parámetros
              <select
                data-testid="parameter-preset"
                value={selectedPreset}
                onChange={(event) => applyPreset(event.target.value)}
              >
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary" type="button" onClick={() => applyPreset("chayambuka")}>
              Restaurar parámetros
            </button>
          </div>
          {selectedNote && <p className="meta">{selectedNote}</p>}
          <section className="setup-section" aria-labelledby="cell-data-heading">
            <h3 id="cell-data-heading">1. Datos de la celda</h3>
            <div className="cell-parameter-grid">
              {cellParameters.map((parameter) => (
                <div className="cell-parameter-field" key={parameter.name}>
                  <strong>{parameterLabel(parameter.name)}</strong>
                  {renderParameter(parameter, true)}
                </div>
              ))}
            </div>
          </section>

          <section className="setup-section" aria-labelledby="electrode-data-heading">
            <h3 id="electrode-data-heading">2. Parámetros electroquímicos</h3>
            <p className="meta">
              Parámetros compartidos en una sola tabla: ánodo (electrodo negativo) y cátodo
              (electrodo positivo).
            </p>
            <p className="meta">
              Las curvas son opcionales: carga un Excel para sustituir cada función o deja la tabla
              vacía para conservar el conjunto base.
            </p>
            <div className="electrode-matrix">
              <div className="electrode-matrix-header">
                <span>Parámetro</span>
                <span>Ánodo</span>
                <span>Cátodo</span>
              </div>
              <div className="electrode-matrix-row">
                <strong>Potencial de circuito abierto (OCP, V)</strong>
                <ExcelCurveUpload
                  id="ocp-negative"
                  title="Excel del ánodo"
                  kind="ocp"
                  pointCount={ocpTables?.negative.length ?? 0}
                  onImport={(points) =>
                    setOcpTables((current) => ({
                      negative: points.map(({ sto, value }) => ({ sto, V: value })),
                      positive: current?.positive ?? [],
                    }))
                  }
                  onClear={() =>
                    setOcpTables((current) =>
                      current ? { ...current, negative: [] } : null,
                    )
                  }
                />
                <ExcelCurveUpload
                  id="ocp-positive"
                  title="Excel del cátodo"
                  kind="ocp"
                  pointCount={ocpTables?.positive.length ?? 0}
                  onImport={(points) =>
                    setOcpTables((current) => ({
                      negative: current?.negative ?? [],
                      positive: points.map(({ sto, value }) => ({ sto, V: value })),
                    }))
                  }
                  onClear={() =>
                    setOcpTables((current) =>
                      current ? { ...current, positive: [] } : null,
                    )
                  }
                />
              </div>
              <div className="electrode-matrix-row">
                <strong>Difusividad</strong>
                <span className="meta">
                  {negativeDiffusivity ? parameterDescription(negativeDiffusivity) : "Función del conjunto"}
                </span>
                <span className="meta">
                  {positiveDiffusivity ? parameterDescription(positiveDiffusivity) : "Función del conjunto"}
                </span>
              </div>
              <div className="electrode-matrix-row">
                <strong>Densidad de intercambio (A/m²)</strong>
                <ExcelCurveUpload
                  id="exchange-negative"
                  title="Excel del ánodo"
                  kind="exchange-current"
                  pointCount={exchangeCurrentTables?.negative.length ?? 0}
                  onImport={(points) =>
                    setExchangeCurrentTables((current) => ({
                      negative: points.map(({ sto, value }) => ({ sto, j0: value })),
                      positive: current?.positive ?? [],
                    }))
                  }
                  onClear={() =>
                    setExchangeCurrentTables((current) =>
                      current ? { ...current, negative: [] } : null,
                    )
                  }
                />
                <ExcelCurveUpload
                  id="exchange-positive"
                  title="Excel del cátodo"
                  kind="exchange-current"
                  pointCount={exchangeCurrentTables?.positive.length ?? 0}
                  onImport={(points) =>
                    setExchangeCurrentTables((current) => ({
                      negative: current?.negative ?? [],
                      positive: points.map(({ sto, value }) => ({ sto, j0: value })),
                    }))
                  }
                  onClear={() =>
                    setExchangeCurrentTables((current) =>
                      current ? { ...current, positive: [] } : null,
                    )
                  }
                />
              </div>
              {electrodeRows.map(([negative, positive]) => (
                <div className="electrode-matrix-row" key={negative.name}>
                  <strong>{electrodeParameterLabel(negative.name)}</strong>
                  {renderParameter(negative, true)}
                  {positive && renderParameter(positive, true)}
                </div>
              ))}
            </div>
            <p className="meta">
              Las tablas de j₀ reemplazan la función completa del modelo y se interpolan por
              estequiometría de partícula (sto), sin los factores originales de concentración.
              La función original recibe temperatura, pero no la usa.
            </p>
            {ocpTables && (
              <details className="curve-details">
                <summary>Ver o editar las tablas de potencial cargadas</summary>
                <div className="ocp-blocks">
                  <OcpTableEditor
                    testId="ocp-negative"
                    title="Ánodo, hard carbon, U_n"
                    electrode="negative"
                    points={ocpTables.negative}
                    onChange={(points) =>
                      setOcpTables((current) => (current ? { ...current, negative: points } : current))
                    }
                  />
                  <OcpTableEditor
                    testId="ocp-positive"
                    title="Cátodo, NFM, U_p"
                    electrode="positive"
                    points={ocpTables.positive}
                    onChange={(points) =>
                      setOcpTables((current) => (current ? { ...current, positive: points } : current))
                    }
                  />
                </div>
              </details>
            )}
          </section>

          <details className="additional-parameters">
            <summary>3. Otros parámetros (separador, electrolito y experimento)</summary>
            {(catalogue?.categories ?? [])
              .filter((category) =>
                !["Celda", "Electrodo negativo", "Electrodo positivo"].includes(category),
              )
              .map((category) => {
                const rows = parameters.filter(
                  (parameter) => parameter.category === category && matchesSearch(parameter),
                );
                if (!rows.length) return null;
                return (
                  <details key={category}>
                    <summary>{categoryLabel(category)}</summary>
                    {rows.map((parameter) => renderParameter(parameter))}
                  </details>
                );
              })}
          </details>
        </section>

        <div className="stack">
          <section className="panel">
            <h2>Condiciones de simulación</h2>
            <div className="row">
              <label className="field">
                Experimento
                <select
                  data-testid="experiment-type"
                  value={experiment.type}
                  onChange={(event) =>
                    setExperiment({ ...experiment, type: event.target.value as ExperimentType })
                  }
                >
                  <option value="discharge">Descarga a corriente constante</option>
                  <option value="charge">Carga a corriente constante</option>
                  <option value="cycle">Ciclo descarga / carga</option>
                </select>
              </label>
              <label className="field">
                Entrada eléctrica
                <select
                  value={experiment.current_mode}
                  onChange={(event) =>
                    setExperiment({
                      ...experiment,
                      current_mode: event.target.value as ExperimentInput["current_mode"],
                    })
                  }
                >
                  <option value="c_rate">Tasa C</option>
                  <option value="current">Corriente (A)</option>
                </select>
              </label>
            </div>
            <div className="row">
              {experiment.current_mode === "c_rate" ? (
                <label className="field">
                  Tasa C
                  <input
                    data-testid="c-rate"
                    type="number"
                    step="any"
                    value={experiment.c_rate ?? ""}
                    onChange={(event) =>
                      setExperiment({ ...experiment, c_rate: Number(event.target.value) })
                    }
                  />
                </label>
              ) : (
                <label className="field">
                  Magnitud de corriente (A)
                  <input
                    data-testid="current-a"
                    type="number"
                    step="any"
                    min="0"
                    value={experiment.current_A ?? ""}
                    onChange={(event) =>
                      setExperiment({ ...experiment, current_A: Number(event.target.value) })
                    }
                  />
                </label>
              )}
              <label className="field">
                Temperatura isotérmica (K)
                <input
                  data-testid="temperature"
                  type="number"
                  step="any"
                  value={experiment.temperature_K}
                  onChange={(event) =>
                    setExperiment({ ...experiment, temperature_K: Number(event.target.value) })
                  }
                />
              </label>
            </div>
            {experiment.type === "cycle" ? (
              <div className="row">
                <label className="field">
                  Descarga (s)
                  <input
                    type="number"
                    step="any"
                    value={experiment.discharge_duration_s ?? ""}
                    onChange={(event) =>
                      setExperiment({ ...experiment, discharge_duration_s: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="field">
                  Carga (s)
                  <input
                    type="number"
                    step="any"
                    value={experiment.charge_duration_s ?? ""}
                    onChange={(event) =>
                      setExperiment({ ...experiment, charge_duration_s: Number(event.target.value) })
                    }
                  />
                </label>
              </div>
            ) : (
              <label className="field">
                Duración solicitada (s)
                <input
                  data-testid="duration"
                  type="number"
                  step="any"
                  value={experiment.duration_s ?? ""}
                  onChange={(event) =>
                    setExperiment({ ...experiment, duration_s: Number(event.target.value) })
                  }
                />
              </label>
            )}
            <p className="meta">
              Corriente aplicada: {signedCurrent.toExponential(4)} A.
              {experiment.type === "charge" ? " El signo negativo lo pone la carga." : ""}
              {experiment.type === "cycle"
                ? " En el ciclo, la corriente cambia de signo con un escalón. BasicDFN no tiene capacitancia de doble capa, así que el voltaje salta al cambiar la corriente."
                : ""}
              {" "}El voltaje inicial no es un dato: sale de las concentraciones iniciales y del potencial de circuito abierto.
            </p>
            <div className="toolbar">
              <button data-testid="run" type="button" disabled={busy} onClick={onRun}>
                {busy ? "Resolviendo…" : "Ejecutar simulación"}
              </button>
              <button type="button" className="secondary" disabled={busy || runs.length === 0} onClick={onCompare}>
                Comparar con la anterior
              </button>
            </div>
          </section>

          <section className="panel">
            <h2>Resultados</h2>
            <div className="toolbar">
              {PRESETS.map(([label, x, y]) => (
                <button key={label} className="secondary" type="button" onClick={() => { setXKey(x); setYKey(y); }}>
                  {label}
                </button>
              ))}
            </div>
            <div className="row">
              <label className="field">
                Eje X
                <select data-testid="axis-x" value={xKey} onChange={(event) => setXKey(event.target.value)}>
                  {axisOptions.map((name) => <option key={name} value={name}>{variableLabel(name)}</option>)}
                </select>
              </label>
              <label className="field">
                Eje Y
                <select data-testid="axis-y" value={yKey} onChange={(event) => setYKey(event.target.value)}>
                  {axisOptions.map((name) => <option key={name} value={name}>{variableLabel(name)}</option>)}
                </select>
              </label>
            </div>
            <div className="runs">
              {runs.map((run) => (
                <label key={run.id} className="run-chip">
                  <input
                    type="checkbox"
                    checked={run.visible}
                    onChange={() =>
                      setRuns((current) =>
                        current.map((item) => item.id === run.id ? { ...item, visible: !item.visible } : item),
                      )
                    }
                  />
                  {run.result.label}
                </label>
              ))}
            </div>
            {runs.some((run) => run.visible) ? (
              <ChartPanel runs={runs} xKey={xKey} yKey={yKey} />
            ) : (
              <p data-testid="chart-empty">Ejecuta una simulación para ver la curva.</p>
            )}
            {runs.filter((run) => run.visible).map((run) => (
              <p key={run.id} className="meta">
                {run.result.label}: {terminationLabel(run.result.termination)}. t = {run.result.applied.t_end_s.toFixed(2)} s
                de {run.result.applied.duration_requested_s} s solicitados.
                Solucionador {run.result.solver}, {run.result.elapsed_s.toFixed(2)} s de cálculo,
                {run.result.n_points} puntos{run.result.downsampled ? " (submuestreados)" : ""}.
                {run.result.warnings.length
                  ? ` Avisos del solucionador: ${run.result.warnings.map(translateTechnicalTerms).join(" ")}`
                  : ""}
              </p>
            ))}
            <details>
              <summary>Variables que este modelo no calcula</summary>
              <ul className="notes">
                {unavailable.map((item) => (
                  <li key={item.name}>
                    <strong>{variableLabel(item.name)}.</strong> {unavailableReason(item.name, item.reason)}
                  </li>
                ))}
              </ul>
            </details>
            <details>
              <summary>Variables de la próxima simulación</summary>
              {variables.filter((item) => item.plottable && item.name !== "Time [s]").map((item) => (
                <label key={item.name} className="run-chip">
                  <input
                    type="checkbox"
                    checked={selectedVariables.includes(item.name)}
                    onChange={() =>
                      setSelectedVariables((current) =>
                        current.includes(item.name)
                          ? current.filter((name) => name !== item.name)
                          : [...current, item.name],
                      )
                    }
                  />
                  {variableLabel(item.name)}
                  {item.source === "reduction" ? " · promedio PyBaMM" : ""}
                </label>
              ))}
            </details>
          </section>

          <section className="panel">
            <h2>Configuraciones</h2>
            <div className="row">
              <label className="field">
                Nombre
                <input value={configName} onChange={(event) => setConfigName(event.target.value)} />
              </label>
              <div className="toolbar" style={{ alignItems: "end" }}>
                <button type="button" className="secondary" onClick={onSave}>Guardar JSON</button>
                <label className="field">
                  Cargar JSON
                  <input
                    type="file"
                    accept="application/json"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      try {
                        applyConfiguration(JSON.parse(await file.text()) as SavedConfiguration);
                      } catch (reason) {
                        setError(errorText(reason));
                      }
                    }}
                  />
                </label>
              </div>
            </div>
            <div className="toolbar">
              {saved.map((configuration) => (
                <button
                  key={configuration.name}
                  type="button"
                  className="secondary"
                  onClick={() => applyConfiguration(configuration)}
                >
                  {configuration.name}
                </button>
              )              )}
            </div>
            <p className="meta">
              El archivo JSON y el almacenamiento del navegador conservan la configuración.
              El servidor solo la guarda en memoria hasta que se reinicia.
            </p>
          </section>
          {error && <pre className="error" data-testid="error">{error}</pre>}
        </div>
      </div>
    </main>
  );
}

function materiallyDifferent(value: number, original: number): boolean {
  return Math.abs(value - original) > 1e-12 * Math.max(1, Math.abs(original));
}

function axisKeys(runs: RunRecord[]): string[] {
  const present = new Set<string>(["Time [s]", "Voltage [V]", "Current [A]", "Discharge capacity [A.h]"]);
  for (const run of runs) {
    for (const name of Object.keys(run.result.series)) present.add(name);
  }
  return [...present];
}

function ParameterRow({
  parameter,
  compact = false,
  mode,
  raw,
  readOnlyValue,
  onMode,
  onDraft,
  onReset,
}: {
  parameter: ParameterInfo;
  compact?: boolean;
  mode: "si" | "um";
  raw: string | undefined;
  readOnlyValue: number | null;
  onMode: (mode: "si" | "um") => void;
  onDraft: (value: string) => void;
  onReset: () => void;
}) {
  const factor = displayFactor(parameter.unit, mode);
  const si = raw != null && raw.trim() !== "" ? Number(raw) : parameter.original;
  const shown = readOnlyValue != null ? readOnlyValue * factor : si == null || !Number.isFinite(si) ? "" : formatShown(si / factor, 1);
  const edited =
    parameter.original != null &&
    raw != null &&
    raw.trim() !== "" &&
    Number.isFinite(Number(raw)) &&
    Math.abs(Number(raw) - parameter.original) > 1e-12 * Math.max(1, Math.abs(parameter.original));
  const message =
    parameter.editable && raw != null
      ? !Number.isFinite(Number(raw))
        ? "Número no válido."
        : constraintMessage(parameter, Number(raw))
      : null;

  return (
    <article className={`parameter${compact ? " compact" : ""}`} data-testid={`param-${parameter.name}`}>
      {!compact && <header>
        <h3>{parameterLabel(parameter.name)}</h3>
        <span className="meta">{parameter.affects_basic_dfn ? "entra en BasicDFN" : "no cambia el DFN"}</span>
      </header>}
      {parameter.type === "function" ? (
        <p className="meta">{parameterDescription(parameter)}</p>
      ) : (
        <>
          <div className="controls">
            <input
              aria-label={parameterLabel(parameter.name)}
              disabled={!parameter.editable}
              type="number"
              step="any"
              value={
                parameter.editable
                  ? raw == null || raw.trim() === "" || !Number.isFinite(Number(raw))
                    ? parameter.original == null
                      ? ""
                      : formatShown(parameter.original, factor)
                    : formatShown(Number(raw), factor)
                  : shown
              }
              onChange={(event) => {
                if (event.target.value.trim() === "") {
                  onDraft("");
                  return;
                }
                const entered = Number(event.target.value);
                if (!Number.isFinite(entered)) return;
                onDraft(String(entered / factor));
              }}
            />
            {parameter.unit === "m" ? (
              <select aria-label={`unidad de ${parameterLabel(parameter.name)}`} value={mode} onChange={(event) => onMode(event.target.value as "si" | "um")}>
                <option value="um">µm</option>
                <option value="si">m</option>
              </select>
            ) : (
              <span className="meta">{displayLabel(parameter.unit, mode)}</span>
            )}
            {parameter.editable ? (
              <button type="button" className="secondary" onClick={onReset} disabled={!edited}>
                Restaurar
              </button>
            ) : <span />}
          </div>
          {parameter.original != null && (
            <p className="meta">
              Valor del conjunto: {formatShown(parameter.original, factor)} {displayLabel(parameter.unit, mode)}
              {edited && Number.isFinite(Number(raw)) ? ` · modificado: ${formatShown(Number(raw), factor)}` : ""}
            </p>
          )}
        </>
      )}
      {!compact && parameter.description && <p className="meta">{parameterDescription(parameter)}</p>}
      {message && <p className="warn">{message}</p>}
    </article>
  );
}

function parseOcpNumber(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return Number.NaN;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.NaN;
}

function nextOcpPoint(points: OcpPoint[]): OcpPoint {
  const last = points[points.length - 1];
  if (!last) return { sto: 0, V: 0 };
  const sto = Number.isFinite(last.sto) ? Math.round((last.sto + 0.05) * 1e6) / 1e6 : Number.NaN;
  return { sto, V: last.V };
}

function OcpTableEditor({
  testId,
  title,
  electrode,
  points,
  onChange,
}: {
  testId: string;
  title: string;
  electrode: "negative" | "positive";
  points: OcpPoint[];
  onChange: (points: OcpPoint[]) => void;
}) {
  function updatePoint(index: number, patch: Partial<OcpPoint>) {
    onChange(points.map((point, position) => (position === index ? { ...point, ...patch } : point)));
  }

  return (
    <section className="ocp-table" data-testid={testId}>
      <header>
        <h3>{title}</h3>
        <span className="meta">{electrode === "negative" ? "Ánodo" : "Cátodo"}</span>
      </header>
      <p className="meta">
        Filas de estequiometría y potencial del interpolante lineal. Se requieren al menos
        2 puntos con estequiometría creciente; sin datos se conserva Chayambuka2022.
      </p>
      <div className="ocp-row ocp-head">
        <span>Estequiometría (sto)</span>
        <span>Potencial (V)</span>
        <span />
      </div>
      {points.map((point, index) => (
        <div className="ocp-row" key={index}>
          <input
            aria-label={`Estequiometría de la fila ${index + 1}`}
            type="number"
            step="any"
            value={Number.isFinite(point.sto) ? point.sto : ""}
            onChange={(event) => updatePoint(index, { sto: parseOcpNumber(event.target.value) })}
          />
          <input
            aria-label={`Potencial de la fila ${index + 1}`}
            type="number"
            step="any"
            value={Number.isFinite(point.V) ? point.V : ""}
            onChange={(event) => updatePoint(index, { V: parseOcpNumber(event.target.value) })}
          />
          <button type="button" className="secondary" onClick={() => onChange(points.filter((_, position) => position !== index))}>
            Quitar
          </button>
        </div>
      ))}
      <div className="toolbar">
        <button type="button" className="secondary" onClick={() => onChange([...points, nextOcpPoint(points)])}>
          Agregar fila
        </button>
        <span className="meta">{points.length} {points.length === 1 ? "punto" : "puntos"}</span>
      </div>
    </section>
  );
}
