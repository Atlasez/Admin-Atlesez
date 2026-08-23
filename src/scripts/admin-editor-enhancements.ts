const EDITOR_GUARD_BASE = "__atlasezEditorGuardBase";
const EDITOR_GUARD_TOP = "__atlasezEditorGuardTop";

const DIRECTIVE_LABELS: Record<string, string> = {
  defi: "定義",
  definition: "定義",
  thm: "定理",
  theorem: "定理",
  prop: "命題",
  proposition: "命題",
  cor: "系",
  corollary: "系",
  lemma: "補題",
  proof: "証明",
  example: "例",
  exercise: "演習",
  remark: "補足",
  note: "注",
  warning: "注意",
  tip: "ヒント",
};

export type DirectiveMarker = {
  fence: string;
  name: string;
  title: string;
};

export function parseDirectiveMarker(value: string): DirectiveMarker | null {
  const match = /^\s*(:{3,4})\s*([A-Za-z][A-Za-z0-9_-]*)(?:\s+(.+?))?\s*$/.exec(value);
  if (!match) return null;
  const name = match[2].toLowerCase();
  const rawTitle = (match[3] ?? "").trim().replace(/^\[|\]$/g, "").replace(/^['"]|['"]$/g, "");
  return {
    fence: match[1],
    name,
    title: rawTitle || DIRECTIVE_LABELS[name] || name,
  };
}

export function subjectHue(subject: string): number {
  let hash = 0;
  for (const char of subject) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

function isClosingDirective(value: string, minimumLength: number): boolean {
  const match = /^\s*(:{3,4})\s*$/.exec(value);
  return Boolean(match && match[1].length >= minimumLength);
}

function enhanceDirectiveBoxes(target: HTMLElement): void {
  const originalChildren = Array.from(target.children);
  const stack: Array<{ body: HTMLElement; fenceLength: number }> = [];

  for (const node of originalChildren) {
    if (!(node instanceof HTMLElement)) continue;
    const text = node.textContent?.trim() ?? "";
    const marker = node.tagName === "P" ? parseDirectiveMarker(text) : null;

    if (marker) {
      const section = document.createElement("section");
      section.className = `editor-directive editor-directive-${marker.name.replace(/[^a-z0-9_-]/g, "")}`;
      section.dataset.directive = marker.name;

      const heading = document.createElement("div");
      heading.className = "editor-directive-heading";
      heading.textContent = marker.title;

      const content = document.createElement("div");
      content.className = "editor-directive-body";
      section.append(heading, content);

      if (stack.length) stack.at(-1)!.body.append(section);
      else node.replaceWith(section);
      if (node.isConnected) node.remove();
      stack.push({ body: content, fenceLength: marker.fence.length });
      continue;
    }

    if (stack.length && node.tagName === "P" && isClosingDirective(text, stack.at(-1)!.fenceLength)) {
      node.remove();
      stack.pop();
      continue;
    }

    if (stack.length) stack.at(-1)!.body.append(node);
  }
}

function installStyles(): void {
  if (document.querySelector("style[data-admin-editor-enhancements]")) return;
  const style = document.createElement("style");
  style.dataset.adminEditorEnhancements = "true";
  style.textContent = `
    .article-preview[data-editor-enhanced-preview="true"] {
      --editor-preview-accent: hsl(var(--editor-preview-hue, 210) 58% 38%);
      --editor-preview-soft: hsl(var(--editor-preview-hue, 210) 64% 96%);
      background: var(--surface, var(--background-primary, #fff));
      border-top: 3px solid var(--editor-preview-accent);
      line-height: 1.8;
      padding: clamp(.9rem, 2vw, 1.5rem);
    }
    .article-preview[data-editor-enhanced-preview="true"] h2 {
      border-bottom: 1px solid color-mix(in srgb, var(--editor-preview-accent) 35%, var(--border, #d5dde2));
      color: var(--editor-preview-accent);
      padding-bottom: .28rem;
    }
    .article-preview[data-editor-enhanced-preview="true"] h3 {
      border-left: 3px solid var(--editor-preview-accent);
      padding-left: .55rem;
    }
    .article-preview[data-editor-enhanced-preview="true"] a { color: var(--editor-preview-accent); }
    .editor-preview-subject-badge {
      color: var(--muted, var(--text-secondary, #596773));
      display: inline-flex;
      font-size: .68rem;
      font-weight: 800;
      margin-left: .45rem;
    }
    .editor-directive {
      --directive-accent: var(--editor-preview-accent);
      background: color-mix(in srgb, var(--directive-accent) 6%, var(--surface, #fff));
      border: 1px solid color-mix(in srgb, var(--directive-accent) 45%, var(--border, #d5dde2));
      border-left: 4px solid var(--directive-accent);
      margin: 1rem 0;
    }
    .editor-directive-heading {
      background: color-mix(in srgb, var(--directive-accent) 11%, transparent);
      color: var(--directive-accent);
      font-size: .82rem;
      font-weight: 900;
      letter-spacing: .02em;
      padding: .45rem .7rem;
    }
    .editor-directive-body { padding: .25rem .75rem .65rem; }
    .editor-directive-body > :first-child { margin-top: .55rem; }
    .editor-directive-body > :last-child { margin-bottom: .25rem; }
    .editor-directive[data-directive="defi"], .editor-directive[data-directive="definition"] { --directive-accent: hsl(210 62% 39%); }
    .editor-directive[data-directive="thm"], .editor-directive[data-directive="theorem"] { --directive-accent: hsl(278 48% 41%); }
    .editor-directive[data-directive="prop"], .editor-directive[data-directive="proposition"] { --directive-accent: hsl(160 52% 32%); }
    .editor-directive[data-directive="cor"], .editor-directive[data-directive="corollary"] { --directive-accent: hsl(28 68% 38%); }
    .editor-back-save-dialog {
      border: 1px solid var(--border-default, #d5dde2);
      border-radius: .8rem;
      box-shadow: 0 1.25rem 4rem rgb(16 32 51 / .25);
      color: var(--text-primary, #182027);
      max-width: min(92vw, 30rem);
      padding: 1.25rem;
    }
    .editor-back-save-dialog::backdrop { background: rgb(16 32 51 / .55); }
    .editor-back-save-dialog h2 { margin: 0 0 .55rem; }
    .editor-back-save-dialog p { color: var(--text-secondary, #596773); line-height: 1.65; }
    .editor-back-save-dialog output { color: var(--danger, #a03123); display: block; min-height: 1.25rem; }
    .editor-back-save-actions { display: flex; flex-wrap: wrap; gap: .6rem; justify-content: flex-end; margin-top: 1rem; }
    .editor-back-save-actions button { border-radius: .45rem; cursor: pointer; font: inherit; font-size: .82rem; font-weight: 800; min-height: 2.35rem; padding: .42rem .68rem; }
    .editor-back-save-cancel { background: var(--background-primary, #fff); border: 1px solid var(--border-default, #d5dde2); color: var(--text-primary, #182027); }
    .editor-back-save-confirm { background: var(--accent-primary, #176ea6); border: 1px solid var(--accent-primary, #176ea6); color: #fff; }
  `;
  document.head.append(style);
}

function createBackSaveDialog(): HTMLDialogElement {
  const existing = document.querySelector<HTMLDialogElement>("[data-editor-back-save-dialog]");
  if (existing) return existing;
  const dialog = document.createElement("dialog");
  dialog.className = "editor-back-save-dialog";
  dialog.dataset.editorBackSaveDialog = "true";
  dialog.innerHTML = `
    <form method="dialog">
      <h2>保存してから戻りますか？</h2>
      <p>記事に未保存の変更があります。ブラウザの「戻る」で編集画面を離れる前に保存できます。</p>
      <output data-editor-back-save-message aria-live="polite"></output>
      <div class="editor-back-save-actions">
        <button type="submit" value="cancel" class="editor-back-save-cancel">編集を続ける</button>
        <button type="button" class="editor-back-save-confirm" data-editor-save-and-back>保存して戻る</button>
      </div>
    </form>`;
  document.body.append(dialog);
  return dialog;
}

function initializeEditorEnhancements(): void {
  const root = document.querySelector<HTMLElement>("[data-editor-workspace]");
  if (!root || root.dataset.editorEnhancementsReady === "true") return;
  root.dataset.editorEnhancementsReady = "true";
  installStyles();

  const form = root.querySelector<HTMLFormElement>("[data-document-form]");
  const subject = root.querySelector<HTMLSelectElement>("[data-subject]");
  const preview = root.querySelector<HTMLElement>("[data-preview]");
  const referencePreview = root.querySelector<HTMLElement>("[data-reference-preview]");
  const saveMessage = root.querySelector<HTMLOutputElement>("[data-save-message]");
  if (!form || !subject || !preview || !saveMessage) return;

  const abort = new AbortController();
  const { signal } = abort;
  let previewScheduled = false;
  let dirty = false;
  let leavingByChoice = false;
  let promptAfterForward = false;
  let lastSaveMessage = saveMessage.value;

  const subjectBadge = document.createElement("span");
  subjectBadge.className = "editor-preview-subject-badge";
  const previewHeading = root.querySelector<HTMLElement>("#preview-heading");
  previewHeading?.insertAdjacentElement("afterend", subjectBadge);

  const applyPreviewEnhancements = () => {
    previewScheduled = false;
    const subjectSlug = subject.value || "general";
    preview.dataset.editorEnhancedPreview = "true";
    preview.dataset.previewSubject = subjectSlug;
    preview.style.setProperty("--editor-preview-hue", String(subjectHue(subjectSlug)));
    const subjectName = subject.selectedOptions[0]?.textContent?.trim() || subjectSlug;
    subjectBadge.textContent = `分野CSS: ${subjectName}`;
    enhanceDirectiveBoxes(preview);
    if (referencePreview) enhanceDirectiveBoxes(referencePreview);
  };
  const schedulePreviewEnhancements = () => {
    if (previewScheduled) return;
    previewScheduled = true;
    queueMicrotask(applyPreviewEnhancements);
  };

  const previewObserver = new MutationObserver(schedulePreviewEnhancements);
  previewObserver.observe(preview, { childList: true, subtree: true });
  if (referencePreview) previewObserver.observe(referencePreview, { childList: true, subtree: true });
  subject.addEventListener("input", schedulePreviewEnhancements, { signal });
  subject.addEventListener("change", schedulePreviewEnhancements, { signal });
  schedulePreviewEnhancements();

  const watchedNames = new Set(["subject", "category", "locale", "slug", "title", "summary", "conceptId", "body", "latexEngine", "status"]);
  form.addEventListener("input", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
      if (watchedNames.has(target.name)) dirty = true;
    }
  }, { signal });
  form.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
      if (watchedNames.has(target.name)) dirty = true;
    }
  }, { signal });

  const syncSaveState = () => {
    const message = saveMessage.value;
    if (message === lastSaveMessage) return;
    lastSaveMessage = message;
    if (/自動保存しました|保存しました|フィードバックを依頼しました/.test(message)) dirty = false;
  };
  const saveStateTimer = window.setInterval(syncSaveState, 250);

  const currentState = history.state && typeof history.state === "object" ? history.state : {};
  if (!currentState[EDITOR_GUARD_TOP]) {
    history.replaceState({ ...currentState, [EDITOR_GUARD_BASE]: true }, "", location.href);
    history.pushState({ ...currentState, [EDITOR_GUARD_TOP]: true }, "", location.href);
  }

  const dialog = createBackSaveDialog();
  const dialogMessage = dialog.querySelector<HTMLOutputElement>("[data-editor-back-save-message]")!;
  const saveAndBack = dialog.querySelector<HTMLButtonElement>("[data-editor-save-and-back]")!;

  const leaveEditor = () => {
    leavingByChoice = true;
    dirty = false;
    dialog.close();
    root.querySelector<HTMLDialogElement>("[data-progress-dialog]")?.close();
    history.go(-2);
  };

  const waitForSave = () => new Promise<boolean>((resolve) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      syncSaveState();
      const message = saveMessage.value;
      if (!dirty && /自動保存しました|保存しました|フィードバックを依頼しました/.test(message)) {
        window.clearInterval(timer);
        resolve(true);
      } else if (/失敗|できませんでした|エラー/.test(message) || Date.now() - started > 15_000) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, 120);
  });

  saveAndBack.addEventListener("click", () => {
    if (!form.reportValidity()) {
      dialogMessage.value = "必須項目を確認してから保存してください。";
      return;
    }
    saveAndBack.disabled = true;
    dialogMessage.value = "保存中…";
    form.requestSubmit();
    void waitForSave().then((saved) => {
      saveAndBack.disabled = false;
      if (saved) leaveEditor();
      else dialogMessage.value = saveMessage.value || "保存できませんでした。編集画面に戻って確認してください。";
    });
  }, { signal });

  window.addEventListener("popstate", (event) => {
    if (leavingByChoice) return;
    const state = event.state && typeof event.state === "object" ? event.state : {};
    if (state[EDITOR_GUARD_TOP]) {
      if (promptAfterForward) {
        promptAfterForward = false;
        dialogMessage.value = "";
        if (!dialog.open) dialog.showModal();
      }
      return;
    }
    if (!state[EDITOR_GUARD_BASE]) return;
    syncSaveState();
    if (!dirty) {
      leavingByChoice = true;
      history.back();
      return;
    }
    promptAfterForward = true;
    history.forward();
  }, { signal });

  document.addEventListener("astro:before-swap", () => {
    abort.abort();
    previewObserver.disconnect();
    window.clearInterval(saveStateTimer);
    dialog.remove();
  }, { once: true });
}

if (typeof document !== "undefined") {
  document.addEventListener("astro:page-load", initializeEditorEnhancements);
  initializeEditorEnhancements();
}
