const FIELD_LABELS: Record<string, string> = {
  title: "タイトルを編集中",
  summary: "要約を編集中",
  body: "本文を編集中",
};

export function formatCollaborationLabel(value: string): string {
  const parts = value.split("・").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return value;
  const [name, field, ...position] = parts;
  const label = FIELD_LABELS[field];
  if (!label) return value;
  const suffix = position.length ? `（${position.join("・")}）` : "";
  return `${name}（${label}${suffix}）`;
}

function initializeCollaborationLabels(): void {
  const root = document.querySelector<HTMLElement>("[data-editor-workspace]");
  const list = root?.querySelector<HTMLElement>("[data-collaboration-participants]");
  if (!root || !list || list.dataset.clearCollaborationLabelsReady === "true") return;
  list.dataset.clearCollaborationLabelsReady = "true";

  let updating = false;
  const update = () => {
    if (updating) return;
    updating = true;
    try {
      for (const chip of Array.from(list.children)) {
        if (!(chip instanceof HTMLElement)) continue;
        const current = chip.textContent ?? "";
        const formatted = formatCollaborationLabel(current);
        if (formatted !== current) chip.textContent = formatted;
      }
    } finally {
      updating = false;
    }
  };

  const observer = new MutationObserver(update);
  observer.observe(list, { childList: true, subtree: true, characterData: true });
  update();
  document.addEventListener("astro:before-swap", () => observer.disconnect(), { once: true });
}

if (typeof document !== "undefined") {
  document.addEventListener("astro:page-load", initializeCollaborationLabels);
  initializeCollaborationLabels();
}
