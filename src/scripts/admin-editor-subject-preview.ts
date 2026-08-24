import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { ARTICLE_MARKDOWN_PROCESSOR_OPTIONS } from "../lib/article-markdown.mjs";
import {
  isDirectiveClose,
  parseDirectiveMarker,
  type DirectiveMarker,
} from "../lib/editor-directives";
import { normalizeMathArticleBody } from "./article-math-structure";

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
  heading.className = "article-directive-title";
  heading.textContent = marker.title;
  const body = doc.createElement("div");
  body.className = "article-directive-body";
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
        stack.at(-1)?.body.append(container.section);
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

    if (active) active.body.append(node);
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
  target.dataset.previewSubject = subject || "general";
  target.dataset.publishedPreview = "true";
  const body = ensurePublishedArticleBody(target);
  enhancePreviewDirectives(body);
  if (subject === "mathematics") normalizeMathArticleBody(body);
}

function installPreviewShellStyles(doc: Document): void {
  if (doc.querySelector("style[data-published-preview-shell]")) return;
  const style = doc.createElement("style");
  style.dataset.publishedPreviewShell = "true";
  style.textContent = `
    .published-article-preview {
      background: var(--background-primary);
      box-sizing: border-box;
      height: clamp(32rem, 66vh, 52rem);
      overflow: auto;
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
      .published-article-preview { height: auto; min-height: 28rem; }
    }
  `;
  doc.head.append(style);
}

function sourceSignature(source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${source.length}:${hash >>> 0}`;
}

function prepareEditorialImages(target: HTMLElement): void {
  for (const image of target.querySelectorAll<HTMLImageElement>('img[src^="asset://"]')) {
    const match = /^asset:\/\/([0-9a-f-]{36})$/i.exec(image.getAttribute("src") ?? "");
    if (!match) continue;
    image.dataset.editorialAsset = match[1];
    image.removeAttribute("src");
    const figure = image.closest("figure");
    if (figure) figure.classList.add("editorial-image");
  }
}

function initializeSubjectPreview(): void {
  const root = document.querySelector<HTMLElement>("[data-editor-workspace]");
  if (!root || root.dataset.subjectPreviewReady === "true") return;

  const subject = root.querySelector<HTMLSelectElement>("[data-subject]");
  const source = root.querySelector<HTMLTextAreaElement>("[data-body]");
  const preview = root.querySelector<HTMLElement>("[data-preview]");
  if (!subject || !source || !preview) return;

  root.dataset.subjectPreviewReady = "true";
  installPreviewShellStyles(document);

  const previewEngine = root.querySelector<HTMLSelectElement>("[data-preview-engine]");
  if (previewEngine) {
    previewEngine.value = "katex";
    previewEngine.disabled = true;
    previewEngine.title = "公開記事と同じKaTeX rendererを使用します。";
  }

  const processorPromise = createMarkdownProcessor(ARTICLE_MARKDOWN_PROCESSOR_OPTIONS);
  const renderState = new WeakMap<HTMLElement, { signature: string; running: boolean }>();
  let scheduled = false;

  const renderTarget = async (target: HTMLElement, markdown: string) => {
    const signature = sourceSignature(markdown);
    const current = renderState.get(target);
    const body = target.querySelector<HTMLElement>(":scope > .article-body.reading");
    if (current?.signature === signature && body) return;
    if (current?.running) return;
    renderState.set(target, { signature: current?.signature ?? "", running: true });
    try {
      const processor = await processorPromise;
      const rendered = await processor.render(markdown);
      target.replaceChildren();
      applySubjectPreviewProfile(target, subject.value || "general");
      const articleBody = ensurePublishedArticleBody(target);
      articleBody.innerHTML = rendered.code;
      prepareEditorialImages(articleBody);
      if (subject.value === "mathematics") normalizeMathArticleBody(articleBody);
      renderState.set(target, { signature, running: false });
    } catch (error) {
      const articleBody = ensurePublishedArticleBody(target);
      articleBody.textContent = error instanceof Error ? error.message : "Previewを描画できませんでした。";
      renderState.set(target, { signature, running: false });
    }
  };

  const apply = () => {
    scheduled = false;
    void renderTarget(preview, source.value);
    const reference = root.querySelector<HTMLElement>("[data-reference-preview]");
    const referenceSource = root.querySelector<HTMLElement>("[data-reference-source]");
    if (reference && referenceSource) {
      void renderTarget(reference, referenceSource.textContent ?? "");
    }
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(apply);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(preview, { childList: true, subtree: true });
  const reference = root.querySelector<HTMLElement>("[data-reference-preview]");
  if (reference) observer.observe(reference, { childList: true, subtree: true });

  source.addEventListener("input", schedule);
  source.addEventListener("change", schedule);
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
