import { afterEach, expect, it, vi } from "vitest";
import { createAdminTestEnvironment } from "../helpers/admin-test-environment";

afterEach(() => vi.restoreAllMocks());

it("keeps applicant personal data out of uncaught request error logs", async () => {
  const { env, request } = createAdminTestEnvironment();
  const email = "synthetic-applicant@example.test";
  const originalPrepare = env.REPORTS.prepare.bind(env.REPORTS);
  vi.spyOn(env.REPORTS, "prepare").mockImplementation((query) => {
    if (query.includes("SELECT a.id, a.project_slug"))
      throw new Error(`synthetic database failure for ${email}`);
    return originalPrepare(query);
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  const response = await request(
    `/api/applicant/me?email=${encodeURIComponent(email)}`,
    email,
  );
  expect(response.status).toBe(500);
  const body = (await response.json()) as { requestId?: string };
  expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);

  const loggedRequestFailure = error.mock.calls.find(
    ([event]) => event === "admin worker request failed",
  );
  expect(loggedRequestFailure).toBeDefined();
  const details = loggedRequestFailure?.[1] as
    | {
        requestId?: string;
        method?: string;
        pathname?: string;
        error?: unknown;
      }
    | undefined;
  expect(details).toMatchObject({
    requestId: body.requestId,
    method: "GET",
    routeClass: "applicant_api",
    errorClass: "error",
  });
  expect(details?.error).toBeUndefined();
  expect(
    loggedRequestFailure
      ?.flatMap((value) =>
        value instanceof Error ? [value.message] : [JSON.stringify(value)],
      )
      .join(" "),
  ).not.toContain(email);
});
