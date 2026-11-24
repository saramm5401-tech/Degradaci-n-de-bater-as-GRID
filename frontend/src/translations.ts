import type { ModelInfo, ParameterInfo } from "./types";

const PARAMETER_LABELS: Record<string, string> = {
  "Contact resistance [Ohm]": "Resistencia de contacto [Ω]",
  "Current function [A]": "Corriente aplicada [A]",
  "Electrode height [m]": "Altura del electrodo [m]",
  "Electrode width [m]": "Ancho del electrodo [m]",
  "Negative electrode thickness [m]": "Espesor del ánodo [m]",
  "Nominal cell capacity [A.h]": "Capacidad nominal de la celda [A·h]",
  "Positive electrode thickness [m]": "Espesor del cátodo [m]",
  "Separator thickness [m]": "Espesor del separador [m]",
  "Maximum concentration in negative electrode [mol.m-3]":
    "Concentración máxima en el ánodo [mol·m⁻³]",
  "Negative electrode Bruggeman coefficient (electrode)":
    "Coeficiente de Bruggeman del material activo del ánodo",
  "Negative electrode Bruggeman coefficient (electrolyte)":
    "Coeficiente de Bruggeman del electrolito en el ánodo",
  "Negative electrode OCP [V]": "Potencial de circuito abierto del ánodo [V]",
  "Negative electrode OCP entropic change [V.K-1]":
    "Cambio entrópico del potencial del ánodo [V·K⁻¹]",
  "Negative electrode active material volume fraction":
    "Fracción volumétrica de material activo del ánodo",
  "Negative electrode charge transfer coefficient":
    "Coeficiente de transferencia de carga del ánodo",
  "Negative electrode conductivity [S.m-1]": "Conductividad del ánodo [S·m⁻¹]",
  "Negative electrode exchange-current density [A.m-2]":
    "Densidad de corriente de intercambio del ánodo [A·m⁻²]",
  "Negative electrode porosity": "Porosidad del ánodo",
  "Negative particle diffusivity [m2.s-1]": "Difusividad en las partículas del ánodo [m²·s⁻¹]",
  "Negative particle radius [m]": "Radio de las partículas del ánodo [m]",
  "Maximum concentration in positive electrode [mol.m-3]":
    "Concentración máxima en el cátodo [mol·m⁻³]",
  "Positive electrode Bruggeman coefficient (electrode)":
    "Coeficiente de Bruggeman del material activo del cátodo",
  "Positive electrode Bruggeman coefficient (electrolyte)":
    "Coeficiente de Bruggeman del electrolito en el cátodo",
  "Positive electrode OCP [V]": "Potencial de circuito abierto del cátodo [V]",
  "Positive electrode OCP entropic change [V.K-1]":
    "Cambio entrópico del potencial del cátodo [V·K⁻¹]",
  "Positive electrode active material volume fraction":
    "Fracción volumétrica de material activo del cátodo",
  "Positive electrode charge transfer coefficient":
    "Coeficiente de transferencia de carga del cátodo",
  "Positive electrode conductivity [S.m-1]": "Conductividad del cátodo [S·m⁻¹]",
  "Positive electrode exchange-current density [A.m-2]":
    "Densidad de corriente de intercambio del cátodo [A·m⁻²]",
  "Positive electrode porosity": "Porosidad del cátodo",
  "Positive particle diffusivity [m2.s-1]": "Difusividad en las partículas del cátodo [m²·s⁻¹]",
  "Positive particle radius [m]": "Radio de las partículas del cátodo [m]",
  "Separator Bruggeman coefficient (electrolyte)":
    "Coeficiente de Bruggeman del electrolito en el separador",
  "Separator porosity": "Porosidad del separador",
  "Cation transference number": "Número de transferencia del catión",
  "Electrolyte conductivity [S.m-1]": "Conductividad del electrolito [S·m⁻¹]",
  "Electrolyte diffusivity [m2.s-1]": "Difusividad del electrolito [m²·s⁻¹]",
  "Initial concentration in electrolyte [mol.m-3]":
    "Concentración inicial del electrolito [mol·m⁻³]",
  "Thermodynamic factor": "Factor termodinámico",
  "Ambient temperature [K]": "Temperatura ambiente [K]",
  "Initial concentration in negative electrode [mol.m-3]":
    "Concentración inicial del ánodo [mol·m⁻³]",
  "Initial concentration in positive electrode [mol.m-3]":
    "Concentración inicial del cátodo [mol·m⁻³]",
  "Initial temperature [K]": "Temperatura inicial [K]",
  "Lower voltage cut-off [V]": "Límite inferior de voltaje [V]",
  "Number of cells connected in series to make a battery":
    "Número de celdas conectadas en serie",
  "Number of electrodes connected in parallel to make a cell":
    "Número de electrodos conectados en paralelo",
  "Open-circuit voltage at 0% SOC [V]": "Voltaje de circuito abierto al 0 % de carga [V]",
  "Open-circuit voltage at 100% SOC [V]": "Voltaje de circuito abierto al 100 % de carga [V]",
  "Reference temperature [K]": "Temperatura de referencia [K]",
  "Upper voltage cut-off [V]": "Límite superior de voltaje [V]",
};

