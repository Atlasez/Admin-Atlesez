import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  parseAdminStagingConfig,
  validateAdminStagingConfig,
} from "./lib/admin-staging-config.mjs";
import {
  buildAdminStagingWranglerArgs,
  matchesAdminStagingDeploySha,
  missingAdminStagingDeployConfirmations,
  parseAdminStagingDeployArgs,
} from "./lib/admin-staging-deploy-policy.mjs";

const deployment = parseAdminStagingDeployArgs(process.argv.slice(2));
if (!deployment) {
  console.error(
    "Usage: npm run deploy:admin:staging -- --dry-run | --deploy [--no-cron]",
  );
  process.exit(2);
}
const { mode, noCron, configPath: configRelativePath } = deployment;

const configPath = resolve(process.cwd(), configRelativePath);
let config;
try {
  config = parseAdminStagingConfig(await readFile(configPath, "utf8"));
} catch {
  console.error(
    "Staging config could not be read. No deployment command was started.",
  );
  process.exit(2);
}

const allowResendTestSink =
  process.env.ATLASEZ_STAGING_RESEND_SINK_CONFIRMED === "1";
const discordTestGuildConfirmations = [
  "ATLASEZ_STAGING_DISCORD_POLICY_CONFIRMED",
  "ATLASEZ_STAGING_DISCORD_TEST_GUILD_VERIFIED",
  "ATLASEZ_STAGING_DISCORD_SECRETS_VERIFIED",
];
const discordTestGuildRequested =
  config.vars?.ATLASEZ_STAGING_DISCORD_MODE === "test-guild";
const missingDiscordTestGuildConfirmations = discordTestGuildRequested
  ? discordTestGuildConfirmations.filter((name) => process.env[name] !== "1")
  : [];
if (missingDiscordTestGuildConfirmations.length) {
  console.error(
    `Discord staging mode stopped. Complete STG-08 read-back first: ${missingDiscordTestGuildConfirmations.join(", ")}`,
  );
  process.exit(2);
}
const allowDiscordTestGuild = discordTestGuildRequested;
const failures = validateAdminStagingConfig(config, {
  allowResendTestSink,
  allowDiscordTestGuild,
  compatibilityNoCron: noCron,
});
if (failures.length) {
  console.error("ADMIN staging isolation preflight failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (mode === "--deploy") {
  const missing = missingAdminStagingDeployConfirmations(process.env, {
    noCron,
  });
  if (config.vars?.ATLASEZ_STAGING_DISCORD_MODE === "test-guild")
    missing.push(
      ...[
        "ATLASEZ_STAGING_DISCORD_POLICY_CONFIRMED",
        "ATLASEZ_STAGING_DISCORD_TEST_GUILD_VERIFIED",
        "ATLASEZ_STAGING_DISCORD_SECRETS_VERIFIED",
      ].filter((name) => process.env[name] !== "1"),
    );
  if (missing.length) {
    console.error(
      `Staging deploy stopped. Complete the operator read-back first: ${missing.join(", ")}`,
    );
    process.exit(2);
  }
  const actualSha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  if (
    !matchesAdminStagingDeploySha(
      process.env.ATLASEZ_STAGING_DEPLOY_SHA,
      actualSha,
    )
  ) {
    console.error(
      "Staging deploy stopped because ATLASEZ_STAGING_DEPLOY_SHA does not match the exact checked-out commit.",
    );
    process.exit(2);
  }
  const status = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { encoding: "utf8" },
  ).trim();
  if (status) {
    console.error(
      "Staging deploy stopped because the source worktree is not clean.",
    );
    process.exit(2);
  }
}

const buildEnvironment = {
  ...process.env,
  ATLASEZ_BUILD_TARGET: "admin",
  SITE_URL: config.vars.ADMIN_PUBLIC_ORIGIN,
  BASE_PATH: "/",
};

function run(command, args, env) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

try {
  run("npm", ["run", "build"], buildEnvironment);
  run("npm", ["run", "verify:build-info"], buildEnvironment);
  const wranglerArgs = buildAdminStagingWranglerArgs(configRelativePath, {
    dryRun: mode === "--dry-run",
  });
  run("npm", wranglerArgs, buildEnvironment);
} catch {
  console.error(
    "ADMIN staging build/deploy failed. No automatic retry or production fallback was attempted.",
  );
  process.exit(1);
}

console.log(
  mode === "--dry-run"
    ? `Staging ${noCron ? "no-Cron " : ""}dry-run completed. No Worker deployment or D1 migration was performed.`
    : `Dedicated ADMIN staging Worker deployment completed${noCron ? " without Cron triggers; scheduled features remain untested" : ""}. No D1 migration was performed.`,
);
