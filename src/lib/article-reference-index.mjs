import { parseArticleDirectiveMarker } from "./article-directives.mjs";

const STATEMENT_LABELS = {
  defi: "定義",
  definition: "定義",
  prop: "命題",
  proposition: "命題",
  thm: "定理",
  theorem: "定理",
  lemma: "補題",
  cor: "系",
  corollary: "系",
  example: "例",
};

const DIRECTIVE_LINE = /^\s*:{3,4}\s*[A-Za-z][A-Za-z0-9_-]*(?:\s+.*?)?\s*$/gm;

/**
 * Build the public statement index used to resolve references across articles.
 * The source body is intentionally scanned before Markdown rendering so the
 * numbering matches the reading order used by the published DOM.
 */
export function buildArticleStatementIndex(articles) {
  const result = [];
  for (const article of articles) {
    const body = String(article.body ?? "");
    // Keep external references consistent with the public article renderer:
    // every mathematical statement type uses the same article-local counter.
    let statementNumber = 0;
    DIRECTIVE_LINE.lastIndex = 0;
    let match;
    while ((match = DIRECTIVE_LINE.exec(body))) {
      const marker = parseArticleDirectiveMarker(match[0]);
      const label = marker && STATEMENT_LABELS[marker.name];
      if (!marker || !label) continue;
      const number = ++statementNumber;
      if (!marker.id) continue;
      result.push({
        id: marker.id,
        articleId: article.data.articleId,
        locale: article.data.locale,
        articleTitle: article.data.title,
        label,
        number,
        subject: article.data.subject,
        category: article.data.category,
        slug: article.data.slug,
      });
    }
  }
  return result;
}
