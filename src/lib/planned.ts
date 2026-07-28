import plannedData from "../data/planned-articles.json";
import type { Locale } from "./i18n";
import { localizedName } from "./i18n";

/** 執筆の進み具合。未指定は未着手として扱う。 */
export type PlannedProgress = "not-started" | "in-progress";

export interface PlannedArticle {
  subject: string;
  category: string;
  title: { ja: string; en?: string };
  order: number;
  progress?: PlannedProgress;
}

/** 進み具合（未指定なら未着手） */
export function plannedProgress(item: PlannedArticle): PlannedProgress {
  return item.progress === "in-progress" ? "in-progress" : "not-started";
}

// JSON から読み込むと progress は string になるので、ここで型を絞る。
// 想定外の値は plannedProgress() が未着手として扱う。
const plannedArticles: PlannedArticle[] = plannedData.items.map((item) => ({
  ...item,
  progress: item.progress === "in-progress" ? "in-progress" : "not-started",
}));

export function getPlannedArticles(
  subject: string,
  category?: string,
): PlannedArticle[] {
  return plannedArticles
    .filter(
      (item) =>
        item.subject === subject &&
        (category === undefined || item.category === category),
    )
    .sort((a, b) => a.order - b.order);
}

export function plannedArticleTitle(
  item: PlannedArticle,
  locale: Locale,
): string {
  return localizedName(item.title, locale);
}
