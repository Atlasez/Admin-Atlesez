/** URL・サイト共通ユーティリティ */
import type { Locale } from "./i18n";

/** ベースパスを付与した内部URL（末尾スラッシュ付き） */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/** ロケールは string で受ける（公開ロケールを絞っても記事側の ja/en を扱えるように） */
export function atlasPath(locale: string, ...segments: string[]): string {
  const tail = segments.length > 0 ? `${segments.join("/")}/` : "";
  return withBase(`/atlas/${locale}/${tail}`);
}

export function articlePath(
  locale: string,
  subject: string,
  category: string,
  slug: string,
): string {
  return atlasPath(locale, subject, category, slug);
}

/**
 * 運営参加応募フォームのURL。
 *
 * 応募の受け口 `/api/apply` を持つのは管理Worker（`src/admin-worker.ts`）だけで、
 * 学習サイトWorkerは `/api/article-reports` と `/api/article-analytics` しか
 * 処理しない。公式サイトと同一オリジンの `/apply/` へ誘導すると、フォームは
 * 開けても送信だけが404になる。そのため公式サイトからは必ず管理Workerの
 * 絶対URLへ送る。
 *
 * ビルド時の環境変数 `ADMIN_ORIGIN` で配信元を指定する（例:
 * `https://atlasez-admin.example.workers.dev`）。未設定のときは同一オリジンへ
 * フォールバックするので、管理Workerを `npm run dev:admin` で動かしている
 * ローカル確認では `ADMIN_ORIGIN=http://localhost:8787` を渡すこと。
 */
export function applyUrl(query = ""): string {
  const origin = (
    typeof process === "undefined" ? undefined : process.env.ADMIN_ORIGIN
  )
    ?.trim()
    .replace(/\/$/, "");
  const path = `/apply/${query}`;
  return origin ? `${origin}${path}` : withBase(path);
}

export const ORG = {
  name: "Atlasez",
  slogan: "未来の学びを創る。学びで未来を創る。",
  philosophy:
    "「学び」を共に楽しみ、共に創ることを通じ、一人一人が自分の持つ世界観を拡大・更新し続けることによって、全ての人がより一層日々を楽しめるような未来へと、改善・向上し続ける社会を実現する。",
  email: "atlasez.contact@gmail.com",
  githubRepo: "https://github.com/mitukx/Atlasez01",
  sns: {
    x: "https://twitter.com/atlasez_info",
    instagram: "https://www.instagram.com/atlasez_info",
    facebook: "https://www.facebook.com/profile.php?id=100083575091966",
    line: "https://lin.ee/74hqMSB",
  },
  atlasSns: { x: "https://x.com/learning_atlas" },
} as const;

export function formatDate(date: Date, locale: Locale = "ja"): string {
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: locale === "ja" ? "numeric" : "short",
    day: "numeric",
  }).format(date);
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