const VARIABLE_LABELS: Record<string, string> = {
  "Negative particle concentration [mol.m-3]": "Concentración en las partículas del ánodo [mol·m⁻³]",
  "Negative particle surface concentration [mol.m-3]":
    "Concentración superficial de las partículas del ánodo [mol·m⁻³]",
  "Electrolyte concentration [mol.m-3]": "Concentración del electrolito [mol·m⁻³]",
  "Negative electrolyte concentration [mol.m-3]": "Concentración del electrolito en el ánodo [mol·m⁻³]",
  "Separator electrolyte concentration [mol.m-3]": "Concentración del electrolito en el separador [mol·m⁻³]",
  "Positive electrolyte concentration [mol.m-3]": "Concentración del electrolito en el cátodo [mol·m⁻³]",
  "Positive particle concentration [mol.m-3]": "Concentración en las partículas del cátodo [mol·m⁻³]",
  "Positive particle surface concentration [mol.m-3]":
    "Concentración superficial de las partículas del cátodo [mol·m⁻³]",
  "Current [A]": "Corriente [A]",
  "Current variable [A]": "Variable de corriente [A]",
  "Negative electrode potential [V]": "Potencial del ánodo [V]",
  "Electrolyte potential [V]": "Potencial del electrolito [V]",
  "Negative electrolyte potential [V]": "Potencial del electrolito en el ánodo [V]",
  "Separator electrolyte potential [V]": "Potencial del electrolito en el separador [V]",
  "Positive electrolyte potential [V]": "Potencial del electrolito en el cátodo [V]",
  "Positive electrode potential [V]": "Potencial del cátodo [V]",
  "Voltage [V]": "Voltaje de celda [V]",
  "Voltage expression [V]": "Expresión del voltaje [V]",
  "Battery voltage [V]": "Voltaje de la batería [V]",
  "Time [s]": "Tiempo [s]",
  "Discharge capacity [A.h]": "Capacidad descargada [A·h]",
  "Electrolyte concentration (x-average) [mol.m-3]":
    "Concentración media del electrolito [mol·m⁻³]",
  "Electrolyte potential (x-average) [V]": "Potencial medio del electrolito [V]",
  "Negative electrode potential (x-average) [V]": "Potencial medio del ánodo [V]",
  "Positive electrode potential (x-average) [V]": "Potencial medio del cátodo [V]",
  "Negative particle surface concentration (x-average) [mol.m-3]":
    "Concentración superficial media de las partículas del ánodo [mol·m⁻³]",
  "Positive particle surface concentration (x-average) [mol.m-3]":
    "Concentración superficial media de las partículas del cátodo [mol·m⁻³]",
  "Negative particle concentration (r-average, x-average) [mol.m-3]":
    "Concentración media en las partículas del ánodo [mol·m⁻³]",
  "Positive particle concentration (r-average, x-average) [mol.m-3]":
    "Concentración media en las partículas del cátodo [mol·m⁻³]",
  "Temperature [K]": "Temperatura [K]",
  "Resistance [Ohm]": "Resistencia [Ω]",
  "State of charge": "Estado de carga",
  "Degradation": "Degradación",
};

const FUNCTION_DESCRIPTIONS: Record<string, string> = {
  "HC open-circuit potential as a function of stochiometry, data taken from [1].":
    "Potencial de circuito abierto del carbono duro en función de la estequiometría; datos de la fuente [1].",
  "Exchange-current density for Butler-Volmer reactions between HC and NaPF6 in EC:PC.":
    "Densidad de corriente de intercambio para la reacción de Butler–Volmer entre carbono duro y NaPF₆ en EC:PC.",
  "HC diffusivity as a function of stochiometry, the data is taken from [1].":
    "Difusividad del carbono duro en función de la estequiometría; datos de la fuente [1].",
  "NVPF open-circuit potential as a function of stochiometry, data taken from [1].":
    "Potencial de circuito abierto de NVPF en función de la estequiometría; datos de la fuente [1].",
  "Exchange-current density for Butler-Volmer reactions between NVPF and NaPF6 in EC:PC.":
    "Densidad de corriente de intercambio para la reacción de Butler–Volmer entre NVPF y NaPF₆ en EC:PC.",
  "NVPF diffusivity as a function of stochiometry, the data is taken from [1].":
    "Difusividad de NVPF en función de la estequiometría; datos de la fuente [1].",
  "Conductivity of NaPF6 in EC:PC (1:1) as a function of ion concentration. The data comes from [1].":
    "Conductividad de NaPF₆ en EC:PC (1:1) en función de la concentración iónica; datos de la fuente [1].",
  "Diffusivity of NaPF6 in EC:PC (1:1) as a function of ion concentration. The data comes from [1]":
    "Difusividad de NaPF₆ en EC:PC (1:1) en función de la concentración iónica; datos de la fuente [1].",
};

