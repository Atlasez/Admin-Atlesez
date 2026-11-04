import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ADMIN_STAGING_COMPAT_CONFIG_PATH,
  ADMIN_STAGING_LOCAL_CONFIG_PATH,
  ADMIN_STAGING_TEMPLATE_PATH,
  parseAdminStagingConfig,
  validateAdminStagingConfig,
} from "./lib/admin-staging-config.mjs";

const args = process.argv.slice(2);
const example = args.includes("--example");
const allowResendTestSink = args.includes("--allow-resend-test-sink");
const allowDiscordTestGuild = args.includes("--allow-discord-test-guild");
const compatibilityNoCron = args.includes("--compatibility-no-cron");
const configFlag = args.indexOf("--config");
const requestedPath = configFlag >= 0 ? args[configFlag + 1] : null;
const allowedFlags = new Set([
  "--example",
  "--allow-resend-test-sink",
  "--allow-discord-test-guild",
  "--compatibility-no-cron",
  "--config",
]);
const expectedConfigPath = compatibilityNoCron
  ? ADMIN_STAGING_COMPAT_CONFIG_PATH
  : ADMIN_STAGING_LOCAL_CONFIG_PATH;
const unknown = args.filter(
  (arg, index) =>
    !allowedFlags.has(arg) && !(index > 0 && args[index - 1] === "--config"),
);

if (
  unknown.length ||
  (example && requestedPath) ||
  (example && compatibilityNoCron) ||
  (!example && requestedPath !== expectedConfigPath)
) {
  console.error(
    `Usage: node scripts/verify-admin-staging-config.mjs --example | --config ${ADMIN_STAGING_LOCAL_CONFIG_PATH} | --config ${ADMIN_STAGING_COMPAT_CONFIG_PATH} --compatibility-no-cron`,
  );
  process.exit(2);
}
if (
  allowDiscordTestGuild &&
  [
    "ATLASEZ_STAGING_DISCORD_POLICY_CONFIRMED",
    "ATLASEZ_STAGING_DISCORD_TEST_GUILD_VERIFIED",
    "ATLASEZ_STAGING_DISCORD_SECRETS_VERIFIED",
  ].some((name) => process.env[name] !== "1")
) {
  console.error(
    "Discord test-guild mode requires approved STG-08 role policy, test-guild read-back, and secret-name read-back confirmations.",
  );
  process.exit(2);
}
if (
  allowResendTestSink &&
  process.env.ATLASEZ_STAGING_RESEND_SINK_CONFIRMED !== "1"
) {
  console.error(
    "Resend sink mode requires ATLASEZ_STAGING_RESEND_SINK_CONFIRMED=1 from the staging operator.",
  );
  process.exit(2);
}

const path = resolve(
  process.cwd(),
  example ? ADMIN_STAGING_TEMPLATE_PATH : requestedPath,
);
let config;
try {
  config = parseAdminStagingConfig(await readFile(path, "utf8"));
} catch {
  console.error(
    "Staging config could not be parsed as strict JSON/JSONC. No values were printed.",
  );
  process.exit(2);
}

const failures = validateAdminStagingConfig(config, {
  allowExample: example,
  allowResendTestSink,
  allowDiscordTestGuild,
  compatibilityNoCron,
});
if (failures.length) {
  console.error("ADMIN staging isolation preflight failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  example
    ? "Staging template safety checks passed. The placeholders are intentionally non-deployable."
    : compatibilityNoCron
      ? "Staging old-Worker compatibility config passed with no scheduled triggers. Provider credentials and Cloudflare resource ownership still require operator read-back."
      : allowDiscordTestGuild
        ? "Staging config identity checks passed with the explicit Discord test-guild opt-in. Provider credentials and Cloudflare resource ownership still require operator read-back."
        : "Staging config identity checks passed. Discord remains disabled unless STG-08 is explicitly approved; provider credentials and Cloudflare resource ownership still require operator read-back.",
);
