const LABEL_TO_CLASS: Record<string, string> = {
  定義: "defi",
  命題: "prop",
  定理: "thm",
  補題: "lemma",
  系: "cor",
  例: "example",
};

const CLASS_TO_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(LABEL_TO_CLASS).map(([label, className]) => [
    className,
    label,
  ]),
);

const THEOREM_LEAD = /^(定義|命題|定理|補題|系|例)\s*(?:\d+|[（(:：．。\.])/u;
const PROOF_LEAD = /^証明(?:\s|[．。\.:：]|$)/u;

export type ArticleStatementReference = {
  id: string;
  articleId: string;
  locale: string;
  articleTitle: string;
  label: string;
  number: number;
  href?: string;
};

export type ArticleStatementReferenceIndex = ArticleStatementReference[];

const isHeading = (node: Element) => ["H2", "H3"].includes(node.tagName);
const isTheoremLead = (node: Element) =>
  node.tagName === "P" && THEOREM_LEAD.test((node.textContent ?? "").trim());
const isProofLead = (node: Element) =>
  node.tagName === "P" && PROOF_LEAD.test((node.textContent ?? "").trim());
const isMathBlock = (node: Element) =>
  node.matches(
    ".defi,.prop,.thm,.lemma,.cor,.example,.math-definition,.math-theorem,.proof-details,[data-directive]",
  );

function addTheoremLabel(wrapper: HTMLElement): void {
  const paragraph = wrapper.querySelector<HTMLElement>(":scope > p");
  if (!paragraph || paragraph.querySelector(":scope > .thmtitle")) return;
  const firstText = [...paragraph.childNodes].find(
    (child) =>
      child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim(),
  );
  if (!firstText) return;
  const labelMatch = (firstText.textContent ?? "").match(
    /^(\s*(?:定義|命題|定理|補題|系|例)\s*(?:\d+\s*)?(?:[（(][^）)]*[）)])?\s*[.．。:：]?\s*)/u,
  );
  if (!labelMatch) return;
  const label = labelMatch[1];
  const title = wrapper.ownerDocument.createElement("span");
  title.className = "thmtitle";
  title.textContent = label.trim();
  firstText.parentNode?.insertBefore(title, firstText);
  firstText.textContent = (firstText.textContent ?? "").slice(label.length);
}

/**
 * Normalize legacy/plain mathematics prose into the semantic article box DOM.
 * The function is idempotent: authored directive boxes and already-normalized
 * nodes are left untouched. It is shared by the public article and Admin Preview.
 */
export function normalizeMathArticleBody(mathBody: HTMLElement): void {
  const topLevel = () => [...mathBody.children] as HTMLElement[];

  for (const node of topLevel()) {
    if (
      node.tagName !== "P" ||
      node.closest(
        ".defi,.prop,.thm,.lemma,.cor,.example,.proof-details,[data-directive]",
      )
    )
      continue;
    const text = (node.textContent ?? "").trim();
    const label = Object.keys(LABEL_TO_CLASS).find(
      (candidate) => text.startsWith(candidate) && THEOREM_LEAD.test(text),
    );
    if (!label) continue;

    const wrapper = mathBody.ownerDocument.createElement("div");
    wrapper.className = LABEL_TO_CLASS[label] ?? "math-theorem";
    node.replaceWith(wrapper);
    wrapper.append(node);
    addTheoremLabel(wrapper);

    let next = wrapper.nextElementSibling;
    let sawDisplayMath = false;
    while (next) {
      if (
        isHeading(next) ||
        isMathBlock(next) ||
        isTheoremLead(next) ||
        isProofLead(next)
      )
        break;
      if (next.matches(".katex-display")) {
        const following = next.nextElementSibling;
        wrapper.append(next);
        next = following;
        sawDisplayMath = true;
        continue;
      }
      if (next.tagName === "OL" || next.tagName === "UL") {
        const following = next.nextElementSibling;
        wrapper.append(next);
        next = following;
        continue;
      }
      if (sawDisplayMath && next.tagName === "P") wrapper.append(next);
      break;
    }
  }

  for (const node of topLevel()) {
    if (!isProofLead(node)) continue;
    const details = mathBody.ownerDocument.createElement("details");
    details.className = "proof-details";
    details.open = true;
    const summary = mathBody.ownerDocument.createElement("summary");
    summary.textContent = "証明.";
    const inner = mathBody.ownerDocument.createElement("div");
    inner.className = "proof-details-inner";
    const first = node.firstChild;
    if (
      first?.nodeType === Node.ELEMENT_NODE &&
      (first as HTMLElement).tagName === "STRONG"
    )
      first.remove();
    else
      node.textContent = (node.textContent ?? "").replace(
        /^証明[。\.\s]*/u,
        "",
      );
    node.parentNode?.insertBefore(details, node);
    details.append(summary, inner);
    inner.append(node);

    let next = details.nextElementSibling;
    while (
      next &&
      !isHeading(next) &&
      !isMathBlock(next) &&
      !isTheoremLead(next) &&
      !isProofLead(next)
    ) {
      const following = next.nextElementSibling;
      inner.append(next);
      next = following;
    }
  }
}

function statementLabel(wrapper: HTMLElement): string | null {
  const directive = wrapper.dataset.directive;
  const byDirective: Record<string, string> = {
    defi: "定義",
    definition: "定義",
    prop: "命題",
    proposition: "命題",
    thm: "定理",
    theorem: "定理",
    lemma: "補題",
    cor: "系",
    corollary: "系",
    example: "例",
  };
  if (directive && byDirective[directive]) return byDirective[directive];
  return (
    Object.entries(CLASS_TO_LABEL).find(([className]) =>
      wrapper.classList.contains(className),
    )?.[1] ?? null
  );
}

