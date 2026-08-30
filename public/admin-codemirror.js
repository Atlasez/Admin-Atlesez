import { basicSetup, EditorView } from "https://esm.sh/codemirror@6.0.2";
import { markdown } from "https://esm.sh/@codemirror/lang-markdown@6.3.4";
import {
  autocompletion,
  snippetCompletion,
} from "https://esm.sh/@codemirror/autocomplete@6.18.6";
import { openSearchPanel } from "https://esm.sh/@codemirror/search@6.5.10";

const activeEditors = new Map();
const valueDescriptor = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype,
  "value",
);
const nativeSetRangeText = HTMLTextAreaElement.prototype.setRangeText;
const nativeSetSelectionRange = HTMLTextAreaElement.prototype.setSelectionRange;

const mathCompletions = [
  snippetCompletion("\\frac{${numerator}}{${denominator}}", { label: "\\frac", detail: "分数" }),
  snippetCompletion("\\sqrt{${expression}}", { label: "\\sqrt", detail: "平方根" }),
  snippetCompletion("\\sqrt[${n}]{${expression}}", { label: "\\sqrt[n]", detail: "n乗根" }),
  snippetCompletion("\\binom{${n}}{${k}}", { label: "\\binom", detail: "二項係数" }),
  snippetCompletion("\\sum_{${i=1}}^{${n}} ${expression}", { label: "\\sum", detail: "総和" }),
  snippetCompletion("\\prod_{${i=1}}^{${n}} ${expression}", { label: "\\prod", detail: "総積" }),
  snippetCompletion("\\int_{${a}}^{${b}} ${expression}\\,\\mathrm{d}${x}", { label: "\\int", detail: "積分" }),
  snippetCompletion("\\lim_{${x\\to a}} ${expression}", { label: "\\lim", detail: "極限" }),
  snippetCompletion("\\begin{${pmatrix}}\n  ${a} & ${b} \\\\\n  ${c} & ${d}\n\\end{${pmatrix}}", { label: "\\begin", detail: "行列・環境" }),
  ...[
    ["\\alpha", "α"], ["\\beta", "β"], ["\\gamma", "γ"], ["\\delta", "δ"],
    ["\\epsilon", "ε"], ["\\theta", "θ"], ["\\lambda", "λ"], ["\\mu", "μ"],
    ["\\pi", "π"], ["\\sigma", "σ"], ["\\phi", "φ"], ["\\omega", "ω"],
    ["\\infty", "∞"], ["\\in", "集合への所属"], ["\\subseteq", "部分集合"],
    ["\\notin", "所属しない"], ["\\subset", "真部分集合"], ["\\cup", "和集合"], ["\\cap", "共通部分"],
    ["\\setminus", "差集合"], ["\\varnothing", "空集合"], ["\\forall", "全称記号"], ["\\exists", "存在記号"],
    ["\\leq", "以下"], ["\\geq", "以上"], ["\\neq", "等しくない"], ["\\approx", "近似"], ["\\equiv", "合同・同値"],
    ["\\sim", "相似・同値"], ["\\cong", "同型"], ["\\mapsto", "写像"], ["\\to", "写像・極限"],
    ["\\Rightarrow", "含意"], ["\\Leftrightarrow", "同値"], ["\\mathbb", "黒板太字"],
    ["\\mathrm", "ローマン体"], ["\\mathbf", "太字"], ["\\mathcal", "カリグラフィ体"], ["\\mathfrak", "フラクトゥール体"],
    ["\\text", "数式内の文章"], ["\\operatorname", "演算子名"], ["\\left", "自動サイズ括弧"], ["\\right", "自動サイズ括弧"],
    ["\\cdot", "ドット積"], ["\\times", "外積・乗算"], ["\\pm", "正負"], ["\\partial", "偏微分"], ["\\nabla", "ナブラ"],
    ["\\overline", "上線"], ["\\hat", "ハット"], ["\\vec", "ベクトル矢印"], ["\\underbrace", "下括弧"],
    ["\\log", "対数"], ["\\ln", "自然対数"], ["\\exp", "指数関数"], ["\\sin", "正弦"], ["\\cos", "余弦"], ["\\tan", "正接"],
    ["\\det", "行列式"], ["\\min", "最小値"], ["\\max", "最大値"], ["\\inf", "下限"], ["\\sup", "上限"],
    ["\\Hom", "準同型全体"], ["\\End", "自己準同型全体"], ["\\Aut", "自己同型全体"],
    ["\\GL", "一般線形群"], ["\\SL", "特殊線形群"], ["\\id", "恒等写像"],
    ["\\E", "期待値"], ["\\Var", "分散"], ["\\Cov", "共分散"], ["\\Prob", "確率"],
    ["\\Bern", "ベルヌーイ分布"], ["\\floor", "床関数"], ["\\ceil", "天井関数"],
    ["\\sgn", "符号関数"], ["\\supp", "台"], ["\\argmin", "最小点"], ["\\argmax", "最大点"],
    ["\\dist", "距離"], ["\\diam", "直径"], ["\\Area", "面積"], ["\\vol", "体積"], ["\\ang", "角度"],
  ].map(([label, detail]) => ({ label, detail, type: "keyword" })),
];

