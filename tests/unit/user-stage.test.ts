import { describe, expect, it } from "vitest";
import { canAccess, getUserStage, stageHome } from "../../src/lib/user-stage";

describe("user stages", () => {
  it("keeps Google authentication and admin permission separate", () => {
    expect(getUserStage({ isAdmin: false })).toBe("NEW_USER");
    expect(getUserStage({ isAdmin: true })).toBe("ADMIN");
  });

  it("distinguishes an applicant from a user without an application", () => {
    const applicant = getUserStage({
      isAdmin: false,
      applicationStatus: "reviewing",
    });
    expect(applicant).toBe("APPLICANT");
    expect(canAccess(applicant, "applicant")).toBe(true);
    expect(canAccess(applicant, "admin")).toBe(false);
    expect(canAccess("NEW_USER", "applicant")).toBe(true);
    expect(canAccess("MEMBER", "application")).toBe(true);
    expect(canAccess("ADMIN", "application")).toBe(true);
    expect(stageHome("NEW_USER")).toBe("/applicant/");
    expect(stageHome("MEMBER", "secretariat")).toBe("/admin/portal/");
  });

  it("requires profile setup and the tutorial after acceptance before reaching the member stage", () => {
    expect(
      getUserStage({ isAdmin: false, applicationStatus: "accepted" }),
    ).toBe("ONBOARDING");
    expect(
      getUserStage({
        isAdmin: false,
        applicationStatus: "accepted",
        profileComplete: true,
        projectProfileComplete: false,
      }),
    ).toBe("ONBOARDING");
    expect(
      getUserStage({
        isAdmin: false,
        applicationStatus: "accepted",
        profileComplete: true,
        projectProfileComplete: true,
      }),
    ).toBe("TUTORIAL");
    expect(
      getUserStage({
        isAdmin: false,
        applicationStatus: "accepted",
        profileComplete: true,
        tutorialComplete: true,
      }),
    ).toBe("MEMBER");
    expect(canAccess("ONBOARDING", "onboarding")).toBe(true);
    expect(canAccess("TUTORIAL", "onboarding")).toBe(true);
    expect(stageHome("TUTORIAL")).toBe("/onboarding/tutorial/");
  });
});
