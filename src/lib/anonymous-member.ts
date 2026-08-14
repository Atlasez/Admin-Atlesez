/**
 * 表示名が未登録のメンバーにだけ表示する、安定した匿名表示名。
 *
 * メールアドレスそのものは画面へ出さず、正規化した値を FNV-1a 風に
 * ハッシュして 4 桁の番号へ変換します。したがってページを開き直しても
 * 同じメンバーには同じ番号が付き、表示名を登録すると通常の表示名へ戻ります。
 */
export function anonymousMemberLabel(email: string): string {
  const normalized = email.trim().toLowerCase();
  let hash = 2166136261;
  for (const character of normalized) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  const number = (hash >>> 0) % 9000 + 1000;
  return `運営メンバー ${number}`;
}

export function memberDisplayName(
  displayName: string | null | undefined,
  email: string,
): string {
  const normalized = displayName?.trim() ?? "";
  return !normalized || normalized === "表示名未設定"
    ? anonymousMemberLabel(email)
    : normalized;
}