const dynamicMathCompletions = (textarea, source) => {
  const options = [];
  const workspace = textarea.closest("[data-editor-workspace]");
  const selectedPreset = workspace?.querySelector("select[data-math-preset] option:checked");
  try {
    const macros = JSON.parse(selectedPreset?.dataset.mathMacros ?? "{}");
    for (const command of Object.keys(macros))
      options.push({ label: command, detail: "選択中のプリセット", type: "keyword" });
  } catch {
    // A malformed data attribute must never disable the editor.
  }
  const declaration = /\\(?:newcommand|renewcommand|providecommand|DeclareMathOperator)\*?\s*(?:\{)?(\\[A-Za-z][A-Za-z0-9]*)|\\(?:def|gdef)\s*(\\[A-Za-z][A-Za-z0-9]*)/g;
  for (const match of source.matchAll(declaration))
    options.push({ label: match[1] ?? match[2], detail: "この記事のマクロ", type: "keyword" });
  return [...new Map(options.map((option) => [option.label, option])).values()];
};

const completeMath = (textarea) => (context) => {
  const word = context.matchBefore(/\\[A-Za-z]*/);
  const options = [...mathCompletions, ...dynamicMathCompletions(textarea, context.state.doc.toString())];
  if (!word && !context.explicit) return null;
  return {
    from: word?.from ?? context.pos,
    options,
    validFor: /\\[A-Za-z]*/,
  };
};

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
    scrollbarGutter: "stable",
    scrollbarWidth: "thin",
  },
  ".cm-content": {
    caretColor: "var(--editor-caret-color, var(--accent))",
    padding: "1rem 0",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--editor-caret-color, var(--accent))",
  },
  ".cm-search": {
    position: "relative",
  },
  ".cm-search button[name=close]": {
    alignItems: "center",
    border: "1px solid var(--border, #d5dde2)",
    borderRadius: ".35rem",
    color: "var(--text, #182027)",
    display: "inline-flex",
    fontSize: "1rem",
    justifyContent: "center",
    lineHeight: "1",
    minHeight: "2rem",
    minWidth: "2rem",
    padding: ".15rem .4rem",
  },
  ".cm-search button[name=close]:hover, .cm-search button[name=close]:focus-visible": {
    backgroundColor: "var(--accent, #176ea6)",
    color: "#fff",
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
    // Keep an active text selection visually distinct from the pale-red
    // locked-range overlay. The old accent-based mix inherited the site's
    // purple accent in some themes, which made selection look muddy.
    backgroundColor: "rgb(147 197 253 / 0.42)",
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
  // The editor owns its dark-mode colors. Prevent browser theme extensions
  // from inverting the white caret into a low-contrast dark caret.
  host.setAttribute("data-darkreader-ignore", "true");
  textarea.insertAdjacentElement("afterend", host);
  textarea.closest("[data-body-surface]")?.setAttribute("data-codemirror-ready", "true");

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
  let heightFrame = 0;

  const syncEditorHeight = () => {
    if (heightFrame) cancelAnimationFrame(heightFrame);
    heightFrame = requestAnimationFrame(() => {
      heightFrame = 0;
      // Keep the editor viewport fixed and let CodeMirror scroll internally.
      // Expanding to the full document height made long articles push the
      // workspace out of view and hid the only useful scrollbar.
      host.style.height = "clamp(32rem, 66vh, 52rem)";
      view.dom.style.height = "100%";
      view.scrollDOM.style.height = "100%";
      view.scrollDOM.style.overflowY = "auto";
      view.scrollDOM.style.scrollbarGutter = "stable";
    });
  };

  const decorateSearchPanel = () => {
    host.querySelectorAll(".cm-search button[name=close]").forEach((button) => {
      if (button.textContent !== "×") button.textContent = "×";
      if (button.getAttribute("aria-label") !== "本文検索を閉じる")
        button.setAttribute("aria-label", "本文検索を閉じる");
      if (button.getAttribute("title") !== "本文検索を閉じる")
        button.setAttribute("title", "本文検索を閉じる");
      if (!button.classList.contains("cm-search-close"))
        button.classList.add("cm-search-close");
    });
  };

  const view = new EditorView({
    doc: nativeValue(textarea),
    parent: host,
    extensions: [
      basicSetup,
      markdown(),
      EditorView.lineWrapping,
      autocompletion({ override: [completeMath(textarea)], activateOnTyping: true }),
      EditorView.contentAttributes.of({
        "aria-label": "本文（Markdown）",
        spellcheck: textarea.spellcheck ? "true" : "false",
      }),
      editorTheme,
      EditorView.updateListener.of((update) => {
        if (syncingFromTextarea) return;
        const selection = update.state.selection.main;
        if (update.docChanged) {
          const changes = [];
          update.changes.iterChanges((fromA, toA, _fromB, _toB, insert) => {
            changes.push({ from: fromA, to: toA, insert: insert.toString() });
          });
          setNativeValue(textarea, update.state.doc.toString());
          textarea.dispatchEvent(
            new CustomEvent("atlasez:body-change", {
              bubbles: true,
              detail: { changes },
            }),
          );
        }
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
        if (update.docChanged) syncEditorHeight();
        decorateSearchPanel();
      }),
      EditorView.domEventHandlers({
        keydown: (event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
            event.preventDefault();
            openSearchPanel(view);
            return true;
          }
          return false;
        },
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

  const forwardMacControlF = (event) => {
    if (/Mac|iPhone|iPad/i.test(navigator.platform) && event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "f") {
      event.preventDefault();
      event.stopPropagation();
      // CodeMirror's built-in search keymap uses Mod-F, which is Command-F
      // on macOS. Forward Control-F as the platform equivalent so both
      // shortcuts open the same native search panel.
      view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", {
        key: "f",
        code: "KeyF",
        keyCode: 70,
        which: 70,
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }));
    }
  };
  host.addEventListener("keydown", forwardMacControlF, true);

  syncEditorHeight();
  decorateSearchPanel();

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
    syncEditorHeight();
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

  const observer = new MutationObserver(() => {
    refreshRoot();
    decorateSearchPanel();
  });
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
