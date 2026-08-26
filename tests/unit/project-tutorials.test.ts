import { describe, expect, it } from "vitest";
import {
  projectTutorialCheckpoints,
  projectTutorials,
} from "../../src/lib/project-tutorials";

describe("project tutorials", () => {
  it("provides an interactive confirmation for every displayed project step", () => {
    for (const project of ["atlas", "secretariat", "seminar-platform"]) {
      const steps = projectTutorials[project];
      const checkpoints = projectTutorialCheckpoints[project];

      expect(checkpoints).toHaveLength(steps.length);
      for (const checkpoint of checkpoints) {
        expect(checkpoint.prompt).not.toBe("");
        expect(checkpoint.instruction).not.toBe("");
        expect(checkpoint.choices.length).toBeGreaterThanOrEqual(2);
        expect(checkpoint.confirmLabel).not.toBe("");
      }
    }
  });
});
