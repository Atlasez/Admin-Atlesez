import { basicSetup, EditorView } from "https://esm.sh/codemirror@6.0.2";
import { markdown } from "https://esm.sh/@codemirror/lang-markdown@6.3.4";

const activeEditors = new Map();
const valueDescriptor = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype,
  "value",
);
const nativeSetRangeText = HTMLTextAreaElement.prototype.setRangeText;
const nativeSetSelectionRange = HTMLTextAreaElement.prototype.setSelectionRange;

const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--surface, #fcfdfe)",
    color: "var(--text)",
    fontFamily: "var(--font-mono)",
    fontSize: ".9rem",
    height: "clamp(32rem, 66vh, 52rem)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.7",
    overflow: "auto",
  },
  ".cm-content": {
    caretColor: "var(--accent)",
    padding: "1rem 0",
  },
  ".cm-line": { padding: "0 1rem" },
  ".cm-gutters": {
    backgroundColor: "var(--surface-alt)",
    border: "0",
    borderRight: "1px solid var(--border)",
    color: "var(--muted)",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--accent), transparent 95%)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "color-mix(in srgb, var(--accent), transparent 90%)",
    color: "var(--text)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent), transparent 78%)",
  },
});

const nativeValue = (textarea) =>
  String(valueDescriptor?.get?.call(textarea) ?? "");
const setNativeValue = (textarea, value) =>
  valueDescriptor?.set?.call(textarea, value);

const enhanceBodyEditor = (textarea) => {
  if (activeEditors.has(textarea) || !textarea.parentElement || !valueDescriptor)
    return;

  const host = document.createElement("div");
  host.dataset.bodyCodemirror = "true";
  host.className = "body-codemirror";
  textarea.insertAdjacentElement("afterend", host);

  textarea.dataset.bodyCodemirrorSource = "true";
  textarea.tabIndex = -1;
  textarea.setAttribute("aria-hidden", "true");
  Object.assign(textarea.style, {
    position: "absolute",
    inset: "auto 0 0 0",
    width: "100%",
    height: "clamp(32rem, 66vh, 52rem)",
    padding: "1rem",
    margin: "0",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
    resize: "none",
  });

  let syncingFromTextarea = false;

  const view = new EditorView({
    doc: nativeValue(textarea),
    parent: host,
    extensions: [
      basicSetup,
      markdown(),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        "aria-label": "本文（Markdown）",
        spellcheck: textarea.spellcheck ? "true" : "false",
      }),
      editorTheme,
      EditorView.updateListener.of((update) => {
        if (syncingFromTextarea) return;
        const selection = update.state.selection.main;
        if (update.docChanged)
          setNativeValue(textarea, update.state.doc.toString());
        nativeSetSelectionRange.call(
          textarea,
          selection.from,
          selection.to,
          "none",
        );
        if (update.docChanged)
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
        if (update.selectionSet)
          textarea.dispatchEvent(new Event("select", { bubbles: true }));
      }),
      EditorView.domEventHandlers({
        focus: () => {
          textarea.dataset.codemirrorFocused = "true";
          textarea.dispatchEvent(new FocusEvent("focus"));
          return false;
        },
        blur: () => {
          delete textarea.dataset.codemirrorFocused;
          textarea.dispatchEvent(new FocusEvent("blur"));
          return false;
        },
      }),
    ],
  });

  const syncViewFromTextarea = (scrollIntoView = false) => {
    const nextValue = nativeValue(textarea);
    const start = Math.min(textarea.selectionStart ?? 0, nextValue.length);
    const end = Math.min(textarea.selectionEnd ?? start, nextValue.length);
    const currentValue = view.state.doc.toString();
    const effects = scrollIntoView
      ? EditorView.scrollIntoView(end, { y: "center" })
      : undefined;

    syncingFromTextarea = true;
    try {
      view.dispatch({
        ...(currentValue === nextValue
          ? {}
          : {
              changes: {
                from: 0,
                to: view.state.doc.length,
                insert: nextValue,
              },
            }),
        selection: { anchor: start, head: end },
        ...(effects ? { effects } : {}),
      });
    } finally {
      syncingFromTextarea = false;
    }
  };

  Object.defineProperty(textarea, "value", {
    configurable: true,
    get() {
      return nativeValue(textarea);
    },
    set(value) {
      setNativeValue(textarea, String(value));
      syncViewFromTextarea();
    },
  });

  textarea.setRangeText = function (replacement, start, end, selectionMode) {
    if (start === undefined || end === undefined)
      nativeSetRangeText.call(this, replacement);
    else
      nativeSetRangeText.call(this, replacement, start, end, selectionMode);
    syncViewFromTextarea(true);
  };

  textarea.setSelectionRange = function (start, end, direction) {
    nativeSetSelectionRange.call(this, start, end, direction);
    syncViewFromTextarea(true);
  };

  textarea.focus = () => view.focus();

  Object.defineProperties(textarea, {
    scrollTop: {
      configurable: true,
      get: () => view.scrollDOM.scrollTop,
      set: (value) => {
        view.scrollDOM.scrollTop = Number(value) || 0;
      },
    },
    scrollLeft: {
      configurable: true,
      get: () => view.scrollDOM.scrollLeft,
      set: (value) => {
        view.scrollDOM.scrollLeft = Number(value) || 0;
      },
    },
    scrollHeight: {
      configurable: true,
      get: () => view.scrollDOM.scrollHeight,
    },
    clientHeight: {
      configurable: true,
      get: () => view.scrollDOM.clientHeight,
    },
  });

  view.scrollDOM.addEventListener(
    "scroll",
    () => textarea.dispatchEvent(new Event("scroll")),
    { passive: true },
  );

  const refreshRoot = () => {
    const nextRoot = view.dom.getRootNode();
    if (
      (nextRoot instanceof Document || nextRoot instanceof ShadowRoot) &&
      view.root !== nextRoot
    )
      view.setRoot(nextRoot);
  };

  const observer = new MutationObserver(refreshRoot);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  view.dom.addEventListener("pointerdown", refreshRoot);
  view.dom.addEventListener("focusin", refreshRoot);
  activeEditors.set(textarea, { view, observer, host });
};

const initializeCodeMirror = () => {
  document
    .querySelectorAll("[data-editor-workspace] textarea[data-body]")
    .forEach((textarea) => enhanceBodyEditor(textarea));
};

const destroyCodeMirror = () => {
  activeEditors.forEach(({ view, observer, host }, textarea) => {
    observer.disconnect();
    view.destroy();
    host.remove();
    delete textarea.dataset.codemirrorFocused;
  });
  activeEditors.clear();
};

document.addEventListener("astro:page-load", initializeCodeMirror);
document.addEventListener("astro:before-swap", destroyCodeMirror);

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", initializeCodeMirror, {
    once: true,
  });
else initializeCodeMirror();
