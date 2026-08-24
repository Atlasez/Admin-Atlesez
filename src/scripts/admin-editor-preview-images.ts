const ASSET_MARKER = /^!\[([^\]]{0,180})\]\(asset:\/\/([0-9a-f-]{36})\)\s*$/i;

type EditorialAssetMarker = {
  alt: string;
  id: string;
};

export function parsePreviewAssetMarker(
  value: string,
): EditorialAssetMarker | null {
  const match = ASSET_MARKER.exec(value.trim());
  if (!match) return null;
  return { alt: match[1], id: match[2] };
}

function ensurePreviewImageStyles(doc: Document): void {
  if (doc.querySelector("style[data-editor-preview-image-styles]")) return;
  const style = doc.createElement("style");
  style.dataset.editorPreviewImageStyles = "true";
  style.textContent = `
    .article-preview .editorial-image {
      display: grid;
      gap: .45rem;
      margin: 1rem 0;
      max-width: 100%;
      place-items: center;
    }
    .article-preview .editorial-image img {
      display: block;
      height: auto;
      max-height: 70vh;
      max-width: 100%;
      object-fit: contain;
    }
    .article-preview .editorial-preview-image-status {
      background: var(--background-secondary, #f5f7f8);
      border: 1px solid var(--border-default, #d5dde2);
      color: var(--text-secondary, #596773);
      display: block;
      font-size: .76rem;
      line-height: 1.55;
      padding: .55rem .65rem;
      width: min(100%, 36rem);
    }
    .article-preview .editorial-preview-image-status.is-error {
      color: var(--danger, #a03123);
    }
  `;
  doc.head.append(style);
}

function initializePreviewAssetImages(): void {
  const root = document.querySelector<HTMLElement>("[data-editor-workspace]");
  const preview = root?.querySelector<HTMLElement>("[data-preview]");
  if (!root || !preview || preview.dataset.previewAssetImagesReady === "true") {
    return;
  }
  preview.dataset.previewAssetImagesReady = "true";

  const objectUrls = new Map<string, string>();
  const pendingLoads = new Map<string, Promise<string>>();
  let hydrationQueued = false;

  const loadAsset = (assetId: string): Promise<string> => {
    const cached = objectUrls.get(assetId);
    if (cached) return Promise.resolve(cached);
    const pending = pendingLoads.get(assetId);
    if (pending) return pending;

    const load = fetch(`/api/admin/editor/assets/${encodeURIComponent(assetId)}`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`画像を取得できませんでした（HTTP ${response.status}）。`);
        }
        const mediaType =
          response.headers
            .get("content-type")
            ?.split(";", 1)[0]
            .trim()
            .toLowerCase() ?? "";
        if (!mediaType.startsWith("image/")) {
          throw new Error("画像ではない応答を受信しました。認証状態を確認してください。");
        }
        const blob = await response.blob();
        if (!blob.size) throw new Error("画像データが空です。");
        const objectUrl = URL.createObjectURL(
          blob.type ? blob : new Blob([blob], { type: mediaType }),
        );
        objectUrls.set(assetId, objectUrl);
        return objectUrl;
      })
      .finally(() => pendingLoads.delete(assetId));

    pendingLoads.set(assetId, load);
    return load;
  };

  const convertRawMarkers = (target: HTMLElement): void => {
    for (const paragraph of target.querySelectorAll<HTMLParagraphElement>("p")) {
      if (paragraph.closest("pre, code")) continue;
      const marker = parsePreviewAssetMarker(paragraph.textContent ?? "");
      if (!marker) continue;

      const doc = paragraph.ownerDocument;
      ensurePreviewImageStyles(doc);
      const figure = doc.createElement("figure");
      figure.className = "editorial-image";
      figure.dataset.previewAssetFigure = marker.id;

      const image = doc.createElement("img");
      image.dataset.editorialAsset = marker.id;
      image.alt = marker.alt;
      image.loading = "lazy";
      image.decoding = "async";
      figure.append(image);
      paragraph.replaceWith(figure);
    }
  };

  const hydrateImage = async (image: HTMLImageElement): Promise<void> => {
    const assetId = image.dataset.editorialAsset;
    if (!assetId || image.dataset.previewAssetHydrating === "true") return;
    if (image.src.startsWith("blob:") && !image.classList.contains("is-unavailable")) {
      return;
    }

    image.dataset.previewAssetHydrating = "true";
    image.classList.remove("is-unavailable");
    image.classList.add("is-loading");
    const figure = image.closest<HTMLElement>(".editorial-image") ?? image.parentElement;
    const doc = image.ownerDocument;
    ensurePreviewImageStyles(doc);

    figure
      ?.querySelectorAll<HTMLElement>(
        `.editorial-image-error, [data-preview-asset-status="${CSS.escape(assetId)}"]`,
      )
      .forEach((node) => node.remove());

    const status = doc.createElement("span");
    status.className = "editorial-preview-image-status";
    status.dataset.previewAssetStatus = assetId;
    status.textContent = `画像「${image.alt || assetId}」を読み込み中…`;
    image.insertAdjacentElement("afterend", status);

    try {
      image.src = await loadAsset(assetId);
      image.classList.remove("is-loading", "is-unavailable");
      status.remove();
    } catch (error) {
      image.removeAttribute("src");
      image.classList.remove("is-loading");
      image.classList.add("is-unavailable");
      status.classList.add("is-error", "editorial-image-error");
      status.textContent = "画像を表示できません。再読み込みしてください。";
      status.title =
        error instanceof Error
          ? `${error.message} asset://${assetId}`
          : `画像を表示できませんでした。asset://${assetId}`;
    } finally {
      delete image.dataset.previewAssetHydrating;
    }
  };

  const hydrateTarget = (target: HTMLElement): void => {
    convertRawMarkers(target);
    for (const image of target.querySelectorAll<HTMLImageElement>(
      "img[data-editorial-asset]",
    )) {
      const figure = image.closest<HTMLElement>(".editorial-image") ?? image.parentElement;
      const hasStableError = Boolean(
        figure?.querySelector(".editorial-image-error"),
      );
      if (!image.src && !hasStableError) {
        void hydrateImage(image);
      }
    }
  };

  const hydrateAll = (): void => {
    hydrationQueued = false;
    hydrateTarget(preview);
    const referencePreview = root.querySelector<HTMLElement>(
      "[data-reference-preview]",
    );
    if (referencePreview) hydrateTarget(referencePreview);
  };

  const scheduleHydration = (): void => {
    if (hydrationQueued) return;
    hydrationQueued = true;
    window.setTimeout(hydrateAll, 0);
  };

  const observer = new MutationObserver(scheduleHydration);
  observer.observe(preview, { childList: true, subtree: true });
  const referencePreview = root.querySelector<HTMLElement>(
    "[data-reference-preview]",
  );
  if (referencePreview) {
    observer.observe(referencePreview, { childList: true, subtree: true });
  }
  scheduleHydration();

  document.addEventListener(
    "astro:before-swap",
    () => {
      observer.disconnect();
      for (const url of objectUrls.values()) URL.revokeObjectURL(url);
      objectUrls.clear();
      pendingLoads.clear();
    },
    { once: true },
  );
}

if (typeof document !== "undefined") {
  document.addEventListener("astro:page-load", initializePreviewAssetImages);
  initializePreviewAssetImages();
}
