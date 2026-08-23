import { describe, expect, it } from "vitest";
import {
  parseDirectiveMarker,
  subjectHue,
} from "../../src/scripts/admin-editor-enhancements";
import { parseEditorialAssetMarker } from "../../src/scripts/admin-editor-comment-images";
import { parsePreviewAssetMarker } from "../../src/scripts/admin-editor-preview-images";
import { dedupePresenceParticipants } from "../../src/scripts/admin-editor-realtime-presence";
import {
  extractDocumentMacros,
  macroSignature,
} from "../../src/scripts/admin-editor-math-macros";
import { formatCollaborationLabel } from "../../src/scripts/admin-editor-collaboration-labels";

describe("admin editor enhancements", () => {
  it("parses every named :::/:::: directive instead of limiting conversion to theorem aliases", () => {
    expect(parseDirectiveMarker(":::defi 群の定義")).toMatchObject({
      fence: ":::",
      name: "defi",
      title: "群の定義",
    });
    expect(parseDirectiveMarker("::::thm [Lagrange]")).toMatchObject({
      fence: "::::",
      name: "thm",
      title: "Lagrange",
    });
    expect(parseDirectiveMarker(":::prop")).toMatchObject({
      name: "prop",
      title: "命題",
    });
    expect(parseDirectiveMarker(":::cor")).toMatchObject({
      name: "cor",
      title: "系",
    });
    expect(parseDirectiveMarker(":::lemma 補助結果")).toMatchObject({
      name: "lemma",
      title: "補助結果",
    });
    expect(parseDirectiveMarker(":::custom-box 任意枠")).toMatchObject({
      name: "custom-box",
      title: "任意枠",
    });
  });

  it("rejects closing fences and malformed directive starts", () => {
    expect(parseDirectiveMarker(":::")).toBeNull();
    expect(parseDirectiveMarker("::defi")).toBeNull();
    expect(parseDirectiveMarker(":::::defi")).toBeNull();
  });

  it("keeps subject preview theming stable per subject", () => {
    expect(subjectHue("mathematics")).toBe(subjectHue("mathematics"));
    expect(subjectHue("mathematics")).not.toBe(subjectHue("kanji"));
  });

  it("recognizes article image markers stored in comment selections", () => {
    expect(
      parseEditorialAssetMarker(
        "![StobbeCondensation.png](asset://a923f490-f674-4ce4-b0af-155001f048d9)",
      ),
    ).toEqual({
      alt: "StobbeCondensation.png",
      id: "a923f490-f674-4ce4-b0af-155001f048d9",
    });
    expect(parseEditorialAssetMarker("ordinary selected text")).toBeNull();
  });

  it("recognizes article image markers for the live preview fallback", () => {
    expect(
      parsePreviewAssetMarker(
        "![StobbeCondensation.png](asset://a923f490-f674-4ce4-b0af-155001f048d9)",
      ),
    ).toEqual({
      alt: "StobbeCondensation.png",
      id: "a923f490-f674-4ce4-b0af-155001f048d9",
    });
    expect(
      parsePreviewAssetMarker("![image](https://example.com/image.png)"),
    ).toBeNull();
  });

  it("deduplicates multiple collaboration sockets for the same member", () => {
    const participants = dedupePresenceParticipants([
      {
        sessionId: "sync-a",
        email: "uesugi@example.com",
        displayName: "上杉和輝",
        field: "body",
        cursorStart: null,
        cursorEnd: null,
      },
      {
        sessionId: "presence-a",
        email: "UESUGI@example.com",
        displayName: "上杉和輝",
        field: "body",
        cursorStart: 120,
        cursorEnd: 120,
      },
      {
        sessionId: "sync-b",
        email: "kobayashi@example.com",
        displayName: "小林和真",
        field: "body",
        cursorStart: null,
        cursorEnd: null,
      },
      {
        sessionId: "presence-b",
        email: "kobayashi@example.com",
        displayName: "小林和真",
        field: "body",
        cursorStart: 42,
        cursorEnd: 48,
      },
    ]);

    expect(participants).toHaveLength(2);
    expect(participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "uesugi@example.com",
          cursorStart: 120,
          cursorEnd: 120,
        }),
        expect.objectContaining({
          email: "kobayashi@example.com",
          cursorStart: 42,
          cursorEnd: 48,
        }),
      ]),
    );
  });

  it("extracts TeX definitions once and shares them across preview equations", () => {
    const macros = extractDocumentMacros(
      [
        "$$",
        "\\def\\R{\\mathbb{R}}",
        "\\def\\pair#1#2{(#1,#2)}",
        "$$",
        "",
        "Later: $x \\in \\R$ and $\\pair{x}{y}$.",
      ].join("\n"),
    );

    expect(macros).toEqual({
      "\\R": "\\mathbb{R}",
      "\\pair": "(#1,#2)",
    });
    expect(macroSignature(macros)).toBe(macroSignature({ ...macros }));
  });

  it("shows collaborator names only in the participant UI", () => {
    expect(formatCollaborationLabel("上杉和輝・本文")).toBe("上杉和輝");
    expect(formatCollaborationLabel("小林和真・本文・12行8列")).toBe("小林和真");
    expect(formatCollaborationLabel("小林和真・タイトル")).toBe("小林和真");
  });
});
