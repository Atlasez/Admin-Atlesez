const PORTAL_URL = "https://admin.atlasez.org/admin/portal/";
const GETTING_STARTED_URL = "https://admin.atlasez.org/admin/getting-started/";
const APPLICANT_URL = "https://admin.atlasez.org/applicant/";

export type ApplicationAcceptanceEmail = {
  subject: string;
  textBody: string;
  htmlBody: string;
};

/**
 * 承認メールの本文。参加者が実際に通る手順だけを書く。
 * 自己紹介のあとに届かなくなった4段階チュートリアルは案内しない。
 */
export const applicationAcceptanceEmail = (
  projectLabel: string,
  english: boolean,
  htmlProjectLabel = projectLabel,
): ApplicationAcceptanceEmail => {
  if (english) {
    const textBody = [
      "This is Atlasez management.",
      "",
      `Your application to ${projectLabel} has been accepted.`,
      "Sign in to the management site with the same Google account you used to apply. There is no separate password.",
      "",
      "Save two self-introductions before anything else:",
      "1. Your display name and public bio.",
      "2. Your bio for people inside the project.",
      "",
      "After both are saved, open the portal and the getting-started guide.",
      `Portal: ${PORTAL_URL}`,
      `Getting started: ${GETTING_STARTED_URL}`,
      "",
      "Connect Discord only after those self-introductions are saved. During self-introduction, the application status page sends you back to the intro screens.",
      `Application status: ${APPLICANT_URL}`,
    ].join("\n");
    return {
      subject: `Atlasez | Your application to ${projectLabel} was accepted`,
      textBody,
      htmlBody: `<h2>Application accepted</h2><p>Your application to ${htmlProjectLabel} has been accepted.</p><p>Sign in with the same Google account you used to apply. There is no separate password.</p><p>Save two self-introductions first: your display name and public bio, then your bio for people inside the project.</p><p>After both are saved, open the <a href="${PORTAL_URL}">portal</a> and the <a href="${GETTING_STARTED_URL}">getting-started guide</a>.</p><p>Connect Discord only after those self-introductions are saved. During self-introduction, the <a href="${APPLICANT_URL}">application status page</a> sends you back to the intro screens.</p>`,
    };
  }
  const textBody = [
    "Atlasez運営です。",
    "",
    `${projectLabel}への参加が承認されました。`,
    "応募に使ったのと同じGoogleアカウントで管理サイトにログインしてください。パスワードはありません。",
    "",
    "最初に、自己紹介を2画面保存します。",
    "1. 表示名と、公開用の自己紹介",
    "2. プロジェクト内の自己紹介",
    "",
    "両方を保存すると、ポータルと参加後の案内を使えます。",
    `ポータル：${PORTAL_URL}`,
    `参加後の案内：${GETTING_STARTED_URL}`,
    "",
    "Discordの連携は、自己紹介を保存したあとで行います。自己紹介の途中では、応募状況の画面から自己紹介へ戻されます。",
    `応募状況：${APPLICANT_URL}`,
  ].join("\n");
  return {
    subject: `Atlasez｜${projectLabel}への参加が承認されました`,
    textBody,
    htmlBody: `<h2>参加が承認されました</h2><p>${htmlProjectLabel}への参加が承認されました。</p><p>応募に使ったのと同じGoogleアカウントで管理サイトにログインしてください。パスワードはありません。</p><p>最初に自己紹介を2画面保存します。表示名と公開用の自己紹介、続いてプロジェクト内の自己紹介です。</p><p>両方を保存すると、<a href="${PORTAL_URL}">ポータル</a>と<a href="${GETTING_STARTED_URL}">参加後の案内</a>を使えます。</p><p>Discordの連携は、自己紹介を保存したあとで行います。自己紹介の途中では、<a href="${APPLICANT_URL}">応募状況</a>の画面から自己紹介へ戻されます。</p>`,
  };
};
