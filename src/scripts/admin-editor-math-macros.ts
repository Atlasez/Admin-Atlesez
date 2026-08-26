import * as katex from "katex";
import { mathMacrosFromSource } from "../lib/math-authoring.mjs";

export function extractDocumentMacros(source: string): Record<string, string> {
  const macros: Record<string, string> = {};
  const definition = /\\(?:gdef|def)\s*/g;
  let match: RegExpExecArray | null;

  while ((match = definition.exec(source))) {
    let cursor = match.index + match[0].length;
    if (source[cursor] !== "\\") continue;

    const commandMatch = /^\\(?:[A-Za-z@]+|.)/.exec(source.slice(cursor));
    if (!commandMatch) continue;
    const command = commandMatch[0];
    cursor += command.length;

    let parameters = "";
    while (cursor < source.length && source[cursor] !== "{") {
      const char = source[cursor];
      if (!/\s/.test(char)) parameters += char;
      cursor += 1;
    }
    if (source[cursor] !== "{") continue;

    const bodyStart = cursor + 1;
    let depth = 1;
    cursor += 1;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === "{" && source[cursor - 1] !== "\\") depth += 1;
      else if (source[cursor] === "}" && source[cursor - 1] !== "\\") depth -= 1;
      cursor += 1;
    }
    if (depth !== 0) continue;

    const replacement = source.slice(bodyStart, cursor - 1);
    if (!/^(?:#\d+)*$/.test(parameters)) continue;
    macros[command] = replacement;
    definition.lastIndex = cursor;
  }

  return macros;
}

export function macroSignature(macros: Record<string, string>): string {
  return JSON.stringify(
    Object.entries(macros).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function initializeDocumentMacros(): void {
  const root = document.querySelector<HTMLElement>("[data-editor-workspace]");
  const body = root?.querySelector<HTMLTextAreaElement>("[data-body]");
  const preview = root?.querySelector<HTMLElement>("[data-preview]");
  if (!root || !body || !preview || root.dataset.documentMacrosReady === "true") {
    return;
  }
  root.dataset.documentMacrosReady = "true";

  let scheduled = false;
  let rendering = false;

  const rerender = () => {
    scheduled = false;
    if (rendering) return;
    let customPresets: Record<string, { macros?: Record<string, string> }> = {};
    try {
      customPresets = JSON.parse(root.dataset.mathPresets ?? "{}");
    } catch {
      customPresets = {};
    }
    const macros = {
      ...mathMacrosFromSource(body.value, customPresets).macros,
      ...extractDocumentMacros(body.value),
    };
    if (!Object.keys(macros).length) return;
    const signature = macroSignature(macros);

    rendering = true;
    try {
      const targets = [
        preview,
        root.querySelector<HTMLElement>("[data-reference-preview]"),
      ].filter((item): item is HTMLElement => Boolean(item));

      for (const target of targets) {
        const rendered = [...target.querySelectorAll<HTMLElement>(".katex")];
        for (const node of rendered) {
          if (node.closest(".katex .katex")) continue;
          if (node.dataset.documentMacroSignature === signature) continue;
          const annotation = node.querySelector<HTMLElement>(
            'annotation[encoding="application/x-tex"]',
          );
          const tex = annotation?.textContent;
          if (!tex) continue;
          const displayMode = Boolean(node.closest(".katex-display"));

          const wrapper = document.createElement("span");
          wrapper.innerHTML = katex.renderToString(tex, {
            displayMode,
            macros: { ...macros },
            strict: "ignore",
            throwOnError: false,
          });
          const replacement = wrapper.firstElementChild as HTMLElement | null;
          if (!replacement) continue;
          // `renderToString` wraps display equations in `.katex-display`,
          // while the macro signature belongs to the inner `.katex` node that
          // this query visits on the next mutation pass.
          const signatureNode = replacement.matches(".katex")
            ? replacement
            : replacement.querySelector<HTMLElement>(".katex");
          signatureNode?.setAttribute("data-document-macro-signature", signature);
          replacement.dataset.documentMacroSignature = signature;
          node.replaceWith(replacement);
        }
      }
    } finally {
      rendering = false;
    }
  };

  const schedule = () => {
    if (scheduled || rendering) return;
    scheduled = true;
    window.requestAnimationFrame(rerender);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(preview, { childList: true, subtree: true });
  const referencePreview = root.querySelector<HTMLElement>("[data-reference-preview]");
  if (referencePreview) {
    observer.observe(referencePreview, { childList: true, subtree: true });
  }
  body.addEventListener("input", schedule);
  schedule();

  document.addEventListener(
    "astro:before-swap",
    () => observer.disconnect(),
    { once: true },
  );
}

if (typeof document !== "undefined") {
  document.addEventListener("astro:page-load", initializeDocumentMacros);
  initializeDocumentMacros();
}
