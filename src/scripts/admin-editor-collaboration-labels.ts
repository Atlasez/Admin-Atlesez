export function formatCollaborationLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const beforeField = trimmed.split("・", 1)[0]?.trim() ?? trimmed;
  const beforeDetail = beforeField.split("（", 1)[0]?.trim() ?? beforeField;
  return beforeDetail || trimmed;
}

function installStyles(doc: Document): void {
  if (doc.querySelector("style[data-collaboration-human-labels]")) return;
  const style = doc.createElement("style");
  style.dataset.collaborationHumanLabels = "true";
  style.textContent = `
    [data-collaboration-participants] > span[data-human-label] {
      font-size: 0 !important;
    }
    [data-collaboration-participants] > span[data-human-label]::after {
      content: attr(data-human-label);
      font-size: .66rem;
    }
  `;
  doc.head.append(style);
}

function initializeCollaborationLabels(): void {
  const root = document.querySelector<HTMLElement>("[data-editor-workspace]");
  const list = root?.querySelector<HTMLElement>("[data-collaboration-participants]");
  if (!root || !list || list.dataset.clearCollaborationLabelsReady === "true") {
    return;
  }
  list.dataset.clearCollaborationLabelsReady = "true";
  installStyles(document);

  const update = () => {
    for (const chip of Array.from(list.children)) {
      if (!(chip instanceof HTMLElement)) continue;
      const current = chip.textContent ?? "";
      chip.dataset.humanLabel = formatCollaborationLabel(current);
      chip.classList.remove("is-editing");
    }
  };

  const observer = new MutationObserver(update);
  observer.observe(list, { childList: true, subtree: true, characterData: true });
  update();
  document.addEventListener(
    "astro:before-swap",
    () => observer.disconnect(),
    { once: true },
  );
}

if (typeof document !== "undefined") {
  document.addEventListener("astro:page-load", initializeCollaborationLabels);
  initializeCollaborationLabels();
}
