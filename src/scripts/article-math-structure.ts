const LABEL_TO_CLASS: Record<string, string> = {
  定義: "defi",
  命題: "prop",
  定理: "thm",
  補題: "lemma",
  系: "cor",
  例: "example",
};

const THEOREM_LEAD = /^(定義|命題|定理|補題|系|例)\s*(?:\d+|[（(:：．。\.])/u;
const PROOF_LEAD = /^証明(?:\s|[．。\.:：]|$)/u;

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

function initializePublishedMathStructure(): void {
  const article = document.querySelector<HTMLElement>("[data-pagefind-body]");
  const body = article?.querySelector<HTMLElement>(".article-body");
  const meta = article?.querySelector<HTMLElement>("[data-article-actions]");
  if (!body || meta?.dataset.subjectSlug !== "mathematics") return;
  normalizeMathArticleBody(body);
}

if (typeof document !== "undefined") {
  document.addEventListener(
    "astro:page-load",
    initializePublishedMathStructure,
  );
  initializePublishedMathStructure();
}
