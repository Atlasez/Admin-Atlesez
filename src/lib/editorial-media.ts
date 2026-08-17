export const EDITORIAL_IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

export type EditorialImageType = keyof typeof EDITORIAL_IMAGE_TYPES;

export const MAX_EDITORIAL_ASSET_BYTES = 1_500_000;
export const EDITORIAL_ASSET_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EditorialAssetReference = {
  id: string;
  filename: string;
};

export const editorialAssetMarker = (id: string) => `asset://${id}`;

export const publicEditorialAssetPath = (asset: EditorialAssetReference) =>
  `../../../../../images/editorial/${asset.id}/${asset.filename}`;

export const sanitizeEditorialFilename = (
  filename: string,
  mediaType: EditorialImageType,
) => {
  const extension = EDITORIAL_IMAGE_TYPES[mediaType];
  const basename = filename
    .normalize("NFKC")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${basename || "image"}.${extension}`;
};

export const editorialAssetIdsIn = (body: string) => [
  ...new Set(
    [...body.matchAll(/asset:\/\/([0-9a-f-]{36})/gi)]
      .map((match) => match[1])
      .filter((id): id is string => EDITORIAL_ASSET_ID_PATTERN.test(id)),
  ),
];

export const replaceEditorialAssetMarkers = (
  body: string,
  assets: Map<string, EditorialAssetReference>,
) =>
  body.replace(
    /!\[([^\]]{0,180})\]\(asset:\/\/([0-9a-f-]{36})\)/gi,
    (whole, alt: string, id: string) => {
      const asset = assets.get(id.toLowerCase()) ?? assets.get(id);
      if (!asset) return whole;
      const safeAlt =
        alt.replace(/[\r\n\]]/g, " ").trim() ||
        asset.filename.replace(/[\r\n\]]/g, " ");
      return `![${safeAlt}](${publicEditorialAssetPath(asset)})`;
    },
  );
