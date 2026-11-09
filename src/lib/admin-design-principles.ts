import { isAdminPagePath } from "./admin-routes";

export const DESIGN_PRINCIPLE_CATEGORIES = [
  "selection",
  "information",
  "feedback",
  "accessibility",
  "consistency",
  "other",
] as const;

export const DESIGN_PRINCIPLE_STATUSES = [
  "candidate",
  "active",
  "archived",
] as const;

export type DesignPrincipleCategory =
  (typeof DESIGN_PRINCIPLE_CATEGORIES)[number];
export type DesignPrincipleStatus = (typeof DESIGN_PRINCIPLE_STATUSES)[number];

export type DesignPrincipleSourceDraft = {
  label: string;
  href: string;
  excerpt: string;
};

export type DesignPrincipleDraft = {
  title: string;
  category: DesignPrincipleCategory;
  statement: string;
  rationale: string;
  status: DesignPrincipleStatus;
  sources: DesignPrincipleSourceDraft[];
};

const text = (value: unknown, limit: number) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";

/** Accept only local ADMIN pages so source links cannot point to arbitrary sites. */
export function normalizeDesignPrincipleHref(value: unknown): string | null {
  const input = text(value, 2_000);
  if (!input || input.startsWith("//") || input.includes("\\")) return null;
  try {
    const url = new URL(input, "https://admin.atlasez.org");
    if (
      url.origin !== "https://admin.atlasez.org" ||
      url.username ||
      url.password ||
      !isAdminPagePath(url.pathname)
    )
      return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function parseDesignPrincipleDraft(
  value: unknown,
): { ok: true; value: DesignPrincipleDraft } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ok: false, error: "入力内容を読み取れませんでした。" };
  const row = value as Record<string, unknown>;
  const title = text(row.title, 160);
  const statement = text(row.statement, 2_000);
  const rationale = text(row.rationale, 4_000);
  const category = text(row.category, 32) as DesignPrincipleCategory;
  const status = text(row.status, 32) as DesignPrincipleStatus;
  if (!title || !statement)
    return { ok: false, error: "原則名と設計原則を入力してください。" };
  if (
    !DESIGN_PRINCIPLE_CATEGORIES.includes(category) ||
    !DESIGN_PRINCIPLE_STATUSES.includes(status)
  )
    return { ok: false, error: "分類または状態を確認してください。" };
  if (
    !Array.isArray(row.sources) ||
    row.sources.length < 1 ||
    row.sources.length > 20
  )
    return { ok: false, error: "元フィードバックを1〜20件紐付けてください。" };
  const sources: DesignPrincipleSourceDraft[] = [];
  for (const item of row.sources) {
    if (!item || typeof item !== "object" || Array.isArray(item))
      return { ok: false, error: "元フィードバックの入力を確認してください。" };
    const source = item as Record<string, unknown>;
    const label = text(source.label, 160);
    const href = normalizeDesignPrincipleHref(source.href);
    const excerpt = text(source.excerpt, 800);
    if (!label || !href)
      return {
        ok: false,
        error: "元フィードバックの名称とADMIN内URLを入力してください。",
      };
    sources.push({ label, href, excerpt });
  }
  return {
    ok: true,
    value: { title, category, statement, rationale, status, sources },
  };
}
