/**
 * @typedef {{name: string; label: string; valid: boolean; message?: string}} PreflightMetadata
 * @typedef {{severity: "error" | "warning"; code: string; line: number; column: number; message: string}} PreflightDiagnostic
 * @typedef {{severity: "error" | "warning" | "success"; code: string; message: string}} PreflightResult
 */

/** Build read-only editorial preflight results from values already in the editor. */
/** @param {{metadata?: PreflightMetadata[]; diagnostics?: PreflightDiagnostic[]; previewStatus?: "pending" | "ready" | "error"}} [options] @returns {PreflightResult[]} */
export function buildEditorialPreflight({
  metadata = [],
  diagnostics = [],
  previewStatus = "ready",
} = {}) {
  const results = [];

  for (const field of metadata) {
    if (!field.valid) {
      results.push({
        severity: "error",
        code: `metadata-${field.name}`,
        message: `${field.label}を確認してください。${field.message ? ` ${field.message}` : ""}`,
      });
    }
  }

  for (const item of diagnostics) {
    results.push({
      severity: item.severity,
      code: item.code,
      message: `${item.line}:${item.column} ${item.message}`,
    });
  }

  if (previewStatus === "pending") {
    results.push({
      severity: "warning",
      code: "preview-pending",
      message: "プレビューの描画中です。表示が完了してから確認してください。",
    });
  } else if (previewStatus === "error") {
    results.push({
      severity: "error",
      code: "preview-render-failed",
      message:
        "プレビューの描画でエラーが見つかりました。プレビュー内のエラー表示を確認してください。",
    });
  }

  if (!results.length) {
    results.push({
      severity: "success",
      code: "preflight-passed",
      message:
        "入力必須項目と本文構造に確認事項はなく、プレビューを描画できました。",
    });
  }

  return results;
}
