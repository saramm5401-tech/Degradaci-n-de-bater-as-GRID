import { useState } from "react";
import { unzipSync } from "fflate";

type CurveRow = {
  sto: number;
  value: number;
};

type CurveKind = "ocp" | "exchange-current";

type WorkbookTable = {
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: unknown[][];
  stoColumn: number;
  valueColumn: number;
};

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

function parseXml(bytes: Uint8Array, path: string): XMLDocument {
  const document = new DOMParser().parseFromString(
    new TextDecoder().decode(bytes),
    "application/xml",
  );
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error(`No se pudo leer la estructura de ${path}.`);
  }
  return document;
}

function workbookPath(target: string): string {
  const segments: string[] = [];
  for (const segment of (target.startsWith("/") ? target.slice(1) : `xl/${target}`).split("/")) {
    if (segment === "..") segments.pop();
    else if (segment !== "" && segment !== ".") segments.push(segment);
  }
  return segments.join("/");
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase();
  if (!letters) throw new Error(`Referencia de celda inválida: ${reference}.`);
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function parseWorkbook(bytes: Uint8Array): { sheetName: string; rows: unknown[][] } {
  const files = unzipSync(bytes);
  const getFile = (path: string) => {
    const file = files[path];
    if (!file) throw new Error(`El Excel no contiene ${path}.`);
    return file;
  };
  const workbook = parseXml(getFile("xl/workbook.xml"), "xl/workbook.xml");
  const sheet = workbook.getElementsByTagNameNS(MAIN_NS, "sheet")[0];
  if (!sheet) throw new Error("El archivo no contiene hojas.");
  const sheetId = sheet.getAttributeNS(REL_NS, "id");
  if (!sheetId) throw new Error("No se encontró la referencia a la primera hoja.");

  const relationships = parseXml(
    getFile("xl/_rels/workbook.xml.rels"),
    "xl/_rels/workbook.xml.rels",
  );
  const relationship = Array.from(
    relationships.getElementsByTagNameNS(PACKAGE_REL_NS, "Relationship"),
  ).find((item) => item.getAttribute("Id") === sheetId);
  const target = relationship?.getAttribute("Target");
  if (!target) throw new Error("No se encontró el archivo de la primera hoja.");
  const worksheetPath = workbookPath(target);
  const worksheet = parseXml(getFile(worksheetPath), worksheetPath);

  const sharedEntry = files["xl/sharedStrings.xml"];
  const sharedStrings = sharedEntry
    ? Array.from(parseXml(sharedEntry, "xl/sharedStrings.xml").getElementsByTagNameNS(MAIN_NS, "si"))
      .map((item) =>
        Array.from(item.getElementsByTagNameNS(MAIN_NS, "t"))
          .map((text) => text.textContent ?? "")
          .join(""),
      )
    : [];
  const rows: unknown[][] = [];
  for (const row of Array.from(worksheet.getElementsByTagNameNS(MAIN_NS, "row"))) {
    const values: unknown[] = [];
    for (const cell of Array.from(row.getElementsByTagNameNS(MAIN_NS, "c"))) {
      const reference = cell.getAttribute("r") ?? "";
      const index = columnIndex(reference);
      const type = cell.getAttribute("t");
      const value = cell.getElementsByTagNameNS(MAIN_NS, "v")[0]?.textContent ?? "";
      let parsed: unknown = value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : value;
      if (type === "s") {
        parsed = sharedStrings[Number(value)] ?? "";
      } else if (type === "inlineStr") {
        parsed = Array.from(cell.getElementsByTagNameNS(MAIN_NS, "t"))
          .map((text) => text.textContent ?? "")
          .join("");
      }
      values[index] = parsed;
    }
    if (values.some((value) => value != null && value !== "")) rows.push(values);
  }
  return { sheetName: sheet.getAttribute("name") ?? "Hoja 1", rows };
}

function normalizedHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function suggestedColumns(headers: string[], kind: CurveKind): [number, number] {
  const stoColumn = headers.findIndex((header) =>
    /\b(sto|stoichiometry|stoichiometria|soc)\b/.test(normalizedHeader(header)),
  );
  const valuePattern =
    kind === "ocp"
      ? /(ocp|open.?circuit|potential|potencial|voltage|voltaje|u_[np])/
      : /(exchange|intercambio|j0|density|densidad|k_[np])/;
  const valueColumn = headers.findIndex((header) => valuePattern.test(normalizedHeader(header)));
  const x = stoColumn >= 0 ? stoColumn : 0;
  const y = valueColumn >= 0 && valueColumn !== x
    ? valueColumn
    : headers.findIndex((_header, index) => index !== x);
  return [x, y >= 0 ? y : x];
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function ExcelCurveUpload({
  id,
  title,
  kind,
  pointCount,
  onImport,
  onClear,
}: {
  id: string;
  title: string;
  kind: CurveKind;
  pointCount: number;
  onImport: (points: CurveRow[]) => void;
  onClear: () => void;
}) {
  const [table, setTable] = useState<WorkbookTable | null>(null);
  const [error, setError] = useState("");

  async function loadFile(file: File) {
    setError("");
    try {
      if (file.size > 25 * 1024 * 1024) {
        throw new Error("El archivo supera el límite de 25 MB.");
      }
      const { sheetName, rows } = parseWorkbook(new Uint8Array(await file.arrayBuffer()));
      if (rows.length < 3 || rows[0].length < 2) {
        throw new Error("La primera hoja debe tener encabezados y al menos dos filas de datos.");
      }
      if (!rows[0].some((value) => typeof value === "string" && value.trim() !== "")) {
        throw new Error("La primera fila debe contener los nombres de las columnas.");
      }
      const headers = rows[0].map((value, index) =>
        value == null || String(value).trim() === "" ? `Columna ${index + 1}` : String(value),
      );
      const [stoColumn, valueColumn] = suggestedColumns(headers, kind);
      if (stoColumn === valueColumn) {
        throw new Error("No se encontraron dos columnas distintas para interpolar.");
      }
      setTable({
        fileName: file.name,
        sheetName,
        headers,
        rows: rows.slice(1),
        stoColumn,
        valueColumn,
      });
    } catch (reason) {
      setTable(null);
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  function applyTable() {
    if (!table) return;
    const points: CurveRow[] = [];
    for (const row of table.rows) {
      const sto = numericValue(row[table.stoColumn]);
      const value = numericValue(row[table.valueColumn]);
      if (sto == null && value == null) continue;
      if (sto == null || value == null) {
        setError("Hay filas con valores incompletos o no numéricos en las columnas elegidas.");
        return;
      }
      points.push({ sto, value });
    }
    if (points.length < 2) {
      setError("Se necesitan al menos dos pares numéricos para interpolar.");
      return;
    }
    for (let index = 1; index < points.length; index += 1) {
      if (points[index].sto <= points[index - 1].sto) {
        setError("La columna de estequiometría debe estar en orden estrictamente creciente.");
        return;
      }
    }
    if (kind === "exchange-current" && points.some((point) => point.value <= 0)) {
      setError("La densidad de corriente de intercambio debe ser mayor que cero.");
      return;
    }
    onImport(points);
    setError("");
  }

  function updateColumn(column: "stoColumn" | "valueColumn", value: string) {
    if (!table) return;
    setTable({ ...table, [column]: Number(value) });
  }

  const fieldId = `excel-${id}`;

  return (
    <div className="excel-upload">
      <label className="field" htmlFor={fieldId}>
        {title}
        <input
          id={fieldId}
          type="file"
          accept=".xlsx,.xlsm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void loadFile(file);
          }}
        />
      </label>
      {table && (
        <div className="excel-column-pickers">
          <span className="meta" title={table.fileName}>
            {table.fileName} · {table.sheetName}
          </span>
          <label className="field">
            Columna de estequiometría (sto)
            <select
              value={table.stoColumn}
              onChange={(event) => updateColumn("stoColumn", event.target.value)}
            >
              {table.headers.map((header, index) => (
                <option key={`${header}-${index}`} value={index}>{header}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Columna de {kind === "ocp" ? "potencial de circuito abierto (V)" : "densidad de corriente de intercambio (j₀, A/m²)"}
            <select
              value={table.valueColumn}
              onChange={(event) => updateColumn("valueColumn", event.target.value)}
            >
              {table.headers.map((header, index) => (
                <option key={`${header}-${index}`} value={index}>{header}</option>
              ))}
            </select>
          </label>
          <button type="button" className="secondary" onClick={applyTable}>
            Aplicar {table.rows.length} filas
          </button>
        </div>
      )}
      {pointCount > 0 && (
        <div className="toolbar">
          <span className="meta ok">{pointCount} puntos activos.</span>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setTable(null);
              onClear();
            }}
          >
            Quitar tabla
          </button>
        </div>
      )}
      {error && <p className="warn" role="alert">{error}</p>}
    </div>
  );
}
