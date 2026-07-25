/** URL・サイト共通ユーティリティ */
import type { Locale } from "./i18n";

/** ベースパスを付与した内部URL（末尾スラッシュ付き） */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export function atlasPath(locale: Locale, ...segments: string[]): string {
  const tail = segments.length > 0 ? `${segments.join("/")}/` : "";
  return withBase(`/atlas/${locale}/${tail}`);
}

export function articlePath(
  locale: Locale,
  subject: string,
  category: string,
  slug: string,
): string {
  return atlasPath(locale, subject, category, slug);
}

export const ORG = {
  name: "Atlasez",
  slogan: "未来の学びを創る。学びで未来を創る。",
  philosophy:
    "「学び」を共に楽しみ、共に創ることを通じ、一人一人が自分の持つ世界観を拡大・更新し続けることによって、全ての人がより一層日々を楽しめるような未来へと、改善・向上し続ける社会を実現する。",
  email: "atlasez.contact@gmail.com",
  githubRepo: "https://github.com/mitukx/atlasez-web",
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
