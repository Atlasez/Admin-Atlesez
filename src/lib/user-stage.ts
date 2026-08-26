/**
 * Google 認証済みユーザーが、メンバー参加までのどこにいるかを表す。
 * 新しい状態を追加するときはここで状態の優先順位とアクセス先を定義する。
 */
export const USER_STAGES = [
  "NEW_USER",
  "APPLICATION_STARTED",
  "APPLICANT",
  "ACCEPTED",
  "ONBOARDING",
  "TUTORIAL",
  "MEMBER",
  "ADMIN",
] as const;

export type UserStage = (typeof USER_STAGES)[number];

export type UserStageInput = {
  applicationStatus?: string | null;
  /** プロフィール入力まで完了したか。 */
  profileComplete?: boolean;
  /** 参加プロジェクト内のプロフィール入力まで完了したか。 */
  projectProfileComplete?: boolean;
  /** ガイドを最後まで確認したか。 */
  tutorialComplete?: boolean;
  /** 旧呼び出し元向け。指定時はプロフィール・ガイドとも完了扱いにする。 */
  onboardingComplete?: boolean;
  isAdmin: boolean;
};

export type UserArea = "application" | "applicant" | "onboarding" | "admin";

/**
 * DB に保存されている応募状態と既存の運営権限表からステージを決める。
 * 管理権限は Google ログインや応募の有無とは独立しており、常に最優先する。
 */
export function getUserStage({
  applicationStatus,
  profileComplete,
  projectProfileComplete,
  tutorialComplete,
  onboardingComplete,
  isAdmin,
}: UserStageInput): UserStage {
  if (isAdmin) return "ADMIN";

  switch (applicationStatus) {
    case "new":
    case "reviewing":
    case "rejected":
      return "APPLICANT";
    case "accepted":
      // 既存の呼び出し元では onboardingComplete が全体完了を表していたため、
      // 明示的な値がないときだけ両方の後方互換値として使う。
      if (!(profileComplete ?? onboardingComplete ?? false))
        return "ONBOARDING";
      if (!(
        projectProfileComplete ??
        onboardingComplete ??
        profileComplete ??
        false
      ))
        return "ONBOARDING";
      return (tutorialComplete ?? onboardingComplete ?? false)
        ? "MEMBER"
        : "TUTORIAL";
    default:
      return "NEW_USER";
  }
}

/**
 * ページ・API の入口で共通利用するアクセス判定。
 * UI のタイル表示にもこの関数を使うことで、段階ごとの条件を散らさない。
 */
export function canAccess(stage: UserStage, area: UserArea): boolean {
  if (area === "application")
    return (
      stage === "NEW_USER" ||
      stage === "APPLICATION_STARTED" ||
      stage === "MEMBER" ||
      stage === "ADMIN"
    );
  if (area === "applicant") return stage === "APPLICANT" || stage === "MEMBER";
  if (area === "onboarding")
    return (
      stage === "ACCEPTED" || stage === "ONBOARDING" || stage === "TUTORIAL"
    );
  return stage === "ADMIN";
}

/** ステージが許可されない時に案内する、次に進める入口。 */
export function stageHome(
  stage: UserStage,
  _projectSlug?: string | null,
): string {
  if (stage === "NEW_USER" || stage === "APPLICATION_STARTED") return "/apply/";
  if (stage === "ACCEPTED" || stage === "ONBOARDING") return "/onboarding/";
  if (stage === "TUTORIAL") return "/onboarding/tutorial/";
  if (stage === "ADMIN") return "/admin/portal/";
  if (stage === "MEMBER") return "/admin/portal/";
  return "/applicant/";
}
