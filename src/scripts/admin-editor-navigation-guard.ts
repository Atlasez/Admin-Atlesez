const GUARD_BASE = "__atlasezEditorGuardBase";
const GUARD_TOP = "__atlasezEditorGuardTop";

function initializeNavigationGuard(): void {
  const root = document.querySelector<HTMLElement>("[data-editor-workspace]");
  const form = root?.querySelector<HTMLFormElement>("[data-document-form]");
  const saveMessage = root?.querySelector<HTMLOutputElement>("[data-save-message]");
  if (!root || !form || !saveMessage || root.dataset.navigationGuardReady === "true") {
    return;
  }
  root.dataset.navigationGuardReady = "true";

  const watchedNames = new Set([
    "subject",
    "category",
    "locale",
    "slug",
    "title",
    "summary",
    "conceptId",
    "body",
    "latexEngine",
    "status",
  ]);
  let dirty = false;
  let leaving = false;
  let lastSaveMessage = saveMessage.value;

  const markDirty = (event: Event) => {
    const target = event.target;
    if (
      (target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement) &&
      watchedNames.has(target.name)
    ) {
      dirty = true;
    }
  };
  form.addEventListener("input", markDirty);
  form.addEventListener("change", markDirty);

  const syncSavedState = () => {
    const message = saveMessage.value;
    if (message === lastSaveMessage) return;
    lastSaveMessage = message;
    if (/自動保存しました|保存しました|フィードバックを依頼しました/.test(message)) {
      dirty = false;
    }
  };
  const saveStateTimer = window.setInterval(syncSavedState, 250);

  const dialog = document.createElement("dialog");
  dialog.className = "editor-back-save-dialog";
  dialog.innerHTML = `
    <form method="dialog">
      <h2>保存してから戻りますか？</h2>
      <p>記事に未保存の変更があります。ブラウザの「戻る」で編集画面を離れる前に保存できます。</p>
      <output data-navigation-guard-message aria-live="polite"></output>
      <div class="editor-back-save-actions">
        <button type="submit" value="cancel" class="editor-back-save-cancel">編集を続ける</button>
        <button type="button" class="editor-back-save-confirm" data-navigation-save-back>保存して戻る</button>
      </div>
    </form>`;
  document.body.append(dialog);
  const message = dialog.querySelector<HTMLOutputElement>(
    "[data-navigation-guard-message]",
  )!;
  const saveAndBack = dialog.querySelector<HTMLButtonElement>(
    "[data-navigation-save-back]",
  )!;

  const style = document.createElement("style");
  style.textContent = `
    .editor-back-save-dialog{border:1px solid var(--border-default);border-radius:.8rem;box-shadow:0 1.25rem 4rem rgb(16 32 51/.25);color:var(--text-primary);max-width:min(92vw,30rem);padding:1.25rem}
    .editor-back-save-dialog::backdrop{background:rgb(16 32 51/.55)}
    .editor-back-save-dialog h2{margin:0 0 .55rem}.editor-back-save-dialog p{color:var(--text-secondary);line-height:1.65}
    .editor-back-save-actions{display:flex;flex-wrap:wrap;gap:.6rem;justify-content:flex-end;margin-top:1rem}.editor-back-save-actions button{border-radius:.45rem;cursor:pointer;font:inherit;font-size:.82rem;font-weight:800;min-height:2.35rem;padding:.42rem .68rem}
    .editor-back-save-cancel{background:var(--background-primary);border:1px solid var(--border-default);color:var(--text-primary)}.editor-back-save-confirm{background:var(--accent-primary);border:1px solid var(--accent-primary);color:#fff}
  `;
  document.head.append(style);

  const state = history.state && typeof history.state === "object" ? history.state : {};
  if (!state[GUARD_TOP]) {
    history.replaceState({ ...state, [GUARD_BASE]: true }, "", location.href);
    history.pushState({ ...state, [GUARD_TOP]: true }, "", location.href);
  }

  const waitForSave = () =>
    new Promise<boolean>((resolve) => {
      const started = Date.now();
      const timer = window.setInterval(() => {
        syncSavedState();
        if (!dirty && /自動保存しました|保存しました/.test(saveMessage.value)) {
          window.clearInterval(timer);
          resolve(true);
        } else if (
          /失敗|できませんでした|エラー/.test(saveMessage.value) ||
          Date.now() - started > 15_000
        ) {
          window.clearInterval(timer);
          resolve(false);
        }
      }, 120);
    });

  const leave = () => {
    leaving = true;
    dirty = false;
    dialog.close();
    history.go(-2);
  };

  saveAndBack.addEventListener("click", () => {
    if (!form.reportValidity()) {
      message.value = "必須項目を確認してから保存してください。";
      return;
    }
    saveAndBack.disabled = true;
    message.value = "保存中…";
    form.requestSubmit();
    void waitForSave().then((saved) => {
      saveAndBack.disabled = false;
      if (saved) leave();
      else message.value = saveMessage.value || "保存できませんでした。";
    });
  });

  const onPopState = () => {
    if (leaving) return;
    if (!dirty) {
      leave();
      return;
    }
    history.pushState({ ...(history.state ?? {}), [GUARD_TOP]: true }, "", location.href);
    if (!dialog.open) dialog.showModal();
  };
  window.addEventListener("popstate", onPopState);

  document.addEventListener(
    "astro:before-swap",
    () => {
      window.clearInterval(saveStateTimer);
      window.removeEventListener("popstate", onPopState);
      dialog.remove();
      style.remove();
    },
    { once: true },
  );
}

if (typeof document !== "undefined") {
  document.addEventListener("astro:page-load", initializeNavigationGuard);
  initializeNavigationGuard();
}
