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

function isClosingDirective(value: string, minimumLength: number): boolean {
  const match = /^\s*(:{3,4})\s*$/.exec(value);
  return Boolean(match && match[1].length >= minimumLength);
}

function semanticDirectiveClass(name: string): string | null {
  return SEMANTIC_DIRECTIVE_CLASSES[name] ?? null;
}

function normalizeDirectiveSection(section: HTMLElement): void {
  const name = section.dataset.directive?.toLowerCase() ?? "";
  if (!name) return;
  const semanticClass = semanticDirectiveClass(name);
  if (semanticClass) section.classList.add(semanticClass);
  const heading = section.querySelector<HTMLElement>(
    ":scope > .editor-directive-heading",
  );
  heading?.classList.add("thmtitle");
}

export function enhancePreviewDirectives(target: HTMLElement): void {
  target
    .querySelectorAll<HTMLElement>(".editor-directive[data-directive]")
    .forEach(normalizeDirectiveSection);

  const elementType = target.ownerDocument.defaultView?.HTMLElement;
  if (!elementType) return;

  const originalChildren = Array.from(target.children);
  const stack: Array<{ body: HTMLElement; fenceLength: number }> = [];

  for (const child of originalChildren) {
    if (!(child instanceof elementType)) continue;
    const node = child as HTMLElement;
    const text = node.textContent?.trim() ?? "";
    const marker = node.tagName === "P" ? parseDirectiveMarker(text) : null;

    if (marker) {
      const section = target.ownerDocument.createElement("section");
      section.className = `editor-directive editor-directive-${marker.name.replace(/[^a-z0-9_-]/g, "")}`;
      section.dataset.directive = marker.name;
      const semanticClass = semanticDirectiveClass(marker.name);
      if (semanticClass) section.classList.add(semanticClass);

      const heading = target.ownerDocument.createElement("div");
      heading.className = "editor-directive-heading thmtitle";
      heading.textContent = marker.title;

      const body = target.ownerDocument.createElement("div");
      body.className = "editor-directive-body";
      section.append(heading, body);

      if (stack.length > 0) stack.at(-1)?.body.append(section);
      else node.replaceWith(section);
      if (node.isConnected) node.remove();
      stack.push({ body, fenceLength: marker.fence.length });
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
    .article-preview .editor-directive:not(.defi):not(.prop):not(.thm):not(.lemma):not(.cor):not(.example) > .thmtitle {
      background: var(--accent-subtle, #e8f2f8);
      color: var(--text-primary, #17212a);
      margin: -1.75rem 0 .8rem -1.1rem;
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
