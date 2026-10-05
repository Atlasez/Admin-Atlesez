export type PublicArticleRegistrationState =
  | "managed"
  | "needs-registration"
  | "unmanaged"
  | "duplicate"
  | "identity-conflict"
  | string;

export interface PublicArticleRegistrationCandidate {
  title: string;
  managementState?: PublicArticleRegistrationState;
}

export interface ArticleRegistrationScope {
  allSubjects?: boolean;
  subjects?: string[];
}

export const canRegisterArticleInSubject = (
  scope: ArticleRegistrationScope | null | undefined,
  subject: string,
): boolean => Boolean(scope?.allSubjects || scope?.subjects?.includes(subject));

export const isTestArticleTitle = (title: string): boolean =>
  /(^|[\s_-])test($|[\s_-])|テスト/i.test(title);

/** Bulk registration is restricted to confirmed unmanaged, non-test articles. */
export const isBulkArticleRegistrationCandidate = (
  article: PublicArticleRegistrationCandidate,
  canEditArticleSubject: boolean,
): boolean =>
  canEditArticleSubject &&
  article.managementState === "unmanaged" &&
  !isTestArticleTitle(article.title);
