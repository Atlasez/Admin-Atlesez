/**
 * Shared reference records used by the editorial workspace and published
 * articles. A personal reference is copied into an article when it is cited,
 * so publishing never depends on the editor's current private list.
 */
export const ARTICLE_REFERENCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/;
export const ARTICLE_CITATION_PATTERN =
  /\[\[cite:([A-Za-z0-9][A-Za-z0-9_-]*)\]\]/g;

export const normalizeArticleReference = (value) => {
  if (!value || typeof value !== "object") return null;
  const record = value;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!ARTICLE_REFERENCE_ID.test(id) || !title) return null;
  const optional = (key, max) => {
    const item = typeof record[key] === "string" ? record[key].trim() : "";
    return item ? item.slice(0, max) : undefined;
  };
  const url = optional("url", 2_000);
  return {
    id,
    title: title.slice(0, 240),
    ...(optional("authors", 240) ? { authors: optional("authors", 240) } : {}),
    ...(optional("year", 32) ? { year: optional("year", 32) } : {}),
    ...(optional("publisher", 240)
      ? { publisher: optional("publisher", 240) }
      : {}),
    ...(url && /^https?:\/\/\S+$/i.test(url) ? { url } : {}),
    ...(optional("note", 500) ? { note: optional("note", 500) } : {}),
  };
};

export const normalizeArticleReferences = (value, limit = 200) =>
  Array.isArray(value)
    ? value
        .slice(0, limit)
        .map(normalizeArticleReference)
        .filter(Boolean)
        .filter(
          (reference, index, all) =>
            all.findIndex(
              (item) => item.id.toLowerCase() === reference.id.toLowerCase(),
            ) === index,
        )
    : [];

export const citedReferenceIds = (source) => {
  const ids = [];
  for (const match of String(source ?? "").matchAll(ARTICLE_CITATION_PATTERN)) {
    const id = match[1].toLowerCase();
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
};

export const formatArticleReference = (reference) => {
  const author = reference.authors ? `${reference.authors}. ` : "";
  const year = reference.year ? ` (${reference.year})` : "";
  const publisher = reference.publisher ? `. ${reference.publisher}` : "";
  return `${author}${reference.title}${year}${publisher}`;
};

export const articleReferenceAnchor = (id) =>
  `reference-${String(id).toLowerCase()}`;
