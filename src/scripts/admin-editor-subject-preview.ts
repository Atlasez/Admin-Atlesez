import { parseDirectiveMarker } from "./admin-editor-enhancements";

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

type DirectiveMarker = NonNullable<ReturnType<typeof parseDirectiveMarker>>;

type DirectiveContainer = {
  section: HTMLElement;
  body: HTMLElement;
  semantic: boolean;
};

function isClosingDirective(value: string, minimumLength: number): boolean {
  const match = /^\s*(:{3,4})\s*$/.exec(value);
  return Boolean(match && match[1].length >= minimumLength);
}

function semanticDirectiveClass(name: string): string | null {
  return SEMANTIC_DIRECTIVE_CLASSES[name] ?? null;
}

function createDirectiveSection(
  doc: Document,
  marker: DirectiveMarker,
): DirectiveContainer {
  const section = doc.createElement("section");
  section.className = `editor-directive editor-directive-${marker.name.replace(/[^a-z0-9_-]/g, "")}`;
  section.dataset.directive = marker.name;

  const semanticClass = semanticDirectiveClass(marker.name);
  if (semanticClass) {
    section.classList.add(semanticClass);
    const heading = doc.createElement("span");
    heading.className = "thmtitle";
    heading.textContent = marker.title;
    section.append(heading);
    // Published mathematics articles place theorem content directly inside
    // .defi/.thm/etc. Keeping the section itself as the collection target
    // makes the editor preview use the same DOM shape and the same CSS.
    return { section, body: section, semantic: true };
  }

  const heading = doc.createElement("div");
  heading.className = "editor-directive-heading";
  heading.textContent = marker.title;
  const body = doc.createElement("div");
  body.className = "editor-directive-body";
  section.append(heading, body);
  return { section, body, semantic: false };
}

function normalizeDirectiveSection(section: HTMLElement): void {
  const name = section.dataset.directive?.toLowerCase() ?? "";
  if (!name) return;
  const semanticClass = semanticDirectiveClass(name);
  if (!semanticClass) return;

  section.classList.add(semanticClass);
  const heading = section.querySelector<HTMLElement>(
    ":scope > .editor-directive-heading, :scope > .thmtitle",
  );
  if (heading && heading.className !== "thmtitle") {
    heading.className = "thmtitle";
  }

  // Older preview code inserted an editor-only body wrapper. The published
  // article renderer does not have it, and its padding caused the large empty
  // area visible in theorem/definition cards. Unwrap it once.
  const body = section.querySelector<HTMLElement>(":scope > .editor-directive-body");
  if (body) body.replaceWith(...Array.from(body.childNodes));
}

function appendPackedContent(
  container: DirectiveContainer,
  html: string,
  text: string,
): void {
  if (!html && !text) return;
  if (!container.semantic) {
    if (html) container.body.innerHTML = html;
    else container.body.textContent = text;
    return;
  }

  if (html) {
    const template = container.section.ownerDocument.createElement("template");
    template.innerHTML = html;
    container.section.append(template.content);
  } else {
    const paragraph = container.section.ownerDocument.createElement("p");
    paragraph.textContent = text;
    container.section.append(paragraph);
  }
}

function convertPackedDirectiveParagraph(node: HTMLElement): boolean {
  if (node.tagName !== "P") return false;
  const plainLines = (node.textContent ?? "").replace(/\r\n/g, "\n").split("\n");
  if (plainLines.length < 3) return false;

  const marker = parseDirectiveMarker(plainLines[0].trim());
  if (!marker) return false;
  const closeIndex = plainLines.findIndex(
    (line, index) =>
      index > 0 && isClosingDirective(line, marker.fence.length),
  );
  if (closeIndex < 0) return false;

  const container = createDirectiveSection(node.ownerDocument, marker);
  const htmlLines = node.innerHTML.replace(/\r\n/g, "\n").split("\n");
  const lineAlignedHtml = htmlLines.length === plainLines.length;
  const bodyHtml = lineAlignedHtml
    ? htmlLines.slice(1, closeIndex).join("\n").trim()
    : "";
  const bodyText = plainLines.slice(1, closeIndex).join("\n").trim();
  appendPackedContent(container, bodyHtml, bodyText);

  const replacements: Node[] = [container.section];
  const trailingHtml = lineAlignedHtml
    ? htmlLines.slice(closeIndex + 1).join("\n").trim()
    : "";
  const trailingText = plainLines.slice(closeIndex + 1).join("\n").trim();
  if (trailingHtml || trailingText) {
    const trailing = node.ownerDocument.createElement("p");
    if (trailingHtml) trailing.innerHTML = trailingHtml;
    else trailing.textContent = trailingText;
    replacements.push(trailing);
  }
  node.replaceWith(...replacements);
  return true;
}

