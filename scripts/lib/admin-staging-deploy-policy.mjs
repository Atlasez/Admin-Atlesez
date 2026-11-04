import {
  ADMIN_STAGING_COMPAT_CONFIG_PATH,
  ADMIN_STAGING_LOCAL_CONFIG_PATH,
} from "./admin-staging-config.mjs";

const DEPLOY_MODES = new Set(["--dry-run", "--deploy"]);

export function parseAdminStagingDeployArgs(args) {
  const modeArgs = args.filter((arg) => DEPLOY_MODES.has(arg));
  const noCron = args.includes("--no-cron");
  const unknownArgs = args.filter(
    (arg) => !DEPLOY_MODES.has(arg) && arg !== "--no-cron",
  );
  if (modeArgs.length !== 1 || unknownArgs.length || args.length > 2)
    return null;
  return {
    mode: modeArgs[0],
    noCron,
    configPath: noCron
      ? ADMIN_STAGING_COMPAT_CONFIG_PATH
      : ADMIN_STAGING_LOCAL_CONFIG_PATH,
  };
}

export function missingAdminStagingDeployConfirmations(
  env,
  { noCron = false } = {},
) {
  const required = [
    "ATLASEZ_STAGING_DEPLOY_CONFIRMED",
    "ATLASEZ_STAGING_PROVIDER_SETTINGS_VERIFIED",
    "ATLASEZ_STAGING_0134_VERIFIED",
  ];
  if (noCron) required.push("ATLASEZ_STAGING_NO_CRON_CONFIRMED");
  return required.filter((name) => env[name] !== "1");
}

export function matchesAdminStagingDeploySha(expectedSha, actualSha) {
  return (
    typeof expectedSha === "string" &&
    /^[0-9a-f]{40}$/i.test(expectedSha.trim()) &&
    typeof actualSha === "string" &&
    expectedSha.trim().toLowerCase() === actualSha.trim().toLowerCase()
  );
}

export function buildAdminStagingWranglerArgs(
  configPath,
  { dryRun = false } = {},
) {
  const args = [
    "exec",
    "--",
    "wrangler",
    "deploy",
    "--config",
    configPath,
    "--keep-vars",
  ];
  if (dryRun) args.push("--dry-run");
  return args;
}
