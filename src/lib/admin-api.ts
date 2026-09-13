export async function readAdminApiJson<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const isAccessRedirect =
    response.redirected || response.url.includes("cloudflareaccess.com");
  if (response.status === 401 || isAccessRedirect) {
    throw new Error(
      "認証セッションを確認できません。Cookieの期限切れまたは認証方式の不一致です。管理サイトへ戻って再認証してください。",
    );
  }
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      response.ok
        ? fallbackMessage
        : `${fallbackMessage}（HTTP ${response.status}）`,
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`${fallbackMessage}（応答データの形式が不正です）`);
  }
}
