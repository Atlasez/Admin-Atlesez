export type AdminUpdateKind = "機能追加" | "改善" | "データ" | "運用" | "分析";
export type AdminUpdateTone = "blue" | "green" | "violet" | "amber" | "cyan";

export interface AdminUpdate {
  version: string;
  date: string;
  title: string;
  summary: string;
  kind: AdminUpdateKind;
  project: string;
  tone: AdminUpdateTone;
  author: string;
  href?: string;
}

/** 運営サイトで共有する更新履歴。新しい項目を先頭に追加する。 */
export const ADMIN_UPDATES: readonly AdminUpdate[] = [
  {
    version: "v2.8.0",
    date: "2026-07-31",
    title: "記事執筆フローを更新",
    summary: "公開審査、概念ID、複数ペインの執筆画面を追加しました。",
    kind: "機能追加",
    project: "アトラス",
    tone: "blue",
    author: "Atlas編集部",
    href: "/admin/editor/",
  },
  {
    version: "v2.7.2",
    date: "2026-07-24",
    title: "カレンダーのタイムゾーン対応",
    summary:
      "Asia/Tokyo・UTCの切替、祝日表示、同時作業会の予定登録に対応しました。",
    kind: "改善",
    project: "運営事務局",
    tone: "green",
    author: "運営チーム",
    href: "/admin/calendar/?project=secretariat",
  },
  {
    version: "v2.7.0",
    date: "2026-07-18",
    title: "公開記事カタログを同期",
    summary:
      "公開記事と分野・カテゴリ情報を運営画面から確認できるようにしました。",
    kind: "データ",
    project: "アトラス",
    tone: "violet",
    author: "Atlas編集部",
    href: "/admin/genres/",
  },
  {
    version: "v2.6.1",
    date: "2026-07-09",
    title: "応募・承認フローを整理",
    summary:
      "応募状態、面談情報、プロフィール変更申請の確認手順を見直しました。",
    kind: "運用",
    project: "Atlasez運営事務局",
    tone: "amber",
    author: "運営チーム",
    href: "/admin/profile-requests/",
  },
  {
    version: "v2.6.0",
    date: "2026-06-28",
    title: "閲覧統計の集計項目を追加",
    summary: "15秒以上の滞在と本文90%到達を匿名集計に追加しました。",
    kind: "分析",
    project: "アトラス",
    tone: "cyan",
    author: "Atlas編集部",
    href: "/admin/analytics/",
  },
];
