export const EDITORIAL_IMAGE_WIDTHS = Object.freeze([
  "25%",
  "40%",
  "60%",
  "80%",
  "100%",
]);

export function normalizeEditorialImageWidth(value) {
  const normalized = String(value ?? "").trim().replace(/%$/, "");
  if (!/^\d{1,3}$/.test(normalized)) return "";
  const percentage = Number(normalized);
  return percentage >= 1 && percentage <= 100 ? `${percentage}%` : "";
}

export function editorialImageWidthFromUrl(url) {
  let source = String(url ?? "");
  try {
    source = decodeURIComponent(source);
  } catch {
    // 不正なpercent encodingは幅指定なしとして扱う。
  }
  const match = /(?:[?&])width=(\d{1,3})%?(?:&|$)/i.exec(source);
  return normalizeEditorialImageWidth(match ? `${match[1]}%` : "");
}

export function removeEditorialImageWidthFromUrl(url) {
  return String(url ?? "")
    .replace(/([?&])width=\d{1,3}%?(?=&|$)/gi, "")
    .replace(/\?&/, "?")
    .replace(/[?&]$/, "");
}

export function editorialImageUrlWithWidth(url, width) {
  const cleanUrl = removeEditorialImageWidthFromUrl(url);
  const normalized = normalizeEditorialImageWidth(width);
  return normalized
    ? `${cleanUrl}${cleanUrl.includes("?") ? "&" : "?"}width=${normalized}`
    : cleanUrl;
}

export function editorialImageWidthFromLatexOptions(options) {
  const source = String(options ?? "");
  const match = /(?:^|,)\s*width\s*=\s*(?:(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*\\(?:line|text)width)\s*(?:,|$)/i.exec(
    source,
  );
  if (!match) return "";
  const percentage = match[1]
    ? Number(match[1])
    : Math.round(Number(match[2]) * 100);
  return normalizeEditorialImageWidth(`${percentage}%`);
}

export function editorialImageWidthToLatex(width) {
  const normalized = normalizeEditorialImageWidth(width);
  return normalized ? `${Number.parseInt(normalized, 10) / 100}\\linewidth` : "";
}

export function editorialImageStyle(width) {
  const normalized = normalizeEditorialImageWidth(width);
  return normalized ? `width:${normalized};max-width:100%;` : "";
}
