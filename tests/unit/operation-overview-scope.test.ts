import { expect, it } from "vitest";
import {
  OPERATION_SCOPE_MISSING_MESSAGE,
  readOperationScope,
} from "../../src/lib/operation-overview-scope";

it("reads a manager scope and refuses a payload that would crash the operations page", () => {
  expect(OPERATION_SCOPE_MISSING_MESSAGE).toContain("再読み込み");
  expect(OPERATION_SCOPE_MISSING_MESSAGE).not.toMatch(/isManager|undefined/);
  expect(
    readOperationScope({
      scope: {
        isManager: true,
        projectRole: "manager",
        email: "a@example.com",
      },
    }),
  ).toEqual({
    isManager: true,
    projectRole: "manager",
    email: "a@example.com",
  });
  expect(readOperationScope({ tasks: [] })).toBeNull();
  expect(readOperationScope({ scope: null })).toBeNull();
  expect(readOperationScope(undefined)).toBeNull();
  expect(readOperationScope({ scope: { isManager: "yes" } })).toMatchObject({
    isManager: false,
    email: "",
  });
});
