const theoremClasses = ["defi", "prop", "thm", "lemma", "cor", "example"];
const labelToClass: Record<string, string> = {
  定義: "defi",
  命題: "prop",
  定理: "thm",
  補題: "lemma",
  系: "cor",
  例: "example",
};

const theoremLead = /^(定義|命題|定理|補題|系|例)\s*(?:\d+|[（(:：．。\.])/u;
const proofLead = /^証明(?:\s|[．。\.:：]|$)/u;

function normalizeDirectiveTitle(wrapper: HTMLElement) {
  const directTitle = wrapper.querySelector<HTMLElement>(":scope > .thmtitle");
  if (!directTitle) return;
  let paragraph = wrapper.querySelector<HTMLParagraphElement>(":scope > p");
  if (!paragraph) {
    paragraph = wrapper.ownerDocument.createElement("p");
    wrapper.insertBefore(paragraph, wrapper.firstChild);
  }
  paragraph.insertBefore(directTitle, paragraph.firstChild);
  if (
    directTitle.nextSibling &&
    directTitle.nextSibling.nodeType === Node.TEXT_NODE &&
    !(directTitle.nextSibling.textContent ?? "").startsWith(" ")
  ) {
    directTitle.after(wrapper.ownerDocument.createTextNode(" "));
  }
}

function addPublishedTheoremLabel(wrapper: HTMLElement) {
  const paragraph = wrapper.querySelector<HTMLParagraphElement>(":scope > p");
  if (!paragraph || paragraph.querySelector(":scope > .thmtitle")) return;
  const firstText = [...paragraph.childNodes].find(
    (child) =>
      child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim(),
  );
  if (!firstText) return;
  const match = (firstText.textContent ?? "").match(
    /^(\s*(?:定義|命題|定理|補題|系|例)\s*(?:\d+\s*)?(?:[（(][^）)]*[）)])?\s*[.．。:：]?\s*)/u,
  );
  if (!match) return;
  const title = wrapper.ownerDocument.createElement("span");
  title.className = "thmtitle";
  title.textContent = match[1].trim();
  firstText.parentNode?.insertBefore(title, firstText);
  firstText.textContent = (firstText.textContent ?? "").slice(match[1].length);
}

function isMathBlock(node: Element) {
  return node.matches(
    ".defi,.prop,.thm,.lemma,.cor,.example,.math-definition,.math-theorem,.proof-details",
  );
}

export function enhancePublishedMathematics(target: HTMLElement) {
  if (target.dataset.previewSubject !== "mathematics") return;

  for (const wrapper of target.querySelectorAll<HTMLElement>(
    theoremClasses.map((name) => `:scope > .${name}`).join(","),
  )) {
    normalizeDirectiveTitle(wrapper);
    addPublishedTheoremLabel(wrapper);
  }

  const topLevel = () => [...target.children] as HTMLElement[];
  for (const node of topLevel()) {
    if (node.tagName !== "P" || node.closest(".proof-details")) continue;
    const text = (node.textContent ?? "").trim();
    const label = Object.keys(labelToClass).find(
      (candidate) => text.startsWith(candidate) && theoremLead.test(text),
    );
    if (!label) continue;

    const wrapper = target.ownerDocument.createElement("div");
    wrapper.className = labelToClass[label] ?? "math-theorem";
    node.replaceWith(wrapper);
    wrapper.append(node);
    addPublishedTheoremLabel(wrapper);

    let next = wrapper.nextElementSibling;
    let sawDisplayMath = false;
    while (next) {
      const nextText = (next.textContent ?? "").trim();
      if (
        ["H2", "H3"].includes(next.tagName) ||
        isMathBlock(next) ||
        (next.tagName === "P" && theoremLead.test(nextText)) ||
        (next.tagName === "P" && proofLead.test(nextText))
      ) {
        break;
      }
      if (next.matches(".katex-display,.math-display")) {
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
    if (
      node.tagName !== "P" ||
      !proofLead.test((node.textContent ?? "").trim())
    ) {
      continue;
    }
    const details = target.ownerDocument.createElement("details");
    details.className = "proof-details";
    const summary = target.ownerDocument.createElement("summary");
    summary.textContent = "証明.";
    const inner = target.ownerDocument.createElement("div");
    inner.className = "proof-details-inner";
    node.textContent = (node.textContent ?? "").replace(/^証明[。\.\s]*/u, "");
    node.parentNode?.insertBefore(details, node);
    details.append(summary, inner);
    inner.append(node);

    let next = details.nextElementSibling;
    while (next) {
      const nextText = (next.textContent ?? "").trim();
      if (
        ["H2", "H3"].includes(next.tagName) ||
        isMathBlock(next) ||
        (next.tagName === "P" && theoremLead.test(nextText)) ||
        (next.tagName === "P" && proofLead.test(nextText))
      ) {
        break;
      }
      const following = next.nextElementSibling;
      inner.append(next);
      next = following;
    }
  }
}