export function enhancePreviewDirectives(target: HTMLElement): void {
  target
    .querySelectorAll<HTMLElement>(".editor-directive[data-directive]")
    .forEach(normalizeDirectiveSection);

  const elementType = target.ownerDocument.defaultView?.HTMLElement;
  if (!elementType) return;

  for (const paragraph of Array.from(target.children)) {
    if (!(paragraph instanceof elementType)) continue;
    convertPackedDirectiveParagraph(paragraph as HTMLElement);
  }

  const originalChildren = Array.from(target.children);
  const stack: Array<{ body: HTMLElement; fenceLength: number }> = [];

  for (const child of originalChildren) {
    if (!(child instanceof elementType)) continue;
    const node = child as HTMLElement;
    if (node.matches(".editor-directive[data-directive]")) continue;
    const text = node.textContent?.trim() ?? "";
    const marker = node.tagName === "P" ? parseDirectiveMarker(text) : null;

    if (marker) {
      const container = createDirectiveSection(target.ownerDocument, marker);
      if (stack.length > 0) stack.at(-1)?.body.append(container.section);
      else node.replaceWith(container.section);
      if (node.isConnected) node.remove();
      stack.push({ body: container.body, fenceLength: marker.fence.length });
      continue;
    }

    if (
      stack.length > 0 &&
      node.tagName === "P" &&
      isClosingDirective(text, stack.at(-1)?.fenceLength ?? 3)
    ) {
      node.remove();
      stack.pop();
      continue;
    }

    if (stack.length > 0) stack.at(-1)?.body.append(node);
  }
}

export function applySubjectPreviewProfile(
  target: HTMLElement,
  subject: string,
): void {
  target.dataset.previewSubject = subject || "general";
  target.classList.add("article-body", "reading");
  enhancePreviewDirectives(target);
}

function installSubjectPreviewStyles(doc: Document): void {
  if (doc.querySelector("style[data-editor-subject-preview-styles]")) return;
  const style = doc.createElement("style");
  style.dataset.editorSubjectPreviewStyles = "true";
  style.textContent = `
    .article-preview.article-body.reading {
      max-width: var(--reading-width, 50rem);
    }
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
  installSubjectPreviewStyles(document);

  let scheduled = false;
  const apply = () => {
    scheduled = false;
    const subjectSlug = subject.value || "general";
    applySubjectPreviewProfile(preview, subjectSlug);
    const referencePreview = root.querySelector<HTMLElement>(
      "[data-reference-preview]",
    );
    if (referencePreview) {
      applySubjectPreviewProfile(referencePreview, subjectSlug);
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(apply);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(preview, { childList: true, subtree: true });
  const referencePreview = root.querySelector<HTMLElement>(
    "[data-reference-preview]",
  );
  if (referencePreview) {
    observer.observe(referencePreview, { childList: true, subtree: true });
  }
  subject.addEventListener("input", schedule);
  subject.addEventListener("change", schedule);
  schedule();

  document.addEventListener(
    "astro:before-swap",
    () => {
      observer.disconnect();
    },
    { once: true },
  );
}

if (typeof document !== "undefined") {
  document.addEventListener("astro:page-load", initializeSubjectPreview);
  initializeSubjectPreview();
}
