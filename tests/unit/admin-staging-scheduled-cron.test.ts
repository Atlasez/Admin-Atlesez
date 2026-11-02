import { expect, it, vi } from "vitest";
import worker from "../../src/admin-worker";
import { dispatchApplicationEmails } from "../../src/lib/application-email-delivery";
import { createAdminTestEnvironment } from "../helpers/admin-test-environment";

it("staging Cron only runs intake reconciliation by default and never reaches external services", async () => {
  const { env } = createAdminTestEnvironment();
  Object.assign(env, {
    ATLASEZ_STAGING_MODE: "true",
    ATLASEZ_STAGING_CRON_MODE: "intake-only",
    ATLASEZ_STAGING_EMAIL_DELIVERY: "disabled",
  });
  const prepare = vi.spyOn(env.REPORTS, "prepare");
  const fetcher = vi.mocked(fetch);
  const work: Promise<unknown>[] = [];
  await worker.scheduled?.({ cron: "*/5 * * * *" }, env as never, {
    waitUntil: (promise) => work.push(promise),
  });
  await Promise.all(work);

  expect(prepare.mock.calls).toHaveLength(1);
  expect(prepare.mock.calls[0]?.[0]).toContain(
    "intake_reconciliation_required=1",
  );
  expect(fetcher).not.toHaveBeenCalled();
});

it("staging Cron skips all other schedules, including the production publication and provider fan-out", async () => {
  const { env } = createAdminTestEnvironment();
  Object.assign(env, {
    ATLASEZ_STAGING_MODE: "true",
    ATLASEZ_STAGING_CRON_MODE: "intake-only",
    ATLASEZ_STAGING_EMAIL_DELIVERY: "test-sink",
  });
  const prepare = vi.spyOn(env.REPORTS, "prepare");
  const logger = vi.spyOn(console, "error").mockImplementation(() => {});
  const work: Promise<unknown>[] = [];
  await worker.scheduled?.({ cron: "*/2 * * * *" }, env as never, {
    waitUntil: (promise) => work.push(promise),
  });
  await Promise.all(work);
  expect(prepare).not.toHaveBeenCalled();
  expect(logger.mock.calls).toMatchObject([
    [
      JSON.stringify({
        event: "admin_staging_cron_skipped",
        reason: "unsupported_schedule",
      }),
    ],
  ]);
});

it("staging Cron fails closed if staging mode is present but invalid", async () => {
  const { env } = createAdminTestEnvironment();
  Object.assign(env, {
    ATLASEZ_STAGING_MODE: "false",
    ATLASEZ_STAGING_CRON_MODE: "intake-only",
  });
  const prepare = vi.spyOn(env.REPORTS, "prepare");
  const logger = vi.spyOn(console, "error").mockImplementation(() => {});
  const work: Promise<unknown>[] = [];
  await worker.scheduled?.({ cron: "*/5 * * * *" }, env as never, {
    waitUntil: (promise) => work.push(promise),
  });
  await Promise.all(work);
  expect(prepare).not.toHaveBeenCalled();
  expect(logger.mock.calls).toMatchObject([
    [
      JSON.stringify({
        event: "admin_staging_cron_skipped",
        reason: "staging_mode_invalid",
      }),
    ],
  ]);
});

it("staging origin alone prevents an absent mode from entering production Cron", async () => {
  const { env } = createAdminTestEnvironment();
  Object.assign(env, {
    ADMIN_PUBLIC_ORIGIN:
      "https://atlasez-admin-staging.synthetic-account.workers.dev",
  });
  const prepare = vi.spyOn(env.REPORTS, "prepare");
  const logger = vi.spyOn(console, "error").mockImplementation(() => {});
  const work: Promise<unknown>[] = [];
  await worker.scheduled?.({ cron: "*/5 * * * *" }, env as never, {
    waitUntil: (promise) => work.push(promise),
  });
  await Promise.all(work);
  expect(prepare).not.toHaveBeenCalled();
  expect(logger.mock.calls).toMatchObject([
    [
      JSON.stringify({
        event: "admin_staging_cron_skipped",
        reason: "staging_mode_invalid",
      }),
    ],
  ]);
});

