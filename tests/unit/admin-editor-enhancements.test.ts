import { describe, expect, it } from "vitest";
import { parseDirectiveMarker, subjectHue } from "../../src/scripts/admin-editor-enhancements";

describe("admin editor enhancements", () => {
  it("parses every named :::/:::: directive instead of limiting conversion to theorem aliases", () => {
    expect(parseDirectiveMarker(":::defi 群の定義")).toMatchObject({ fence: ":::”, name: "defi", title: "群の定義" });
    expect(parseDirectiveMarker("::::thm [Lagrange]")).toMatchObject({ fence: "::::", name: "thm", title: "Lagrange" });
    expect(parseDirectiveMarker(":::prop")).toMatchObject({ name: "prop", title: "命題" });
    expect(parseDirectiveMarker(":::cor")).toMatchObject({ name: "cor", title: "系" });
    expect(parseDirectiveMarker(":::lemma 補助結果")).toMatchObject({ name: "lemma", title: "補助結果" });
    expect(parseDirectiveMarker(":::custom-box 任意枠")).toMatchObject({ name: "custom-box", title: "任意枠" });
  });

  it("rejects closing fences and malformed directive starts", () => {
    expect(parseDirectiveMarker(":::" )).toBeNull();
    expect(parseDirectiveMarker("::defi" )).toBeNull();
    expect(parseDirectiveMarker(":::::defi" )).toBeNull();
  });

  it("keeps subject preview theming stable per subject", () => {
    expect(subjectHue("mathematics")).toBe(subjectHue("mathematics"));
    expect(subjectHue("mathematics")).not.toBe(subjectHue("kanji"));
  });
});
