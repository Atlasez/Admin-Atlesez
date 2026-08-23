const DIRECTIVE_LABELS: Record<string, string> = {
  defi: "定義",
  definition: "定義",
  thm: "定理",
  theorem: "定理",
  prop: "命題",
  proposition: "命題",
  cor: "系",
  corollary: "系",
  lemma: "補題",
  proof: "証明",
  example: "例",
  exercise: "演習",
  remark: "補足",
  note: "注",
  warning: "注意",
  tip: "ヒント",
};

export type DirectiveMarker = {
  fence: string;
  name: string;
  title: string;
};

export function parseDirectiveMarker(value: string): DirectiveMarker | null {
  const match =
    /^\s*(:{3,4})\s*([A-Za-z][A-Za-z0-9_-]*)(?:\s+(.+?))?\s*$/.exec(
      value,
    );
  if (!match) return null;
  const name = match[2].toLowerCase();
  const rawTitle = (match[3] ?? "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/^['"]|['"]$/g, "");
  return {
    fence: match[1],
    name,
    title: rawTitle || DIRECTIVE_LABELS[name] || name,
  };
}

export function isDirectiveClose(value: string, minimumLength = 3): boolean {
  const match = /^\s*(:{3,4})\s*$/.exec(value);
  return Boolean(match && match[1].length >= minimumLength);
}
