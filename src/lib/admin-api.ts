export async function readAdminApiJson<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    if (response.redirected || response.url.includes("cloudflareaccess.com"))
      throw new Error("認証が切れました。ページを再読み込みしてください。");
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
