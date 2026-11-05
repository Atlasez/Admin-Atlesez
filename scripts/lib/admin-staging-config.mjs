import {
  isApprovedStagingAddress,
  isApprovedStagingRecipient,
} from "../../src/lib/admin-staging-email-policy.mjs";

export const ADMIN_STAGING_TEMPLATE_PATH =
  "wrangler.admin.staging.example.jsonc";
export const ADMIN_STAGING_LOCAL_CONFIG_PATH = "wrangler.admin.staging.jsonc";
export const ADMIN_STAGING_COMPAT_CONFIG_PATH =
  "wrangler.admin.staging.compat.jsonc";

const PRODUCTION_IDENTIFIERS = [
  "admin.atlasez.org",
  "atlasez-reports",
  "d5112a62-7ed6-49c8-b6a2-18ee2dbab678",
  "1359062450028282017",
  "1537142952210464868",
];
const STAGING_WORKER = "atlasez-admin-staging";
const STAGING_D1 = "atlasez-admin-staging-reports";
const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "$schema",
  "account_id",
  "name",
  "main",
  "compatibility_date",
  "preview_urls",
  "workers_dev",
  "vars",
  "assets",
  "d1_databases",
  "triggers",
]);
const ALLOWED_VAR_KEYS = new Set([
  "ADMIN_AUTH_MODE",
  "ADMIN_PUBLIC_ORIGIN",
  "PUBLIC_ANALYTICS_ORIGIN",
  "PUBLIC_SITE_ORIGIN",
  "ATLASEZ_STAGING_MODE",
  "ATLASEZ_STAGING_CRON_MODE",
  "ATLASEZ_STAGING_EMAIL_DELIVERY",
  "ATLASEZ_STAGING_DISCORD_MODE",
  "ATLASEZ_STAGING_DISCORD_POLICY_APPROVED",
  "EMAIL_FROM",
  "APPLICATION_OPERATIONS_EMAILS",
  "GOOGLE_OAUTH_CLIENT_ID",
  "DISCORD_GUILD_ID",
  "DISCORD_GUILD_NAME",
  "DISCORD_OAUTH_CLIENT_ID",
]);
const DANGEROUS_VAR_NAME =
  /(SECRET|TOKEN|API_KEY|WEBHOOK_URL|PRIVATE_KEY|PASSWORD)/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCOUNT_PATTERN = /^[0-9a-f]{32}$/i;

export function parseAdminStagingConfig(source) {
  let withoutComments = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (inString) {
      withoutComments += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      withoutComments += char;
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      withoutComments += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === "*" && source[index + 1] === "/")
      ) {
        if (source[index] === "\n") withoutComments += "\n";
        index += 1;
      }
      if (index >= source.length)
        throw new SyntaxError("Unterminated JSONC comment");
      index += 1;
      continue;
    }
    withoutComments += char;
  }

  let json = "";
  inString = false;
  escaped = false;
  for (let index = 0; index < withoutComments.length; index += 1) {
    const char = withoutComments[index];
    if (inString) {
      json += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      json += char;
      continue;
    }
    if (char === ",") {
      let lookahead = index + 1;
      while (/\s/.test(withoutComments[lookahead] ?? "")) lookahead += 1;
      if (
        withoutComments[lookahead] === "}" ||
        withoutComments[lookahead] === "]"
      )
        continue;
    }
    json += char;
  }
  return JSON.parse(json);
}

const add = (failures, condition, reason) => {
  if (!condition) failures.push(reason);
};

