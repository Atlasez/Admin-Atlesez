import { describe, expect, it } from "vitest";
import { buildEditorialPreflight } from "../../src/lib/editorial-preflight.mjs";

describe("editorial test preflight", () => {
  it("reports invalid metadata and source diagnostics without mutating inputs", () => {
    const metadata = [
      {
        name: "slug",
        label: "URL用の名前",
        valid: false,
        message: "形式が違います",
      },
    ];
    const diagnostics: Array<{
      severity: "error" | "warning";
      code: string;
      line: number;
      column: number;
      message: string;
    }> = [
      {
        severity: "error",
        code: "math",
        line: 3,
        column: 1,
        message: "数式が閉じていません。",
      },
    ];
    const originalMetadata = structuredClone(metadata);
    const originalDiagnostics = structuredClone(diagnostics);

    const result = buildEditorialPreflight({ metadata, diagnostics });

    expect(result).toEqual([
      {
        severity: "error",
        code: "metadata-slug",
        message: "URL用の名前を確認してください。 形式が違います",
      },
      {
        severity: "error",
        code: "math",
        message: "3:1 数式が閉じていません。",
      },
    ]);
    expect(metadata).toEqual(originalMetadata);
    expect(diagnostics).toEqual(originalDiagnostics);
  });

  it("reports a pending preview and reports a clean check as a test result", () => {
    expect(buildEditorialPreflight({ previewStatus: "pending" })).toEqual([
      {
        severity: "warning",
        code: "preview-pending",
        message: "プレビューの描画中です。表示が完了してから確認してください。",
      },
    ]);
    expect(buildEditorialPreflight()).toEqual([
      {
        severity: "success",
        code: "preflight-passed",
        message:
          "入力必須項目と本文構造に確認事項はなく、プレビューを描画できました。",
      },
    ]);
    expect(buildEditorialPreflight({ previewStatus: "error" })).toEqual([
      {
        severity: "error",
        code: "preview-render-failed",
        message:
          "プレビューの描画でエラーが見つかりました。プレビュー内のエラー表示を確認してください。",
      },
    ]);
  });
});