function authoredStatementTitle(title: HTMLElement, label: string): string {
  if (title.dataset.authoredStatementTitle !== undefined)
    return title.dataset.authoredStatementTitle;
  const source = title.textContent?.trim() ?? "";
  const withoutNumber = source
    .replace(new RegExp(`^${label}\\s*\\d*\\s*[.．。:：]?\\s*`, "u"), "")
    .trim();
  const authored = withoutNumber
    .replace(/[.．。:：]\s*$/u, "")
    .replace(/^[（(]\s*(.*?)\s*[）)]$/u, "$1")
    .trim();
  title.dataset.authoredStatementTitle = authored;
  return authored;
}

/** Number definitions, propositions, theorems, lemmas, corollaries and examples in reading order. */
export function numberMathStatements(
  mathBody: HTMLElement,
  options: {
    articleId?: string;
    locale?: string;
    statementIndex?: ArticleStatementReferenceIndex;
  } = {},
): void {
  // Mathematical statement boxes share one counter within an article.  The
  // number therefore follows reading order regardless of whether the box is
  // a definition, proposition, theorem, lemma, corollary, or example.
  let statementNumber = 0;
  const statements = mathBody.querySelectorAll<HTMLElement>(
    ".defi,.prop,.thm,.lemma,.cor,.example",
  );
  for (const wrapper of statements) {
    const label = statementLabel(wrapper);
    const title = wrapper.querySelector<HTMLElement>(
      ":scope > .thmtitle, :scope > p > .thmtitle",
    );
    if (!label || !title) continue;
    const number = ++statementNumber;
    const authored = authoredStatementTitle(title, label);
    const visible = `${label}${number}${authored ? `(${authored})` : ""}`;
    title.textContent = visible;
    wrapper.dataset.statementNumber = String(number);
    wrapper.dataset.statementLabel = label;
  }

  const NodeFilterCtor = mathBody.ownerDocument.defaultView?.NodeFilter;
  if (!NodeFilterCtor) return;
  const walker = mathBody.ownerDocument.createTreeWalker(
    mathBody,
    NodeFilterCtor.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        return parent &&
          !parent.closest("a,code,pre,script,style,.thmtitle") &&
          /\[\[ref:[A-Za-z][A-Za-z0-9_-]*\]\]/.test(node.textContent ?? "")
          ? NodeFilterCtor.FILTER_ACCEPT
          : NodeFilterCtor.FILTER_REJECT;
      },
    },
  );
  const references: Text[] = [];
  while (walker.nextNode()) references.push(walker.currentNode as Text);
  const index = options.statementIndex ?? [];
  for (const textNode of references) {
    const fragment = mathBody.ownerDocument.createDocumentFragment();
    const source = textNode.textContent ?? "";
    let cursor = 0;
    for (const match of source.matchAll(
      /\[\[ref:([A-Za-z][A-Za-z0-9_-]*)\]\]/g,
    )) {
      fragment.append(source.slice(cursor, match.index));
      const target = mathBody.ownerDocument.getElementById(match[1]);
      if (target?.dataset.statementNumber && target.dataset.statementLabel) {
        const link = mathBody.ownerDocument.createElement("a");
        link.className = "math-statement-reference";
        link.href = `#${match[1]}`;
        link.textContent = `${target.dataset.statementLabel}${target.dataset.statementNumber}`;
        fragment.append(link);
      } else {
        const candidates = index.filter((item) => item.id === match[1]);
        const sameArticle = candidates.find(
          (item) => item.articleId === options.articleId,
        );
        const sameLocale = candidates.filter(
          (item) => !options.locale || item.locale === options.locale,
        );
        const external =
          sameArticle ??
          (sameLocale.length === 1
            ? sameLocale[0]
            : candidates.length === 1
              ? candidates[0]
              : undefined);
        if (external?.href) {
          const link = mathBody.ownerDocument.createElement("a");
          link.className =
            "math-statement-reference math-statement-reference-external";
          link.href = `${external.href}#${encodeURIComponent(external.id)}`;
          link.textContent = `${external.articleTitle}:${external.label}${external.number}`;
          fragment.append(link);
        } else fragment.append(match[0]);
      }
      cursor = (match.index ?? 0) + match[0].length;
    }
    fragment.append(source.slice(cursor));
    textNode.replaceWith(fragment);
  }
}

function initializePublishedMathStructure(): void {
  const article = document.querySelector<HTMLElement>("[data-pagefind-body]");
  const body = article?.querySelector<HTMLElement>(".article-body");
  const meta = article?.querySelector<HTMLElement>("[data-article-actions]");
  if (!body || meta?.dataset.subjectSlug !== "mathematics") return;
  normalizeMathArticleBody(body);
  let statementIndex: ArticleStatementReferenceIndex = [];
  try {
    const serialized = document.querySelector<HTMLScriptElement>(
      "[data-article-statement-index]",
    )?.textContent;
    statementIndex = serialized ? JSON.parse(serialized) : [];
  } catch {
    statementIndex = [];
  }
  numberMathStatements(body, {
    articleId: meta.dataset.articleId,
    locale: meta.dataset.locale,
    statementIndex,
  });
}

if (typeof document !== "undefined") {
  document.addEventListener(
    "astro:page-load",
    initializePublishedMathStructure,
  );
  initializePublishedMathStructure();
}