function normalizedOrigin(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

export function validateAdminStagingConfig(
  config,
  {
    allowExample = false,
    allowResendTestSink = false,
    allowDiscordTestGuild = false,
    compatibilityNoCron = false,
  } = {},
) {
  const failures = [];
  add(
    failures,
    config && typeof config === "object" && !Array.isArray(config),
    "config must be a JSON object",
  );
  if (!config || typeof config !== "object" || Array.isArray(config))
    return failures;

  for (const key of Object.keys(config))
    add(
      failures,
      ALLOWED_TOP_LEVEL_KEYS.has(key),
      `unsupported top-level setting is forbidden (${key})`,
    );

  add(
    failures,
    config.main === "src/admin-worker.ts",
    "main must be the reviewed ADMIN Worker entrypoint",
  );

  add(
    failures,
    config.name === STAGING_WORKER,
    "name must be the dedicated staging Worker name",
  );
  add(failures, config.preview_urls === false, "preview_urls must be disabled");
  add(
    failures,
    config.workers_dev === true,
    "workers_dev must be enabled for the staging-only endpoint",
  );
  add(
    failures,
    (Array.isArray(config.routes) && config.routes.length === 0) ||
      config.routes === undefined,
    "custom Routes are not allowed in this staging config",
  );

  if (allowExample) {
    add(
      failures,
      config.account_id === "REPLACE_WITH_STAGING_ACCOUNT_ID",
      "example account_id placeholder changed unexpectedly",
    );
  } else {
    add(
      failures,
      typeof config.account_id === "string" &&
        ACCOUNT_PATTERN.test(config.account_id),
      "account_id must be an explicit Cloudflare account ID",
    );
  }

  const vars =
    config.vars &&
    typeof config.vars === "object" &&
    !Array.isArray(config.vars)
      ? config.vars
      : {};
  for (const key of Object.keys(vars))
    add(
      failures,
      ALLOWED_VAR_KEYS.has(key),
      `unsupported staging var is forbidden (${key})`,
    );
  add(
    failures,
    !Object.hasOwn(vars, "ATLASEZ_STAGING_EMAIL_ALLOWLIST"),
    "synthetic email allowlist must be stored as a staging Secret, not a versioned var",
  );
  for (const key of Object.keys(vars)) {
    add(
      failures,
      !DANGEROUS_VAR_NAME.test(key),
      `secrets must not be stored in vars (${key})`,
    );
    const value = vars[key];
    if (typeof value === "string") {
      for (const identifier of PRODUCTION_IDENTIFIERS) {
        if (key !== "name")
          add(
            failures,
            !value.includes(identifier),
            `production identifier is forbidden in vars (${key})`,
          );
      }
    }
  }

  add(
    failures,
    vars.ADMIN_AUTH_MODE === "google-oauth",
    "ADMIN_AUTH_MODE must use the dedicated Google OAuth client",
  );
  add(
    failures,
    vars.ATLASEZ_STAGING_MODE === "true",
    "ATLASEZ_STAGING_MODE must be true",
  );
  add(
    failures,
    vars.ATLASEZ_STAGING_CRON_MODE === "intake-only",
    "staging Cron mode must be intake-only",
  );
  const emailMode = vars.ATLASEZ_STAGING_EMAIL_DELIVERY;
  add(
    failures,
    emailMode === "disabled" ||
      (emailMode === "test-sink" && allowResendTestSink),
    "staging email delivery must remain disabled unless the test-sink gate is explicitly enabled",
  );

  const discordMode = vars.ATLASEZ_STAGING_DISCORD_MODE;
  add(
    failures,
    discordMode === "disabled" || discordMode === "test-guild",
    "staging Discord mode must be explicitly disabled or an approved test guild",
  );
  if (discordMode === "disabled") {
    add(
      failures,
      vars.ATLASEZ_STAGING_DISCORD_POLICY_APPROVED === "false",
      "disabled staging Discord mode must keep its policy approval false",
    );
    for (const key of [
      "DISCORD_GUILD_ID",
      "DISCORD_GUILD_NAME",
      "DISCORD_OAUTH_CLIENT_ID",
    ])
      add(
        failures,
        !Object.hasOwn(vars, key),
        `${key} must be absent while staging Discord is disabled`,
      );
  } else if (discordMode === "test-guild") {
    add(
      failures,
      allowDiscordTestGuild,
      "test-guild mode requires the explicit STG-08 validation opt-in",
    );
    add(
      failures,
      vars.ATLASEZ_STAGING_DISCORD_POLICY_APPROVED === "true",
      "test-guild mode requires an explicitly approved Discord role policy",
    );
    for (const key of ["DISCORD_GUILD_ID", "DISCORD_OAUTH_CLIENT_ID"]) {
      const value = vars[key];
      add(
        failures,
        typeof value === "string" &&
          /^\d{17,20}$/.test(value) &&
          !PRODUCTION_IDENTIFIERS.includes(value),
        `${key} must be a verified test-only Discord identifier`,
      );
    }
    add(
      failures,
      typeof vars.DISCORD_GUILD_NAME === "string" &&
        /staging|test/i.test(vars.DISCORD_GUILD_NAME),
      "Discord test guild name must be explicitly marked as staging/test",
    );
  }

  const assets = config.assets;
  add(
    failures,
    assets &&
      assets.directory === "./dist" &&
      assets.binding === "ASSETS" &&
      assets.not_found_handling === "404-page" &&
      Array.isArray(assets.run_worker_first) &&
      assets.run_worker_first.length === 1 &&
      assets.run_worker_first[0] === "/*",
    "assets must use the reviewed local ADMIN build configuration",
  );

  const origins = [
    vars.ADMIN_PUBLIC_ORIGIN,
    vars.PUBLIC_ANALYTICS_ORIGIN,
    vars.PUBLIC_SITE_ORIGIN,
  ];
  const parsedOrigins = origins.map(normalizedOrigin);
  add(
    failures,
    parsedOrigins.every(Boolean),
    "all public origins must be valid HTTPS origins",
  );
  const origin = parsedOrigins[0];
  if (origin) {
    add(
      failures,
      parsedOrigins.every((item) => item?.origin === origin.origin),
      "all public origins must match the isolated staging Worker origin",
    );
    add(
      failures,
      origin.hostname.startsWith(`${STAGING_WORKER}.`) &&
        origin.hostname.endsWith(".workers.dev"),
      "origin must be the staging Worker workers.dev hostname",
    );
    add(
      failures,
      allowExample
        ? origin.hostname ===
            "atlasez-admin-staging.replace-account-subdomain.workers.dev"
        : !/replace|[<>]/i.test(origin.hostname),
      "staging origin placeholders must be replaced before use",
    );
  }

  const databases = Array.isArray(config.d1_databases)
    ? config.d1_databases
    : [];
  add(
    failures,
    databases.length === 1,
    "exactly one isolated D1 binding is allowed",
  );
  if (databases.length === 1) {
    const [database] = databases;
    add(
      failures,
      database.binding === "REPORTS",
      "the D1 binding must be named REPORTS",
    );
    add(
      failures,
      database.database_name === STAGING_D1,
      "database_name must be the dedicated staging D1 name",
    );
    if (allowExample) {
      add(
        failures,
        database.database_id === "00000000-0000-0000-0000-000000000000",
        "example D1 ID placeholder changed unexpectedly",
      );
    } else {
      add(
        failures,
        typeof database.database_id === "string" &&
          UUID_PATTERN.test(database.database_id),
        "database_id must be a real D1 UUID",
      );
      add(
        failures,
        database.database_id !== "d5112a62-7ed6-49c8-b6a2-18ee2dbab678",
        "production D1 ID is forbidden",
      );
    }
  }

  const triggers = config.triggers;
  const triggerKeys =
    triggers && typeof triggers === "object" && !Array.isArray(triggers)
      ? Object.keys(triggers)
      : [];
  const crons = triggers?.crons;
  if (compatibilityNoCron) {
    add(
      failures,
      triggers === undefined ||
        (triggerKeys.length === 1 &&
          triggerKeys[0] === "crons" &&
          Array.isArray(crons) &&
          crons.length === 0),
      "no-Cron staging config must contain no scheduled triggers",
    );
  } else {
    add(
      failures,
      triggerKeys.length === 1 &&
        triggerKeys[0] === "crons" &&
        Array.isArray(crons) &&
        crons.length === 1 &&
        crons[0] === "*/5 * * * *",
      "only the guarded five-minute intake reconciliation Cron is allowed",
    );
  }
  add(
    failures,
    !config.queues,
    "production or provider queues are not allowed in the staging config",
  );
  for (const binding of config.durable_objects?.bindings ?? []) {
    add(
      failures,
      binding.script_name !== "atlasez-editorial-collaboration",
      "the production editorial collaboration Worker must not be bound to staging",
    );
    add(
      failures,
      !binding.script_name || binding.script_name.includes("staging"),
      "any external Durable Object binding must be staging-specific",
    );
  }

  const googleClient = vars.GOOGLE_OAUTH_CLIENT_ID;
  if (allowExample) {
    add(
      failures,
      googleClient === "REPLACE_WITH_STAGING_GOOGLE_CLIENT_ID",
      "example Google OAuth client placeholder changed unexpectedly",
    );
  } else {
    add(
      failures,
      typeof googleClient === "string" &&
        googleClient.endsWith(".apps.googleusercontent.com") &&
        !googleClient.includes("REPLACE"),
      "a dedicated staging Google OAuth client ID is required",
    );
  }

  const sender =
    typeof vars.EMAIL_FROM === "string"
      ? (vars.EMAIL_FROM.match(/<([^>]+)>/)?.[1] ?? vars.EMAIL_FROM)
      : "";
  add(
    failures,
    isApprovedStagingAddress(sender),
    "EMAIL_FROM must use an explicitly approved synthetic test domain",
  );
  const operatorEmails =
    typeof vars.APPLICATION_OPERATIONS_EMAILS === "string"
      ? vars.APPLICATION_OPERATIONS_EMAILS.split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
  add(
    failures,
    operatorEmails.length > 0 &&
      operatorEmails.every(isApprovedStagingRecipient),
    "operator notification recipients must use explicitly approved synthetic test addresses",
  );

  return failures;
}

export function stagingProductionIdentifiers() {
  return [...PRODUCTION_IDENTIFIERS];
}
