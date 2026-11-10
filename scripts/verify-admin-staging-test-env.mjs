const forbidden = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_API_KEY",
  "CF_API_TOKEN",
  "RESEND_API_KEY",
  "DISCORD_BOT_TOKEN",
  "DISCORD_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "E2E_LIVE_SMOKE",
  "E2E_AUTH_STORAGE_STATE",
  "E2E_BASE_URL",
];
const present = forbidden.filter((name) => Boolean(process.env[name]?.trim()));
if (present.length) {
  console.error(
    `Isolated staging tests refuse live credentials/targets: ${present.join(", ")}`,
  );
  process.exit(1);
}
console.log(
  "Isolated staging test environment is credential-free and has no live E2E target.",
);
