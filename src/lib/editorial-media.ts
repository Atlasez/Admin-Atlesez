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
  documentId: string;
  filename: string;
};

export type EditorialLatexAssetReference = EditorialAssetReference & {
  latexName: string;
  alt?: string;
};

export const editorialAssetMarker = (id: string) => `asset://${id}`;

export const publicEditorialAssetPath = (asset: EditorialAssetReference) =>
  `/images/editorial/${asset.documentId}/${asset.filename}`;

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

export const uniqueEditorialFilename = (
  filename: string,
  existingFilenames: Iterable<string>,
) => {
  const existing = new Set(
    [...existingFilenames].map((value) => value.toLowerCase()),
  );
  if (!existing.has(filename.toLowerCase())) return filename;
  const match = /^(.*?)(\.[a-z0-9]+)$/i.exec(filename);
  const basename = match?.[1] ?? filename;
  const extension = match?.[2] ?? "";
  for (let suffix = 2; suffix <= 10_000; suffix += 1) {
    const candidate = `${basename}-${suffix}${extension}`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
  throw new Error("画像ファイル名の重複を解決できませんでした。");
};

export const sanitizeEditorialLatexName = (value: string, filename: string) => {
  const fallback = filename.replace(/\.[a-z0-9]+$/i, "");
  const normalized = (value.trim() || fallback)
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const safe = normalized || "figure";
  return /^[A-Za-z]/.test(safe) ? safe : `asset-${safe}`;
};

export const editorialAssetIdsIn = (body: string) => [
  ...new Set(
    [...body.matchAll(/asset:\/\/([0-9a-f-]{36})/gi)]
      .map((match) => match[1])
      .filter((id): id is string => EDITORIAL_ASSET_ID_PATTERN.test(id)),
  ),
];

export const editorialLatexNamesIn = (body: string) => [
  ...new Set(
    [
      ...body.matchAll(
        /^\\includegraphics(?:\[[^\]\r\n]{0,240}\])?\{([A-Za-z][A-Za-z0-9_-]*)\}\s*$/gm,
      ),
    ].map((match) => match[1].toLowerCase()),
  ),
];

export const editorialAssetIsReferenced = (
  body: string,
  asset: EditorialLatexAssetReference,
) => {
  if (
    editorialAssetIdsIn(body).some(
      (id) => id.toLowerCase() === asset.id.toLowerCase(),
    ) ||
    editorialLatexNamesIn(body).includes(asset.latexName.toLowerCase())
  )
    return true;

  const expectedPaths = new Set(
    [asset.documentId, asset.id].map(
      (directory) =>
        `/images/editorial/${directory.toLowerCase()}/${asset.filename.toLowerCase()}`,
    ),
  );
  const markdownUrls = [
    ...body.matchAll(/!\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g),
  ].map((match) => match[1]);
  return markdownUrls.some((value) => {
    let pathname = value.split(/[?#]/, 1)[0];
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      // 不正なpercent encodingは参照として扱わない。
    }
    const normalized = pathname.replace(/\\/g, "/").toLowerCase();
    return [...expectedPaths].some((expected) => normalized.endsWith(expected));
  });
};

export const replaceEditorialLatexReferences = (
  body: string,
  assets: Map<string, EditorialLatexAssetReference>,
) =>
  body.replace(
    /^\\includegraphics(?:\[[^\]\r\n]{0,240}\])?\{([A-Za-z][A-Za-z0-9_-]*)\}\s*$/gm,
    (whole, name: string) => {
      const asset = assets.get(name.toLowerCase());
      if (!asset) return whole;
      const safeAlt =
        (asset.alt ?? "").replace(/[\r\n\]]/g, " ").trim() || asset.filename;
      return `![${safeAlt}](${publicEditorialAssetPath(asset)})`;
    },
  );

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
