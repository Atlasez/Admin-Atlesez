import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ADMIN_STAGING_TEMPLATE_PATH,
  parseAdminStagingConfig,
  validateAdminStagingConfig,
} from "../../scripts/lib/admin-staging-config.mjs";
import { ADMIN_STAGING_ACCOUNTS } from "../fixtures/admin-staging-accounts";

function safeStagingConfig() {
  const example = parseAdminStagingConfig(
    readFileSync(ADMIN_STAGING_TEMPLATE_PATH, "utf8"),
  );
  const origin = "https://atlasez-admin-staging.synthetic-account.workers.dev";
  example.account_id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  example.vars.ADMIN_PUBLIC_ORIGIN = origin;
  example.vars.PUBLIC_ANALYTICS_ORIGIN = origin;
  example.vars.PUBLIC_SITE_ORIGIN = origin;
  example.vars.GOOGLE_OAUTH_CLIENT_ID =
    "synthetic-staging.apps.googleusercontent.com";
  example.vars.DISCORD_GUILD_ID = "123456789012345678";
  example.vars.DISCORD_OAUTH_CLIENT_ID = "123456789012345679";
  example.vars.EMAIL_FROM = "Atlasez Staging <noreply@staging.example.test>";
  example.vars.APPLICATION_OPERATIONS_EMAILS = "operator@staging.example.test";
  example.d1_databases[0].database_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  return example;
}

describe("ADMIN staging isolation preflight", () => {
  it("accepts only the explicit non-deployable template in example mode", () => {
    const example = parseAdminStagingConfig(
      readFileSync(ADMIN_STAGING_TEMPLATE_PATH, "utf8"),
    );
    expect(validateAdminStagingConfig(example, { allowExample: true })).toEqual(
      [],
    );
    expect(validateAdminStagingConfig(example)).toContain(
      "account_id must be an explicit Cloudflare account ID",
    );
  });

  it("accepts a staging Worker, workers.dev origin, isolated D1, and test provider identities", () => {
    expect(validateAdminStagingConfig(safeStagingConfig())).toEqual([]);
  });

  it("accepts an old-Worker compatibility config only when scheduled triggers are absent", () => {
    const noCron = safeStagingConfig();
    delete noCron.triggers;
    expect(
      validateAdminStagingConfig(noCron, { compatibilityNoCron: true }),
    ).toEqual([]);
    expect(validateAdminStagingConfig(noCron)).toContain(
      "only the guarded five-minute intake reconciliation Cron is allowed",
    );

    const scheduled = safeStagingConfig();
    expect(
      validateAdminStagingConfig(scheduled, { compatibilityNoCron: true }),
    ).toContain(
      "old-Worker compatibility config must contain no scheduled triggers",
    );
  });

  it("rejects the production Worker, D1, route, or Discord guild/client", () => {
    const cases = [
      (config: ReturnType<typeof safeStagingConfig>) => {
        config.name = "atlasez-admin";
      },
      (config: ReturnType<typeof safeStagingConfig>) => {
        config.d1_databases[0].database_id =
          "d5112a62-7ed6-49c8-b6a2-18ee2dbab678";
      },
      (config: ReturnType<typeof safeStagingConfig>) => {
        config.vars.ADMIN_PUBLIC_ORIGIN = "https://admin.atlasez.org";
      },
      (config: ReturnType<typeof safeStagingConfig>) => {
        config.vars.DISCORD_GUILD_ID = "1359062450028282017";
      },
      (config: ReturnType<typeof safeStagingConfig>) => {
        config.vars.DISCORD_OAUTH_CLIENT_ID = "1537142952210464868";
      },
      (config: ReturnType<typeof safeStagingConfig>) => {
        config.routes = [{ pattern: "admin.atlasez.org", custom_domain: true }];
      },
    ];
    for (const mutate of cases) {
      const config = safeStagingConfig();
      mutate(config);
      expect(validateAdminStagingConfig(config).length).toBeGreaterThan(0);
    }
  });

  it("rejects production routes, production Cron fan-out, and secrets in versioned vars", () => {
    const routes = safeStagingConfig();
    routes.routes = [{ pattern: "*.atlasez.org/*" }];
    expect(validateAdminStagingConfig(routes)).toContain(
      "custom Routes are not allowed in this staging config",
    );

    const cron = safeStagingConfig();
    cron.triggers.crons = ["*/1 * * * *", "*/5 * * * *"];
    expect(validateAdminStagingConfig(cron)).toContain(
      "only the guarded five-minute intake reconciliation Cron is allowed",
    );

    const secret = safeStagingConfig();
    secret.vars.RESEND_API_KEY = "do-not-store";
    expect(validateAdminStagingConfig(secret)).toContain(
      "secrets must not be stored in vars (RESEND_API_KEY)",
    );
  });

  it("rejects unreviewed provider variables and remote resource bindings", () => {
    const providerVar = safeStagingConfig();
    providerVar.vars.GITHUB_APP_ID = "production-app";
    expect(validateAdminStagingConfig(providerVar)).toContain(
      "unsupported staging var is forbidden (GITHUB_APP_ID)",
    );

    for (const key of ["services", "kv_namespaces", "r2_buckets", "queues"]) {
      const config = safeStagingConfig();
      config[key] = [{ binding: "RESOURCE", id: "production-resource" }];
      expect(validateAdminStagingConfig(config)).toContain(
        `unsupported top-level setting is forbidden (${key})`,
      );
    }

    const wrongEntrypoint = safeStagingConfig();
    wrongEntrypoint.main = "src/public-worker.ts";
    expect(validateAdminStagingConfig(wrongEntrypoint)).toContain(
      "main must be the reviewed ADMIN Worker entrypoint",
    );
  });

  it("contains a synthetic fixture for every requested role and lifecycle boundary", () => {
    const keys = new Set(ADMIN_STAGING_ACCOUNTS.map((account) => account.key));
    for (const key of [
      "unauthenticated",
      "applicant-reviewing",
      "applicant-rejected",
      "accepted-incomplete",
      "member-multi-project",
      "project-manager",
      "subject-coordinator",
      "global-operator",
      "suspended-member",
      "withdrawn-member",
    ])
      expect(keys.has(key)).toBe(true);
    for (const account of ADMIN_STAGING_ACCOUNTS) {
      if (account.email)
        expect(account.email.endsWith("@atlasez.test")).toBe(true);
    }
  });
});
