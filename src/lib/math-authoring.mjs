/** Browser- and server-safe helpers shared by the editor preview and Markdown build. */
export const MATH_PRESETS = {
  standard: {
    label: "標準（集合・数）",
    macros: {
      "\\N": "\\mathbb{N}",
      "\\Z": "\\mathbb{Z}",
      "\\Q": "\\mathbb{Q}",
      "\\R": "\\mathbb{R}",
      "\\C": "\\mathbb{C}",
      "\\set": "\\left\\{#1\\right\\}",
      "\\abs": "\\left|#1\\right|",
      "\\norm": "\\left\\lVert#1\\right\\rVert",
      "\\inner": "\\left\\langle#1,#2\\right\\rangle",
    },
  },
  calculus: {
    label: "微分積分",
    macros: {
      "\\dd": "\\,\\mathrm{d}#1",
      "\\dv": "\\frac{\\mathrm{d}#1}{\\mathrm{d}#2}",
      "\\pdv": "\\frac{\\partial #1}{\\partial #2}",
      "\\grad": "\\nabla",
      "\\divergence": "\\nabla\\mathbin{\\cdot}",
    },
  },
  linear: {
    label: "線形代数",
    macros: {
      "\\mat": "\\begin{pmatrix}#1\\end{pmatrix}",
      "\\transpose": "{}^{\\mathsf{T}}",
      "\\rank": "\\operatorname{rank}",
      "\\Ker": "\\operatorname{Ker}",
      "\\Image": "\\operatorname{Im}",
    },
  },
  algebra: {
    label: "代数・写像",
    macros: {
      "\\Hom": "\\operatorname{Hom}",
      "\\End": "\\operatorname{End}",
      "\\Aut": "\\operatorname{Aut}",
      "\\GL": "\\operatorname{GL}",
      "\\SL": "\\operatorname{SL}",
      "\\id": "\\mathrm{id}",
      "\\im": "\\operatorname{im}",
      "\\coker": "\\operatorname{coker}",
    },
  },
  probability: {
    label: "確率・統計",
    macros: {
      "\\E": "\\mathbb{E}",
      "\\Var": "\\operatorname{Var}",
      "\\Cov": "\\operatorname{Cov}",
      "\\Prob": "\\mathbb{P}",
      "\\iid": "\\mathrel{\\perp\\!\\!\\!\\perp}",
      "\\Bern": "\\operatorname{Bern}",
    },
  },
  analysis: {
    label: "解析・関数",
    macros: {
      "\\floor": "\\left\\lfloor#1\\right\\rfloor",
      "\\ceil": "\\left\\lceil#1\\right\\rceil",
      "\\sgn": "\\operatorname{sgn}",
      "\\supp": "\\operatorname{supp}",
      "\\argmin": "\\operatorname*{arg\\,min}",
      "\\argmax": "\\operatorname*{arg\\,max}",
    },
  },
  geometry: {
    label: "幾何・図形",
    macros: {
      "\\dist": "\\operatorname{dist}",
      "\\diam": "\\operatorname{diam}",
      "\\Area": "\\operatorname{Area}",
      "\\vol": "\\operatorname{vol}",
      "\\ang": "\\angle",
    },
  },
};

const DEFAULT_MACROS = {
  // Backward-compatible operator used by existing mathematics articles.
  // Keep it in the shared defaults so the public renderer and editor preview
  // understand older articles even when no matching preset is selected.
  "\\Spec": "\\operatorname{Spec}",
  "\\dv": "\\frac{\\mathrm{d}#1}{\\mathrm{d}#2}",
  "\\dvtwo": "\\frac{\\mathrm{d}^{2}#1}{\\mathrm{d}#2^{2}}",
  "\\dd": "\\,\\mathrm{d}#1",
  "\\vdot": "\\mathbin{\\cdot}",
  "\\divergence": "\\nabla\\mathbin{\\cdot}",
};
const PRESET_MARKER = /<!--\s*math-preset:\s*([a-z0-9-]+)\s*-->/gi;
const PRESET_SOURCE_BLOCK =
  /<!--\s*math-preset:\s*[a-z0-9-]+\s*-->\s*(?:<!--\s*math-custom-preset:[^>]*-->[\s\S]*?<!--\s*\/math-custom-preset\s*-->\s*)?/gi;
