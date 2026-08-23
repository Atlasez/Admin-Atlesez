import {
  isDirectiveClose,
  parseDirectiveMarker,
  type DirectiveMarker,
} from "../lib/editor-directives";

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
};

function semanticDirectiveClass(name: string): string | null {
  return SEMANTIC_DIRECTIVE_CLASSES[name] ?? null;
}

function createDirectiveContainer(
  doc: Document,
  marker: DirectiveMarker,
): DirectiveContainer {
  const section = doc.createElement("section");
  const safeName = marker.name.replace(/[^a-z0-9_-]/g, "");
  section.className = `editor-directive editor-directive-${safeName}`;
  section.dataset.directive = marker.name;

  const semanticClass = semanticDirectiveClass(marker.name);
  if (semanticClass) {
    section.classList.add(semanticClass);
    const heading = doc.createElement("div");
    heading.className = "thmtitle";
    heading.textContent = marker.title;
    section.append(heading);
    return { section, body: section, fenceLength: marker.fence.length };
  }

  const heading = doc.createElement("div");
  heading.className = "editor-directive-heading";
  heading.textContent = marker.title;
  const body = doc.createElement("div");
  body.className = "editor-directive-body";
  section.append(heading, body);
  return { section, body, fenceLength: marker.fence.length };
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
    container.body.append(paragraph);
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

export function enhancePreviewDirectives(target: HTMLElement): void {
  const HTMLElementCtor = target.ownerDocument.defaultView?.HTMLElement;
  if (!HTMLElementCtor) return;

  for (const child of Array.from(target.children)) {
    if (child instanceof HTMLElementCtor) {
      convertPackedDirectiveParagraph(child as HTMLElement);
    }
  }

  const children = Array.from(target.children);
  const stack: DirectiveContainer[] = [];
  for (const child of children) {
    if (!(child instanceof HTMLElementCtor)) continue;
    const node = child as HTMLElement;
    if (node.matches(".editor-directive[data-directive]")) continue;

    const text = node.textContent?.trim() ?? "";
    const marker = node.tagName === "P" ? parseDirectiveMarker(text) : null;
    if (marker) {
      const container = createDirectiveContainer(target.ownerDocument, marker);
      if (stack.length > 0) {
        stack.at(-1)?.body.append(container.section);
        node.remove();
      } else {
        node.replaceWith(container.section);
      }
      stack.push(container);
      continue;
    }

    const active = stack.at(-1);
    if (
      active &&
      node.tagName === "P" &&
      isDirectiveClose(text, active.fenceLength)
    ) {
      node.remove();
      stack.pop();
      continue;
    }

    if (active) active.body.append(node);
  }
}

function ensurePublishedArticleBody(target: HTMLElement): HTMLElement {
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
  target.dataset.previewSubject = subject || "general";
  target.dataset.publishedPreview = "true";
  const body = ensurePublishedArticleBody(target);
  enhancePreviewDirectives(body);
}

function installDirectiveStyles(doc: Document): void {
  if (doc.querySelector("style[data-editor-directive-preview]")) return;
  const style = doc.createElement("style");
  style.dataset.editorDirectivePreview = "true";
  style.textContent = `
    .article-preview .editor-directive:not(.defi):not(.prop):not(.thm):not(.lemma):not(.cor):not(.example) {
      background: var(--background-secondary, #f6f8fa);
      border: 1px solid var(--border-default, #d5dde2);
      border-left: 4px solid var(--accent-primary, #176ea6);
      border-radius: 0 .55rem .55rem .55rem;
      margin-block: 1.4rem 1rem;
      padding: 1rem 1.1rem;
    }
    .article-preview .editor-directive:not(.defi):not(.prop):not(.thm):not(.lemma):not(.cor):not(.example) > .editor-directive-heading {
      background: var(--accent-subtle, #e8f2f8);
      color: var(--text-primary, #17212a);
      font-weight: 800;
      margin: -1rem -1.1rem .8rem;
      padding: .45rem .7rem;
    }
  `;
  doc.head.append(style);
}

function initializeSubjectPreview(): void {
  const root = document.querySelector<HTMLElement>("[data-editor-workspace]");
  if (!root || root.dataset.subjectPreviewReady === "true") return;

  const subject = root.querySelector<HTMLSelectElement>("[data-subject]");
  const preview = root.querySelector<HTMLElement>("[data-preview]");
  if (!subject || !preview) return;

  root.dataset.subjectPreviewReady = "true";
  installDirectiveStyles(document);
  let scheduled = false;

  const apply = () => {
    scheduled = false;
    const subjectSlug = subject.value || "general";
    applySubjectPreviewProfile(preview, subjectSlug);
    const reference = root.querySelector<HTMLElement>("[data-reference-preview]");
    if (reference) applySubjectPreviewProfile(reference, subjectSlug);
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(apply);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(preview, { childList: true });
  const reference = root.querySelector<HTMLElement>("[data-reference-preview]");
  if (reference) observer.observe(reference, { childList: true });

  subject.addEventListener("input", schedule);
  subject.addEventListener("change", schedule);
  schedule();

  document.addEventListener(
    "astro:before-swap",
    () => observer.disconnect(),
    { once: true },
  );
}

if (typeof document !== "undefined") {
  document.addEventListener("astro:page-load", initializeSubjectPreview);
  initializeSubjectPreview();
}
