import { articleReferenceAnchor } from "../lib/article-references.mjs";

type ArticleReferenceIndexItem = { id: string; number: number };

const citationPattern = /\[\[cite:([A-Za-z0-9][A-Za-z0-9_-]*)\]\]/g;

function replaceCitations(
  body: HTMLElement,
  index: ArticleReferenceIndexItem[],
) {
  const numbers = new Map(
    index.map((item) => [item.id.toLowerCase(), item.number]),
  );
  const NodeFilterCtor = body.ownerDocument.defaultView?.NodeFilter;
  if (!NodeFilterCtor) return;
  const walker = body.ownerDocument.createTreeWalker(
    body,
    NodeFilterCtor.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        return parent &&
          !parent.closest("a,code,pre,script,style") &&
          /\[\[cite:[A-Za-z0-9][A-Za-z0-9_-]*\]\]/.test(node.textContent ?? "")
          ? NodeFilterCtor.FILTER_ACCEPT
          : NodeFilterCtor.FILTER_REJECT;
      },
    },
  );
  citationPattern.lastIndex = 0;
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  for (const textNode of textNodes) {
    const source = textNode.textContent ?? "";
    const fragment = body.ownerDocument.createDocumentFragment();
    let cursor = 0;
    citationPattern.lastIndex = 0;
    for (const match of source.matchAll(citationPattern)) {
      const id = match[1].toLowerCase();
      const number = numbers.get(id);
      fragment.append(source.slice(cursor, match.index));
      if (number) {
        const link = body.ownerDocument.createElement("a");
        link.className = "article-citation";
        link.href = `#${articleReferenceAnchor(id)}`;
        link.textContent = `[${number}]`;
        link.title = `参考文献 ${number}`;
        fragment.append(link);
      } else {
        const missing = body.ownerDocument.createElement("span");
        missing.className = "article-citation article-citation-missing";
        missing.textContent = match[0];
        missing.title = "この識別子の参考文献が記事に登録されていません";
        fragment.append(missing);
      }
      cursor = (match.index ?? 0) + match[0].length;
    }
    fragment.append(source.slice(cursor));
    textNode.replaceWith(fragment);
  }
}

function initializeArticleReferences() {
  const article = document.querySelector<HTMLElement>("[data-pagefind-body]");
  const body = article?.querySelector<HTMLElement>(".article-body");
  if (!body) return;
  let index: ArticleReferenceIndexItem[] = [];
  try {
    const serialized = document.querySelector<HTMLScriptElement>(
      "[data-article-reference-index]",
    )?.textContent;
    index = serialized ? JSON.parse(serialized) : [];
  } catch {
    index = [];
  }
  replaceCitations(body, index);
}

if (typeof document !== "undefined") {
  document.addEventListener("astro:page-load", initializeArticleReferences);
  initializeArticleReferences();
}
