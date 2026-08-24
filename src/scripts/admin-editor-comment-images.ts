const ASSET_MARKER = /^!\[([^\]]{0,180})\]\(asset:\/\/([0-9a-f-]{36})\)\s*$/i;

type EditorialAssetMarker = {
  alt: string;
  id: string;
};

export function parseEditorialAssetMarker(
  value: string,
): EditorialAssetMarker | null {
  const match = ASSET_MARKER.exec(value.trim());
  if (!match) return null;
  return { alt: match[1], id: match[2] };
}

function ensureCommentImageStyles(doc: Document): void {
  if (doc.querySelector("style[data-editor-comment-image-styles]")) return;
  const style = doc.createElement("style");
  style.dataset.editorCommentImageStyles = "true";
  style.textContent = `
    .comment-quote .comment-quote-asset {
      background: var(--background-primary, var(--surface, #fff));
      border: 1px solid var(--border-default, var(--border, #d5dde2));
      border-radius: .35rem;
      display: grid;
      gap: .35rem;
      margin: .5rem 0 .25rem;
      max-width: 100%;
      padding: .4rem;
    }
    .comment-quote .comment-quote-asset img {
      display: block;
      height: auto;
      margin: 0 auto;
      max-height: 18rem;
      max-width: 100%;
      object-fit: contain;
    }
    .comment-quote .comment-quote-asset figcaption {
      color: var(--text-secondary, var(--muted, #596773));
      font-size: .68rem;
      overflow-wrap: anywhere;
    }
    .comment-quote .comment-quote-asset-error {
      color: var(--danger, #a03123);
      display: block;
      font-size: .72rem;
      line-height: 1.5;
      margin: .35rem 0;
    }
  `;
  doc.head.append(style);
}

function initializeCommentAssetImages(): void {
  const root = document.querySelector<HTMLElement>("[data-editor-workspace]");
  const comments = root?.querySelector<HTMLElement>("[data-comment-list]");
  if (!root || !comments || comments.dataset.commentAssetImagesReady === "true") {
    return;
  }
  comments.dataset.commentAssetImagesReady = "true";

  const objectUrls = new Map<string, string>();
  const pendingLoads = new Map<string, Promise<string>>();

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
          throw new Error("画像ではない応答を受信しました。");
        }
        const blob = await response.blob();
        if (!blob.size) throw new Error("画像データが空です。");
        const url = URL.createObjectURL(
          blob.type ? blob : new Blob([blob], { type: mediaType }),
        );
        objectUrls.set(assetId, url);
        return url;
      })
      .finally(() => pendingLoads.delete(assetId));

    pendingLoads.set(assetId, load);
    return load;
  };

  const renderQuote = (span: HTMLElement): void => {
    if (span.dataset.assetQuoteRendered === "true") return;
    const value = span.textContent ?? "";
    const marker = parseEditorialAssetMarker(value);
    if (!marker) return;
    span.dataset.assetQuoteRendered = "true";

    const doc = span.ownerDocument;
    ensureCommentImageStyles(doc);
    const figure = doc.createElement("figure");
    figure.className = "comment-quote-asset";
    figure.dataset.commentQuoteAsset = marker.id;

    const image = doc.createElement("img");
    image.alt = marker.alt;
    image.loading = "lazy";
    image.decoding = "async";

    const caption = doc.createElement("figcaption");
    caption.textContent = marker.alt || "記事画像";
    figure.append(image, caption);
    span.replaceChildren(figure);

    void loadAsset(marker.id)
      .then((url) => {
        image.src = url;
      })
      .catch((error: unknown) => {
        const message = doc.createElement("span");
        message.className = "comment-quote-asset-error";
        message.textContent =
          error instanceof Error
            ? error.message
            : "画像を表示できませんでした。";
        figure.replaceChildren(message, caption);
      });
  };

  const hydrateCommentQuotes = (): void => {
    comments
      .querySelectorAll<HTMLElement>(".comment-quote > span")
      .forEach(renderQuote);
  };

  const observer = new MutationObserver(hydrateCommentQuotes);
  observer.observe(comments, { childList: true, subtree: true });
  hydrateCommentQuotes();

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
  document.addEventListener("astro:page-load", initializeCommentAssetImages);
  initializeCommentAssetImages();
}
