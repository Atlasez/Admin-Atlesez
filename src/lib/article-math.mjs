import rehypeKatex from "rehype-katex";
import {
  MATH_PRESETS,
  mathMacrosFromSource,
  mathPresetIdsFromSource,
  parseTexMacroDefinitions,
  stripMathPresetMarker,
} from "./math-authoring.mjs";

export {
  MATH_PRESETS,
  mathMacrosFromSource,
  mathPresetIdsFromSource,
  parseTexMacroDefinitions,
  stripMathPresetMarker,
};

export function remarkArticleMathMacros(customPresets = {}) {
  return (tree, file) => {
    const source = String(file.value ?? "");
    const macros = mathMacrosFromSource(source, customPresets).macros;
    file.data.articleMathMacros = macros;
    const visit = (node, parent) => {
      if (!node) return;
      if (
        node.type === "html" &&
        /<!--\s*math-(?:preset|custom-preset):/i.test(node.value)
      )
        node.value = stripMathPresetMarker(node.value).replace(
          /<!--\s*math-custom-preset:[^>]*-->[\s\S]*?<!--\s*\/math-custom-preset\s*-->/gi,
          "",
        );
      if (
        (node.type === "math" || node.type === "inlineMath") &&
        typeof node.value === "string"
      ) {
        const { macros: localMacros, ranges } = parseTexMacroDefinitions(
          node.value,
        );
        Object.assign(macros, localMacros);
        if (ranges.length) {
          let value = node.value;
          for (const [from, to] of [...ranges].reverse())
            value = value.slice(0, from) + value.slice(to);
          node.value = value.trim();
          if (!node.value && parent?.children)
            parent.children = parent.children.filter((child) => child !== node);
        }
      }
      // Macro declarations are configuration, not article prose.  Markdown
      // parses declarations placed before the first heading as an ordinary
      // paragraph, so they used to leak into both the editor preview and the
      // published article.  Keep the declarations in `file.data` for KaTeX,
      // but remove them from text nodes.  Code blocks are intentionally left
      // untouched so documentation can still show a literal declaration.
      if (
        node.type !== "code" &&
        (node.type === "text" || node.type === "html") &&
        typeof node.value === "string"
      ) {
        const { ranges } = parseTexMacroDefinitions(node.value);
        if (ranges.length) {
          let value = node.value;
          for (const [from, to] of [...ranges].reverse())
            value = value.slice(0, from) + value.slice(to);
          node.value = value;
          if (!node.value.trim() && parent?.children)
            parent.children = parent.children.filter((child) => child !== node);
        }
      }
      for (const child of [...(node.children ?? [])]) visit(child, node);
      if (
        node.type !== "root" &&
        Array.isArray(node.children) &&
        node.children.length === 0 &&
        parent?.children
      )
        parent.children = parent.children.filter((child) => child !== node);
    };
    visit(tree, null);
  };
}

export function rehypeArticleKatex() {
  return (tree, file) =>
    rehypeKatex({
      throwOnError: false,
      strict: "warn",
      macros: { ...(file.data.articleMathMacros ?? {}) },
    })(tree, file);
}