const commandName = /\\(?:[A-Za-z@]+|.)/y;

function skipSpace(source, index) {
  while (/\s/.test(source[index] ?? "")) index += 1;
  return index;
}
function readGroup(source, start, open = "{", close = "}") {
  if (source[start] !== open) return null;
  let depth = 1;
  let index = start + 1;
  while (index < source.length && depth) {
    if (source[index] === open && source[index - 1] !== "\\") depth += 1;
    if (source[index] === close && source[index - 1] !== "\\") depth -= 1;
    index += 1;
  }
  return depth
    ? null
    : { value: source.slice(start + 1, index - 1), end: index };
}
function readCommandName(source, start) {
  let index = skipSpace(source, start);
  if (source[index] === "{") {
    const group = readGroup(source, index);
    return !group || !/^\\(?:[A-Za-z@]+|.)$/.test(group.value.trim())
      ? null
      : { name: group.value.trim(), end: group.end };
  }
  commandName.lastIndex = index;
  const match = commandName.exec(source);
  return match ? { name: match[0], end: commandName.lastIndex } : null;
}

export function parseTexMacroDefinitions(source) {
  /** @type {Record<string, string>} */ const macros = {};
  const ranges = [];
  const declaration =
    /\\(?:newcommand\*?|renewcommand\*?|providecommand\*?|DeclareMathOperator\*?|gdef|def)\b/g;
  let match;
  while ((match = declaration.exec(source))) {
    const kind = match[0].slice(1);
    let index = skipSpace(source, declaration.lastIndex);
    const start = match.index;
    if (kind.startsWith("DeclareMathOperator")) {
      const name = readCommandName(source, index);
      if (!name) continue;
      index = skipSpace(source, name.end);
      const body = readGroup(source, index);
      if (!body) continue;
      macros[name.name] =
        `${kind.endsWith("*") ? "\\operatorname*" : "\\operatorname"}{${body.value}}`;
      ranges.push([start, body.end]);
      declaration.lastIndex = body.end;
      continue;
    }
    const name = readCommandName(source, index);
    if (!name) continue;
    index = skipSpace(source, name.end);
    if (source[index] === "[") {
      const parameters = readGroup(source, index, "[", "]");
      if (!parameters || !/^\d+$/.test(parameters.value.trim())) continue;
      index = skipSpace(source, parameters.end);
    } else if (kind === "def" || kind === "gdef") {
      const parameters = source.slice(index).match(/^(?:#\d+)*/)?.[0] ?? "";
      if (parameters && !/^(?:#\d+)*$/.test(parameters)) continue;
      index = skipSpace(source, index + parameters.length);
    }
    const body = readGroup(source, index);
    if (!body) continue;
    macros[name.name] = body.value;
    ranges.push([start, body.end]);
    declaration.lastIndex = body.end;
  }
  return { macros, ranges };
}

export function mathPresetFromSource(source, customPresets = {}) {
  return mathPresetIdsFromSource(source, customPresets)[0] ?? "";
}
export function mathPresetIdsFromSource(source, customPresets = {}) {
  PRESET_MARKER.lastIndex = 0;
  return [...source.matchAll(PRESET_MARKER)]
    .map((match) => match[1])
    .filter((id) => MATH_PRESETS[id] || customPresets[id]);
}
export function mathMacrosFromSource(source, customPresets = {}) {
  const presets = mathPresetIdsFromSource(source, customPresets);
  const parsed = parseTexMacroDefinitions(source);
  const presetMacros = presets.reduce((macros, id) => {
    const preset = MATH_PRESETS[id] || customPresets[id];
    if (preset?.macros) Object.assign(macros, preset.macros);
    return macros;
  }, {});
  return {
    preset: presets[0] ?? "",
    presets,
    macros: {
      ...DEFAULT_MACROS,
      ...presetMacros,
      ...parsed.macros,
    },
  };
}
export function stripTexMacroDefinitions(source) {
  const { ranges } = parseTexMacroDefinitions(source);
  let result = source;
  for (const [from, to] of [...ranges].reverse())
    result = result.slice(0, from) + result.slice(to);
  return result.trim();
}
export function stripMathPresetMarker(source) {
  PRESET_SOURCE_BLOCK.lastIndex = 0;
  return source.replace(PRESET_SOURCE_BLOCK, "");
}
