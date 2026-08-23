const FIELD_LABELS: Record<string, string> = {
  title: "タイトルを編集中",
  summary: "要約を編集中",
  body: "本文を編集中",
};

export function formatCollaborationLabel(value: string): string {
  const parts = value
    .split("・")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return value;
  const [name, field, ...position] = parts;
  const label = FIELD_LABELS[field];
  if (!label) return value;
  const suffix = position.length ? `（${position.join("・")}）` : "";
  return `${name}（${label}${suffix}）`;
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
      const formatted = formatCollaborationLabel(current);
      if (formatted !== current) chip.dataset.humanLabel = formatted;
      else delete chip.dataset.humanLabel;
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
