export function formatCollaborationLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const beforeField = trimmed.split("・", 1)[0]?.trim() ?? trimmed;
  const beforeDetail = beforeField.split("（", 1)[0]?.trim() ?? beforeField;
  return beforeDetail || trimmed;
}

const normalizeIdentityPart = (value: string): string =>
  value.trim().toLocaleLowerCase("ja-JP");

export function collaborationParticipantKey(
  email: string,
  displayName: string,
  knownEmailByName: ReadonlyMap<string, string> = new Map(),
): string {
  const normalizedEmail = normalizeIdentityPart(email);
  if (normalizedEmail) return `email:${normalizedEmail}`;

  const normalizedName = normalizeIdentityPart(displayName);
  const knownEmail = knownEmailByName.get(normalizedName);
  if (knownEmail) return `email:${knownEmail}`;
  return normalizedName ? `name:${normalizedName}` : "";
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
  const state = root?.querySelector<HTMLElement>("[data-collaboration-state]");
  if (!root || !list || list.dataset.clearCollaborationLabelsReady === "true") {
    return;
  }
  list.dataset.clearCollaborationLabelsReady = "true";
  installStyles(document);

  let updating = false;
  const update = () => {
    if (updating) return;
    updating = true;
    try {
      const chips = Array.from(list.children).filter(
        (chip): chip is HTMLElement => chip instanceof HTMLElement,
      );

      // Some editor features intentionally open more than one collaboration
      // WebSocket per browser (document sync and remote cursors). Older deployed
      // workers can therefore return the same person more than once. Build an
      // email alias for each visible name first so an email-less duplicate can
      // still be merged with the authenticated connection for that person.
      const knownEmailByName = new Map<string, string>();
      for (const chip of chips) {
        const email = normalizeIdentityPart(chip.title);
        const name = normalizeIdentityPart(
          formatCollaborationLabel(chip.textContent ?? ""),
        );
        if (email && name && !knownEmailByName.has(name)) {
          knownEmailByName.set(name, email);
        }
      }

      const seen = new Set<string>();
      for (const chip of chips) {
        const humanLabel = formatCollaborationLabel(chip.textContent ?? "");
        const key = collaborationParticipantKey(
          chip.title,
          humanLabel,
          knownEmailByName,
        );
        if (key && seen.has(key)) {
          chip.remove();
          continue;
        }
        if (key) seen.add(key);
        chip.dataset.humanLabel = humanLabel;
        chip.classList.remove("is-editing");
      }

      // The editor's primary renderer counts socket-level participants. Always
      // overwrite that value with the number of unique people actually shown.
      const uniqueCount = list.children.length;
      if (state && uniqueCount > 0) {
        state.textContent = `同時編集：${uniqueCount}人が接続中`;
      }
    } finally {
      updating = false;
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
