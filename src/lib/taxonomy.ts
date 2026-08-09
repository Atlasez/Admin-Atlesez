/**
 * 分野の階層分類。
 *
 * 分野トップを「大分類（人文科学・社会科学・自然科学・応用/学際）」→
 * 「中ジャンル（言語学習・数理科学 など）」→「分野」の3層で見せるための定義。
 * subjects.yaml には slug（group / genre）だけを持たせ、表示名はここで一元管理する。
 */

import { localizedName, type Locale } from "./i18n";

export const GROUPS = ["humanities", "social", "natural"] as const;
export type SubjectGroup = (typeof GROUPS)[number];

interface Labeled {
  name: { ja: string; en?: string };
}

/** 大分類 */
export const groupMeta: Record<SubjectGroup, Labeled & { order: number }> = {
  humanities: { name: { ja: "人文科学", en: "Humanities" }, order: 1 },
  social: { name: { ja: "社会科学", en: "Social Sciences" }, order: 2 },
  natural: { name: { ja: "自然科学", en: "Natural Sciences" }, order: 3 },
};

/** 中ジャンル（どの大分類に属するかと表示順を持つ） */
export const genreMeta: Record<
  string,
  Labeled & { group: SubjectGroup; order: number }
> = {
  "language-learning": {
    name: { ja: "言語学習", en: "Language Learning" },
    group: "humanities",
    order: 1,
  },
  "language-literature": {
    name: { ja: "言語・文学", en: "Language and Literature" },
    group: "humanities",
    order: 2,
  },
  "history-thought-culture": {
    name: { ja: "歴史・思想・文化", en: "History, Thought and Culture" },
    group: "humanities",
    order: 3,
  },
  "society-region": {
    name: { ja: "地域・社会", en: "Regions and Society" },
    group: "social",
    order: 1,
  },
  "mathematics-information": {
    name: { ja: "数理・情報", en: "Mathematics and Information" },
    group: "natural",
    order: 1,
  },
  "matter-space-earth": {
    name: { ja: "物質・宇宙・地球", en: "Matter, Space and Earth" },
    group: "natural",
    order: 2,
  },
  "life-applied-science": {
    name: { ja: "生命・応用科学", en: "Life and Applied Sciences" },
    group: "natural",
    order: 3,
  },
};

export function groupLabel(group: string, locale: Locale): string {
  const meta = groupMeta[group as SubjectGroup];
  return meta ? localizedName(meta.name, locale) : group;
}

export function genreLabel(genre: string, locale: Locale): string {
  const meta = genreMeta[genre];
  return meta ? localizedName(meta.name, locale) : genre;
}

interface HasTaxonomy {
  data: { group: string; genre: string; order: number };
}

/**
 * 分野を 大分類 → 中ジャンル にまとめる。
 * 空の大分類・中ジャンルは返さないので、分野を足しても表示側は変更不要。
 */
export function groupSubjects<T extends HasTaxonomy>(
  subjects: T[],
  locale: Locale,
): {
  group: SubjectGroup;
  label: string;
  genres: { genre: string; label: string; subjects: T[] }[];
}[] {
  const byGroup = new Map<string, Map<string, T[]>>();
  for (const subject of subjects) {
    const g = subject.data.group;
    const genre = subject.data.genre;
    if (!byGroup.has(g)) byGroup.set(g, new Map());
    const genres = byGroup.get(g)!;
    genres.set(genre, [...(genres.get(genre) ?? []), subject]);
  }

  return GROUPS.filter((g) => byGroup.has(g))
    .sort((a, b) => groupMeta[a].order - groupMeta[b].order)
    .map((g) => ({
      group: g,
      label: groupLabel(g, locale),
      genres: [...byGroup.get(g)!.entries()]
        .sort(
          (a, b) =>
            (genreMeta[a[0]]?.order ?? 99) - (genreMeta[b[0]]?.order ?? 99),
        )
        .map(([genre, list]) => ({
          genre,
          label: genreLabel(genre, locale),
          subjects: [...list].sort((a, b) => a.data.order - b.data.order),
        })),
    }));
}
