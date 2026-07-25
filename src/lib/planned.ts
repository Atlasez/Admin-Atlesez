import plannedData from "../data/planned-articles.json";
import type { Locale } from "./i18n";
import { localizedName } from "./i18n";

export interface PlannedArticle {
  subject: string;
  category: string;
  title: { ja: string; en?: string };
  order: number;
}

const plannedArticles = plannedData.items satisfies PlannedArticle[];

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
