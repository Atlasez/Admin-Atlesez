export const isTestArticleTitle = (title: string): boolean =>
  /(^|[\s_-])test($|[\s_-])|テスト/i.test(title);
