import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ADMIN_STAGING_TEMPLATE_PATH,
  parseAdminStagingConfig,
  validateAdminStagingConfig,
} from "../../scripts/lib/admin-staging-config.mjs";
import {
  isApprovedStagingAddress,
  isApprovedStagingRecipient,
} from "../../src/lib/admin-staging-email-policy.mjs";
import {
  isStagingDiscordDisabled,
  isStagingDiscordEnabled,
} from "../../src/lib/admin-staging-discord-policy";
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

  it("accepts a staging Worker and isolated D1 while Discord is disabled and unconfigured", () => {
    const config = safeStagingConfig();
    expect(config.vars.ATLASEZ_STAGING_DISCORD_MODE).toBe("disabled");
    expect(config.vars.ATLASEZ_STAGING_DISCORD_POLICY_APPROVED).toBe("false");
    expect(config.vars).not.toHaveProperty("DISCORD_GUILD_ID");
    expect(config.vars).not.toHaveProperty("DISCORD_OAUTH_CLIENT_ID");
    expect(config.vars).not.toHaveProperty("DISCORD_GUILD_NAME");
    expect(validateAdminStagingConfig(config)).toEqual([]);
  });

  it("requires explicit STG-08 approval and verified test-only Discord identities", () => {
    const config = safeStagingConfig();
    config.vars.ATLASEZ_STAGING_DISCORD_MODE = "test-guild";
    config.vars.ATLASEZ_STAGING_DISCORD_POLICY_APPROVED = "true";
    config.vars.DISCORD_GUILD_ID = "123456789012345678";
    config.vars.DISCORD_OAUTH_CLIENT_ID = "123456789012345679";
    config.vars.DISCORD_GUILD_NAME = "Atlasez Staging Test Guild";
    expect(validateAdminStagingConfig(config)).toContain(
      "test-guild mode requires the explicit STG-08 validation opt-in",
    );
    expect(
      validateAdminStagingConfig(config, { allowDiscordTestGuild: true }),
    ).toEqual([]);

    const productionGuild = safeStagingConfig();
    Object.assign(productionGuild.vars, {
      ATLASEZ_STAGING_DISCORD_MODE: "test-guild",
      ATLASEZ_STAGING_DISCORD_POLICY_APPROVED: "true",
      DISCORD_GUILD_ID: "1359062450028282017",
      DISCORD_OAUTH_CLIENT_ID: "123456789012345679",
      DISCORD_GUILD_NAME: "Atlasez Staging Test Guild",
    });
    expect(
      validateAdminStagingConfig(productionGuild, {
        allowDiscordTestGuild: true,
      }).some((failure) => failure.includes("DISCORD_GUILD_ID")),
    ).toBe(true);
  });

  it("rejects Discord identities when the staging profile is disabled", () => {
    const config = safeStagingConfig();
    config.vars.DISCORD_GUILD_ID = "123456789012345678";
    expect(validateAdminStagingConfig(config)).toContain(
      "DISCORD_GUILD_ID must be absent while staging Discord is disabled",
    );
  });

  it("requires explicit policy, test-guild, and secret read-back before the STG-08 preflight opt-in", () => {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/verify-admin-staging-config.mjs",
        "--example",
        "--allow-discord-test-guild",
      ],
      {
        encoding: "utf8",
        env: { PATH: process.env.PATH ?? "" },
      },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "requires approved STG-08 role policy, test-guild read-back, and secret-name read-back confirmations",
    );
  });

  it("enables Discord at runtime only for a complete and explicitly approved staging test guild", () => {
    const enabledProfile = {
      ADMIN_PUBLIC_ORIGIN:
        "https://atlasez-admin-staging.synthetic-account.workers.dev",
      ATLASEZ_STAGING_MODE: "true",
      ATLASEZ_STAGING_DISCORD_MODE: "test-guild",
      ATLASEZ_STAGING_DISCORD_POLICY_APPROVED: "true",
      DISCORD_GUILD_ID: "123456789012345678",
      DISCORD_GUILD_NAME: "Atlasez Staging Test Guild",
      DISCORD_BOT_TOKEN: "synthetic-bot-token",
      DISCORD_OAUTH_CLIENT_ID: "123456789012345679",
      DISCORD_OAUTH_CLIENT_SECRET: "synthetic-client-secret",
      DISCORD_OAUTH_REDIRECT_URI:
        "https://atlasez-admin-staging.synthetic-account.workers.dev/auth/discord/callback",
      DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY: "ab".repeat(32),
    };
    expect(isStagingDiscordEnabled(enabledProfile)).toBe(true);
    expect(isStagingDiscordDisabled(enabledProfile)).toBe(false);
    expect(
      isStagingDiscordDisabled({
        ...enabledProfile,
        DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY: "invalid-key",
      }),
    ).toBe(true);
    expect(
      isStagingDiscordDisabled({
        ...enabledProfile,
        ATLASEZ_STAGING_DISCORD_POLICY_APPROVED: "false",
      }),
    ).toBe(true);
    expect(
      isStagingDiscordDisabled({
        ...enabledProfile,
        DISCORD_GUILD_ID: "1359062450028282017",
      }),
    ).toBe(true);
    expect(isStagingDiscordDisabled({})).toBe(false);
  });

  it("allows exact synthetic test domains and Resend simulator addresses only", () => {
    expect(isApprovedStagingAddress("operator@staging.example.test")).toBe(
      true,
    );
    expect(isApprovedStagingRecipient("delivered@resend.dev")).toBe(true);
    expect(isApprovedStagingRecipient("person@staging-unowned.example")).toBe(
      false,
    );
    expect(isApprovedStagingRecipient("person@my-staging.example.com")).toBe(
      false,
    );
    expect(
      isApprovedStagingAddress("person@atlasez.test.attacker.example"),
    ).toBe(false);

    const sender = safeStagingConfig();
    sender.vars.EMAIL_FROM =
      "Atlasez Staging <noreply@staging-unowned.example>";
    expect(validateAdminStagingConfig(sender)).toContain(
      "EMAIL_FROM must use an explicitly approved synthetic test domain",
    );

    const operator = safeStagingConfig();
    operator.vars.APPLICATION_OPERATIONS_EMAILS =
      "person@staging-unowned.example";
    expect(validateAdminStagingConfig(operator)).toContain(
      "operator notification recipients must use explicitly approved synthetic test addresses",
    );
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