it("Resend test-sink mode requires an exact synthetic recipient allowlist", async () => {
  const { db, env } = createAdminTestEnvironment();
  const now = new Date(Date.now() - 60_000).toISOString();
  db.prepare(
    `
    INSERT INTO atlasez_member_applications
      (id,name,email,interests,message,status,created_at,updated_at,project_slug,
       operator_notification_recipients_json,intake_reconciliation_required)
    VALUES ('stage-mail-fixture','synthetic fixture','allowed@atlasez.test','test','test','new',?,?,'thinking-cafe','[]',0)
  `,
  ).run(now, now);
  const insertDelivery = db.prepare(`
    INSERT INTO atlasez_application_email_deliveries
      (id,application_id,recipient_email,kind,subject,text_body,html_body,status,attempt_count,
       next_attempt_at,created_at,updated_at)
    VALUES (?,?,?,'applicant_confirmation','synthetic subject','synthetic body','<p>synthetic</p>','pending',0,?,?,?)
  `);
  insertDelivery.run(
    "stage-mail-allowed",
    "stage-mail-fixture",
    "allowed@atlasez.test",
    now,
    now,
    now,
  );
  insertDelivery.run(
    "stage-mail-blocked",
    "stage-mail-fixture",
    "blocked@atlasez.test",
    now,
    now,
    now,
  );
  Object.assign(env, {
    ATLASEZ_STAGING_MODE: "true",
    ATLASEZ_STAGING_CRON_MODE: "intake-only",
    ATLASEZ_STAGING_EMAIL_DELIVERY: "test-sink",
    ATLASEZ_STAGING_EMAIL_ALLOWLIST: "allowed@atlasez.test",
    RESEND_API_KEY: "synthetic-provider-key",
    EMAIL_FROM: "Atlasez Staging <noreply@staging.example.test>",
  });
  const fetcher = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ id: "synthetic-provider-acceptance" }),
  );
  vi.stubGlobal("fetch", fetcher);
  const work: Promise<unknown>[] = [];
  await worker.scheduled?.({ cron: "*/5 * * * *" }, env as never, {
    waitUntil: (promise) => work.push(promise),
  });
  await Promise.all(work);

  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0]?.[0])).toBe(
    "https://api.resend.com/emails",
  );
  expect(
    db
      .prepare(
        "SELECT status FROM atlasez_application_email_deliveries WHERE id='stage-mail-allowed'",
      )
      .get(),
  ).toEqual({ status: "sent" });
  expect(
    db
      .prepare(
        "SELECT status,last_error FROM atlasez_application_email_deliveries WHERE id='stage-mail-blocked'",
      )
      .get(),
  ).toEqual({
    status: "failed",
    last_error: "staging_recipient_not_allowlisted",
  });
});

it("Resend test-sink mode fails closed without its secret recipient allowlist", async () => {
  const { env } = createAdminTestEnvironment();
  Object.assign(env, {
    ATLASEZ_STAGING_MODE: "true",
    ATLASEZ_STAGING_CRON_MODE: "intake-only",
    ATLASEZ_STAGING_EMAIL_DELIVERY: "test-sink",
    RESEND_API_KEY: "synthetic-provider-key",
    EMAIL_FROM: "Atlasez Staging <noreply@staging.example.test>",
  });
  const fetcher = vi.fn(async () => Response.json({ id: "unexpected" }));
  vi.stubGlobal("fetch", fetcher);
  const work: Promise<unknown>[] = [];
  await worker.scheduled?.({ cron: "*/5 * * * *" }, env as never, {
    waitUntil: (promise) => work.push(promise),
  });
  await Promise.all(work);
  expect(fetcher).not.toHaveBeenCalled();
});

it("staging email delivery fails closed when disabled or allowlisted for a production address", async () => {
  const { env } = createAdminTestEnvironment();
  Object.assign(env, {
    ATLASEZ_STAGING_MODE: "true",
    ATLASEZ_STAGING_EMAIL_DELIVERY: "disabled",
    ATLASEZ_STAGING_EMAIL_ALLOWLIST: "allowed@atlasez.test",
    RESEND_API_KEY: "synthetic-provider-key",
    EMAIL_FROM: "Atlasez Staging <noreply@staging.example.test>",
  });
  const fetcher = vi.fn(async () => Response.json({ id: "unexpected" }));
  const logger = { info: vi.fn(), error: vi.fn() };
  expect(
    await dispatchApplicationEmails(env as never, { fetcher, logger }),
  ).toMatchObject({ skipped: true });
  expect(fetcher).not.toHaveBeenCalled();

  Object.assign(env, {
    ATLASEZ_STAGING_EMAIL_DELIVERY: "test-sink",
    ATLASEZ_STAGING_EMAIL_ALLOWLIST: "real-person@example.com",
  });
  expect(
    await dispatchApplicationEmails(env as never, { fetcher, logger }),
  ).toMatchObject({ skipped: true });
  expect(fetcher).not.toHaveBeenCalled();
  expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
    "real-person@example.com",
  );

  const { env: stagingOriginEnv } = createAdminTestEnvironment();
  Object.assign(stagingOriginEnv, {
    ADMIN_PUBLIC_ORIGIN:
      "https://atlasez-admin-staging.synthetic-account.workers.dev",
    RESEND_API_KEY: "synthetic-provider-key",
    EMAIL_FROM: "Atlasez Staging <noreply@staging.example.test>",
  });
  const originFetcher = vi.fn(async () => Response.json({ id: "unexpected" }));
  expect(
    await dispatchApplicationEmails(stagingOriginEnv as never, {
      fetcher: originFetcher,
      logger,
    }),
  ).toMatchObject({ skipped: true });
  expect(originFetcher).not.toHaveBeenCalled();
});
