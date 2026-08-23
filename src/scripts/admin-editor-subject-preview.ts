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
  ensurePublishedArticleBody(target);
}

function initializeSubjectPreview(): void {
  const root = document.querySelector<HTMLElement>("[data-editor-workspace]");
  if (!root || root.dataset.subjectPreviewReady === "true") return;

  const subject = root.querySelector<HTMLSelectElement>("[data-subject]");
  const preview = root.querySelector<HTMLElement>("[data-preview]");
  if (!subject || !preview) return;

  root.dataset.subjectPreviewReady = "true";
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

  // The editor replaces preview.innerHTML on each Markdown render. Recreate the
  // same article-body wrapper immediately afterwards; do not reinterpret
  // theorem/definition text or directive fences in the preview layer.
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
