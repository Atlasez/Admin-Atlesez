import {
  isDirectiveClose,
  parseDirectiveMarker,
  type DirectiveMarker,
} from "../lib/editor-directives";
import {
  normalizeMathArticleBody,
  numberMathStatements,
} from "./article-math-structure";

const SEMANTIC_DIRECTIVE_CLASSES: Record<string, string> = {
  defi: "defi",
  definition: "defi",
  prop: "prop",
  proposition: "prop",
  thm: "thm",
  theorem: "thm",
  lemma: "lemma",
  cor: "cor",
  corollary: "cor",
  example: "example",
};

type DirectiveContainer = {
  section: HTMLElement;
  body: HTMLElement;
  fenceLength: number;
  headingLine?: HTMLParagraphElement;
  heading?: HTMLElement;
};

function semanticDirectiveClass(name: string): string | null {
  return SEMANTIC_DIRECTIVE_CLASSES[name] ?? null;
}

function createDirectiveContainer(
  doc: Document,
  marker: DirectiveMarker,
): DirectiveContainer {
  if (marker.name === "proof") {
    const details = doc.createElement("details");
    details.className = "proof-details";
    details.dataset.directive = marker.name;
    details.open = true;
    const summary = doc.createElement("summary");
    summary.textContent = marker.title;
    const body = doc.createElement("div");
    body.className = "proof-details-inner";
    details.append(summary, body);
    return { section: details, body, fenceLength: marker.fence.length };
  }

  const section = doc.createElement("section");
  const safeName = marker.name.replace(/[^a-z0-9_-]/g, "");
  section.className = `article-directive article-directive-${safeName}`;
  section.dataset.directive = marker.name;
  if (marker.id && semanticDirectiveClass(marker.name)) {
    section.id = marker.id;
    section.dataset.statementId = marker.id;
  }

  const semanticClass = semanticDirectiveClass(marker.name);
  if (semanticClass) {
    section.classList.add(semanticClass);
    const headingLine = doc.createElement("p");
    const heading = doc.createElement("span");
    heading.className = "thmtitle";
    heading.textContent = marker.title;
    headingLine.append(heading);
    section.append(headingLine);
    return {
      section,
      body: section,
      fenceLength: marker.fence.length,
      headingLine,
      heading,
    };
  }

  const heading = doc.createElement("div");
  heading.className = "article-directive-title";
  heading.textContent = marker.title;
  const body = doc.createElement("div");
  body.className = "article-directive-body";
  section.append(heading, body);
  return { section, body, fenceLength: marker.fence.length };
}

function appendDirectiveChild(container: DirectiveContainer, node: HTMLElement) {
  if (container.headingLine && container.heading && node.tagName === "P") {
    node.insertBefore(container.heading, node.firstChild);
    container.headingLine.replaceWith(node);
    container.headingLine = undefined;
    return;
  }
  container.body.append(node);
}

function convertPackedDirectiveParagraph(node: HTMLElement): boolean {
  if (node.tagName !== "P") return false;
  const plainLines = (node.textContent ?? "").replace(/\r\n/g, "\n").split("\n");
  if (plainLines.length < 2) return false;

  const marker = parseDirectiveMarker(plainLines[0]);
  if (!marker) return false;
  const closeIndex = plainLines.findIndex(
    (line, index) => index > 0 && isDirectiveClose(line, marker.fence.length),
  );
  if (closeIndex < 0) return false;

  const container = createDirectiveContainer(node.ownerDocument, marker);
  const bodyText = plainLines.slice(1, closeIndex).join("\n").trim();
  if (bodyText) {
    const paragraph = node.ownerDocument.createElement("p");
    paragraph.textContent = bodyText;
    appendDirectiveChild(container, paragraph);
  }

  const replacements: Node[] = [container.section];
  const trailingText = plainLines.slice(closeIndex + 1).join("\n").trim();
  if (trailingText) {
    const trailing = node.ownerDocument.createElement("p");
    trailing.textContent = trailingText;
    replacements.push(trailing);
  }
  node.replaceWith(...replacements);
  return true;
}

/** Compatibility fallback for imported HTML produced without the shared remark plugin. */
export function enhancePreviewDirectives(target: HTMLElement): void {
  const HTMLElementCtor = target.ownerDocument.defaultView?.HTMLElement;
  if (!HTMLElementCtor) return;

  for (const child of Array.from(target.children)) {
    if (child instanceof HTMLElementCtor) convertPackedDirectiveParagraph(child as HTMLElement);
  }

  const children = Array.from(target.children);
  const stack: DirectiveContainer[] = [];
  for (const child of children) {
    if (!(child instanceof HTMLElementCtor)) continue;
    const node = child as HTMLElement;
    if (node.matches("[data-directive]")) continue;

    const text = node.textContent?.trim() ?? "";
    const marker = node.tagName === "P" ? parseDirectiveMarker(text) : null;
    if (marker) {
      const container = createDirectiveContainer(target.ownerDocument, marker);
      if (stack.length > 0) {
        appendDirectiveChild(stack.at(-1)!, container.section);
        node.remove();
      } else {
        node.replaceWith(container.section);
      }
      stack.push(container);
      continue;
    }

    const active = stack.at(-1);
    if (active && node.tagName === "P" && isDirectiveClose(text, active.fenceLength)) {
      node.remove();
      stack.pop();
      continue;
    }

    if (active) appendDirectiveChild(active, node);
  }
}

function ensurePublishedArticleBody(target: HTMLElement): HTMLElement {
  target.classList.remove("article-preview");
  target.classList.add("published-article-preview", "article-main");
  const existing = target.querySelector<HTMLElement>(
    ":scope > [data-published-article-body]",
  );
  if (existing) return existing;

  const body = target.ownerDocument.createElement("div");
  body.className = "article-body reading";
  body.dataset.publishedArticleBody = "true";
  body.append(...Array.from(target.childNodes));
  target.append(body);
  return body;
}

export function applySubjectPreviewProfile(
  target: HTMLElement,
  subject: string,
): void {
  installPreviewShellStyles(target.ownerDocument);
  target.dataset.previewSubject = subject || "general";
  target.dataset.publishedPreview = "true";
  const body = ensurePublishedArticleBody(target);
  enhancePreviewDirectives(body);
  if (subject === "mathematics") {
    normalizeMathArticleBody(body);
    numberMathStatements(body);
  }
}

function installPreviewShellStyles(doc: Document): void {
  if (doc.querySelector("style[data-published-preview-shell]")) return;
  const style = doc.createElement("style");
  style.dataset.publishedPreviewShell = "true";
  style.textContent = `
    .published-article-preview {
      background: var(--background-primary);
      box-sizing: border-box;
      height: auto;
      min-height: clamp(32rem, 66vh, 52rem);
      overflow: visible;
      padding: 1rem 1.15rem;
    }
    .published-article-preview > .article-body.reading {
      margin-inline: auto;
      width: 100%;
    }
    .reference-preview.published-article-preview {
      height: calc(88vh - 10rem);
    }
    @media (max-width: 1080px) {
      .published-article-preview { min-height: 28rem; }
    }
  `;
  doc.head.append(style);
}
