/** Compare editable content without the server's optimistic concurrency token. */
export function documentSaveFingerprint(
  payload: Record<string, unknown>,
): string {
  const content = { ...payload };
  delete content.baseUpdatedAt;
  return JSON.stringify(content);
}
