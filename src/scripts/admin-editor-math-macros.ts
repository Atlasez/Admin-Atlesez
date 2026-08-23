import katex from "katex";

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
    const validParameters = /^(?:#\d+)*$/.test(parameters);
    if (!validParameters) continue;
    macros[command] = replacement;
    definition.lastIndex = cursor;
  }

  return macros;
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
    const macros = extractDocumentMacros(body.value);
    if (!Object.keys(macros).length) return;

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
          const annotation = node.querySelector<HTMLElement>(
            'annotation[encoding="application/x-tex"]',
          );
          const tex = annotation?.textContent;
          if (!tex) continue;
          const wrapper = document.createElement("span");
          wrapper.innerHTML = katex.renderToString(tex, {
            displayMode: false,
            macros: { ...macros },
            strict: "ignore",
            throwOnError: false,
          });
          const replacement = wrapper.firstElementChild;
          if (replacement) node.replaceWith(replacement);
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
  if (referencePreview) observer.observe(referencePreview, { childList: true, subtree: true });
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
