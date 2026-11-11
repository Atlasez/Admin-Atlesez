/**
 * 承認済みのログイン・404・認証失敗・ページ500・ログアウト画面。
 * ブラウザの画面応答だけがこれを使い、API の JSON は変えない。
 */

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );

const acceptQuality = (accept: string, type: string) => {
  let best = 0;
  for (const part of accept.split(",")) {
    const [rawType, ...params] = part.trim().toLowerCase().split(";");
    const media = rawType.trim();
    if (!media) continue;
    const qParam = params
      .map((param) => param.trim())
      .find((param) => param.startsWith("q="));
    const quality = qParam ? Number(qParam.slice(2)) : 1;
    if (!Number.isFinite(quality) || quality <= 0) continue;
    const matches =
      media === type ||
      media === "*/*" ||
      (media.endsWith("/*") && type.startsWith(media.slice(0, -1)));
    if (matches) best = Math.max(best, quality);
  }
  return best;
};

/** ブラウザの画面遷移だけ HTML にする。Accept が無い、または JSON の方が優先なら JSON のまま。 */
export const prefersAdminHtml = (request: Request) => {
  const accept = request.headers.get("accept") ?? "";
  if (!accept.trim()) return false;
  return (
    acceptQuality(accept, "text/html") >
    acceptQuality(accept, "application/json")
  );
};

export const adminLoginStartPath = (returnTo: string) => {
  const params = new URLSearchParams({ start: "1", returnTo });
  return `/auth/google/login?${params.toString()}`;
};

export const safeRetryPath = (url: URL) => {
  const path = `${url.pathname}${url.search}`;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))
    return "/";
  return path;
};

const documentPage = (
  title: string,
  description: string,
  body: string,
) => `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <style>
    :root {
      color-scheme: light;
      --text-primary: #182027;
      --text-secondary: #56616a;
      --background-primary: #ffffff;
      --background-secondary: #f5f7f8;
      --border-default: #d5dde2;
      --accent-primary: #173f62;
      --on-accent: #ffffff;
    }
    body {
      background: var(--background-primary);
      color: var(--text-primary);
      font-family: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "BIZ UDPGothic", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif;
      margin: 0;
    }
    .gate { margin: 0 auto; max-width: 34rem; padding: 4.5rem 1.25rem 5rem; }
    .mark { color: var(--accent-primary); font-size: .78rem; font-weight: 800; margin: 0; }
    h1 { font-size: clamp(1.7rem, 4vw, 2.2rem); letter-spacing: -.03em; margin: .4rem 0 .8rem; }
    p { color: var(--text-secondary); line-height: 1.75; margin: 0; }
    .actions { display: flex; flex-wrap: wrap; gap: .6rem; margin: 1.4rem 0; }
    .primary, .secondary { font-weight: 800; padding: .8rem 1rem; text-decoration: none; }
    .primary { background: var(--accent-primary); color: var(--on-accent); }
    a.primary { display: inline-block; }
    .secondary { border: 1px solid var(--border-default); color: var(--text-primary); }
    .help { font-size: .82rem; margin-top: 1.4rem; }
    .help a, .request-id { color: inherit; }
    .help a { color: var(--accent-primary); }
    .request-id { background: var(--background-secondary); border: 1px solid var(--border-default); margin: 1.2rem 0; padding: .8rem 1rem; }
    .request-id code { font-size: .82rem; }
  </style>
</head>
<body>
  <main class="gate">
    <p class="mark">Atlasez運営</p>
    ${body}
  </main>
</body>
</html>`;

export const adminLoginPage = (returnTo: string) =>
  documentPage(
    "管理サイトへログイン",
    "運営サイトへは、応募や参加に使ったGoogleアカウントでログインします。",
    `<h1>管理サイトへログイン</h1>
    <p>応募や参加に使ったのと同じGoogleアカウントでログインします。パスワードはありません。別のGoogleアカウントは別の人として扱われます。</p>
    <p class="actions"><a class="primary" href="${escapeHtml(adminLoginStartPath(returnTo))}">Googleアカウントでログイン</a></p>
    <p class="help">ログインできないときは、<a href="https://atlasez.org/contact/">お問い合わせ</a>から運営事務局へ連絡してください。</p>`,
  );

export const adminNotFoundPage = () =>
  documentPage(
    "ページが見つかりません",
    "運営サイトでページが見つかりません。",
    `<h1>ページが見つかりません</h1>
    <p>アドレスを確認するか、ログインしてから開き直してください。セッションが切れている場合も、この運営サイトの画面に戻します。</p>
    <div class="actions">
      <a class="primary" href="/auth/google/login">ログイン画面へ</a>
      <a class="secondary" href="https://atlasez.org/">公式サイトを開く</a>
    </div>
    <p class="help">公開サイトのページを探している場合は、<a href="https://atlasez.org/">Atlasez公式サイト</a>を開いてください。</p>`,
  );

export const adminAuthErrorPage = (message: string) =>
  documentPage(
    "ログインを確認できませんでした",
    "Googleログインの確認に失敗しました。",
    `<h1>ログインを確認できませんでした</h1>
    <p>${escapeHtml(message)}</p>
    <p class="actions"><a class="primary" href="/auth/google/login">ログインをやり直す</a></p>
    <p class="help">同じ失敗が続くときは、使ったGoogleアカウントと時刻を添えて<a href="https://atlasez.org/contact/">お問い合わせ</a>へ連絡してください。パスワードや認証コードは送らないでください。</p>`,
  );

export const adminServerErrorPage = (requestId: string, retryPath: string) =>
  documentPage(
    "ページを表示できませんでした",
    "運営サイトのページを表示できませんでした。",
    `<h1>ページを表示できませんでした</h1>
    <p>時間をおいて再読み込みしてください。改善しない場合は、下の受付番号を添えて運営事務局へ連絡してください。</p>
    <p class="request-id">受付番号 <code>${escapeHtml(requestId)}</code></p>
    <div class="actions">
      <a class="primary" href="${escapeHtml(retryPath)}">再読み込み</a>
      <a class="secondary" href="/auth/google/login">ログイン画面へ</a>
    </div>
    <p class="help"><a href="https://atlasez.org/contact/">お問い合わせ</a>では、時刻・開いていたURL・操作を伝えてください。パスワードや認証コードは送らないでください。</p>`,
  );

export const adminLoggedOutPage = () =>
  documentPage(
    "ログアウトしました",
    "運営サイトからログアウトしました。",
    `<h1>ログアウトしました</h1>
    <p>再度利用する場合は、管理サイトへ戻ってログインしてください。</p>
    <p class="actions"><a class="primary" href="/auth/google/login">管理サイトへ戻る</a></p>`,
  );

export const ADMIN_GATE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export const adminGateResponse = (html: string, status = 200) =>
  new Response(html, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": ADMIN_GATE_CSP,
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
