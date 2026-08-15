/**
 * デプロイ環境の判定。
 *
 * Cloudflare Pages はビルド時に CF_PAGES / CF_PAGES_BRANCH を渡してくる。
 * プレビュー配信（main 以外のブランチ）を検索エンジンに拾わせないために使う。
 *
 * 静的生成なのでビルド時に評価される。ブラウザ側では参照しないこと。
 */

function env(name: string): string | undefined {
  return typeof process === "undefined" ? undefined : process.env[name];
}

/** 本番として検索エンジンに公開してよいビルドかどうか */
export const IS_PRODUCTION_DEPLOY: boolean = (() => {
  // 明示指定が最優先。GitHub Pages のミラーのように、canonical や sitemap の
  // URL は正しく組み立てたいが検索エンジンには載せたくないビルドで NOINDEX=1
  // を渡す。同じ内容のサイトが複数のURLで索引されるのを防ぐ。
  const noindex = env("NOINDEX");
  if (noindex === "1" || noindex === "true") return false;
  // Cloudflare Pages 上のビルド。main 以外はプレビュー扱い。
  if (env("CF_PAGES")) return env("CF_PAGES_BRANCH") === "main";
  // それ以外（ローカル・GitHub Actions）は SITE_URL が明示された時だけ本番扱い。
  return Boolean(env("SITE_URL"));
})();
