type GitHubAppEnvironment = {
  GITHUB_APP_ID?: string;
  GITHUB_APP_INSTALLATION_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_PUBLISH_TOKEN?: string;
};

const base64Url = (bytes: Uint8Array | string) => {
  const binary =
    typeof bytes === "string" ? bytes : String.fromCharCode(...bytes);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const pemBytes = (pem: string) => {
  const pkcs1 = /-----BEGIN RSA PRIVATE KEY-----/.test(pem);
  const encoded = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/-----END RSA PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (!pkcs1) return bytes;
  const length = (value: number) => {
    if (value < 128) return Uint8Array.of(value);
    const output: number[] = [];
    for (
      let remaining = value;
      remaining > 0;
      remaining = Math.floor(remaining / 256)
    )
      output.unshift(remaining & 0xff);
    return Uint8Array.of(0x80 | output.length, ...output);
  };
  const tagged = (tag: number, value: Uint8Array) =>
    Uint8Array.of(tag, ...length(value.length), ...value);
  const algorithm = Uint8Array.from([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
    0x01, 0x05, 0x00,
  ]);
  return tagged(
    0x30,
    Uint8Array.of(
      ...tagged(0x02, Uint8Array.of(0x00)),
      ...algorithm,
      ...tagged(0x04, bytes),
    ),
  );
};

const githubAppJwt = async (appId: string, privateKey: string) => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: appId,
    }),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
};

/**
 * Prefer a repository-scoped GitHub App installation token. The legacy PAT is
 * retained only as a migration fallback and must not be used for auto-merge.
 */
export const githubToken = async (
  env: GitHubAppEnvironment,
): Promise<{ token: string; app: boolean } | null> => {
  const appConfigured = Boolean(
    env.GITHUB_APP_ID &&
    env.GITHUB_APP_INSTALLATION_ID &&
    env.GITHUB_APP_PRIVATE_KEY,
  );
  if (appConfigured) {
    const jwt = await githubAppJwt(
      env.GITHUB_APP_ID!,
      env.GITHUB_APP_PRIVATE_KEY!,
    );
    const response = await fetch(
      `https://api.github.com/app/installations/${encodeURIComponent(env.GITHUB_APP_INSTALLATION_ID!)}/access_tokens`,
      {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${jwt}`,
          "user-agent": "atlasez-editorial-publication",
          "x-github-api-version": "2022-11-28",
          "content-type": "application/json",
        },
      },
    );
    if (!response.ok)
      throw new Error("GitHub AppのInstallation tokenを取得できませんでした。");
    const data = (await response.json()) as { token?: string };
    if (!data.token)
      throw new Error("GitHub AppのInstallation tokenが空です。");
    return { token: data.token, app: true };
  }
  return env.GITHUB_PUBLISH_TOKEN
    ? { token: env.GITHUB_PUBLISH_TOKEN, app: false }
    : null;
};