const MODEL_NAMES: Record<string, string> = {
  sodium_ion: "Ion sodio",
  lithium_ion: "Ion litio",
  lfp: "Litio-ferrofosfato (LFP)",
  nmc: "Níquel-manganeso-cobalto (NMC)",
  lead_acid: "Plomo-ácido",
};

const MODEL_NOTES: Record<string, string[]> = {
  sodium_ion: [
    "BasicDFN utiliza las mismas ecuaciones DFN que el modelo de ion litio de Marquis et al., con el conjunto de parámetros Chayambuka2022 para ion sodio.",
    "La temperatura inicial es un dato, no una variable de estado. El modelo no incluye una ecuación térmica.",
    "No hay submodelos de degradación (SEI, deposición de sodio ni pérdida de material activo).",
    "El modelo no calcula resistencia. La resistencia de contacto está en el conjunto de parámetros, pero no interviene en el voltaje de celda.",
    "La corriente positiva representa descarga; esta es la convención de PyBaMM.",
    "El potencial de circuito abierto y la densidad de corriente de intercambio se pueden sustituir por tablas interpoladas según la estequiometría. Las difusividades y la conductividad del electrolito permanecen como en Chayambuka2022.",
  ],
};

const UNAVAILABLE_REASONS: Record<string, string> = {
  "Temperature [K]":
    "BasicDFN no calcula la temperatura. La temperatura inicial es un valor constante.",
  "Resistance [Ohm]":
    "BasicDFN no define una resistencia. No calcula V/I ni utiliza la resistencia de contacto, que no interviene en el voltaje de celda.",
  "State of charge":
    "BasicDFN no tiene una variable de estado de carga; los voltajes de circuito abierto al 0 % y al 100 % no intervienen en el modelo.",
  Degradation: "BasicDFN no incluye SEI, deposición de sodio ni pérdida de material activo.",
};

export function parameterLabel(name: string): string {
  return PARAMETER_LABELS[name] ?? name;
}

export function parameterDescription(parameter: ParameterInfo): string {
  if (parameter.function_summary) {
    return FUNCTION_DESCRIPTIONS[parameter.function_summary] ?? parameter.function_summary;
  }
  return translateTechnicalTerms(parameter.description);
}

export function categoryLabel(category: string): string {
  return ({
    Celda: "Celda",
    "Electrodo negativo": "Ánodo",
    "Electrodo positivo": "Cátodo",
    Separador: "Separador",
    Electrolito: "Electrolito",
    Experimento: "Condiciones del experimento",
  } as Record<string, string>)[category] ?? category;
}

export function variableLabel(name: string): string {
  return VARIABLE_LABELS[name] ?? name;
}

export function modelLabel(model: ModelInfo): string {
  return MODEL_NAMES[model.id] ?? model.name;
}

export function electrodeParameterLabel(name: string): string {
  const label = parameterLabel(name);
  return label.replace(/ (del|en el) ánodo.*/, "");
}

export function modelNote(model: ModelInfo, note: string): string {
  const knownNotes = MODEL_NOTES[model.id];
  if (!knownNotes) return note;
  const index = model.notes?.indexOf(note) ?? -1;
  return index >= 0 ? knownNotes[index] : note;
}

export function unavailableReason(name: string, reason: string): string {
  return UNAVAILABLE_REASONS[name] ?? reason;
}

export function terminationLabel(termination: string): string {
  if (/event/i.test(termination)) return "Finalizó al alcanzarse un límite del modelo.";
  if (/final time|final-time/i.test(termination)) return "Se alcanzó el tiempo final solicitado.";
  return termination.replace(/^successfully stopped\s*-\s*/i, "Finalizó correctamente: ");
}

export function translateTechnicalTerms(text: string): string {
  const parameterText = Object.entries(PARAMETER_LABELS)
    .sort(([left], [right]) => right.length - left.length)
    .reduce((translated, [name, label]) => translated.replaceAll(name, label), text);
  return parameterText
    .replaceAll("C-rate", "tasa C")
    .replaceAll("Open-circuit potential", "potencial de circuito abierto")
    .replaceAll("open-circuit potential", "potencial de circuito abierto")
    .replaceAll("exchange-current density", "densidad de corriente de intercambio")
    .replaceAll("Exchange-current density", "Densidad de corriente de intercambio")
    .replaceAll("Butler-Volmer", "Butler–Volmer")
    .replaceAll("stochiometry", "estequiometría")
    .replaceAll("stoichiometry", "estequiometría");
}
