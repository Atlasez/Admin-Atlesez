const expectedCommit = process.env.EXPECTED_COMMIT?.trim();
const buildInfoUrl =
  process.env.BUILD_INFO_URL || "https://admin.atlasez.org/build-info.json";

if (!expectedCommit || !/^[0-9a-f]{40}$/.test(expectedCommit)) {
  throw new Error("EXPECTED_COMMIT must be the 40-character main commit SHA");
}

const auditUrl = new URL(buildInfoUrl);
auditUrl.searchParams.set("deployment_audit", `${Date.now()}`);

const response = await fetch(auditUrl, {
  headers: {
    "cache-control": "no-cache",
    pragma: "no-cache",
  },
});

if (!response.ok) {
  throw new Error(`live build-info request failed: HTTP ${response.status}`);
}

let buildInfo;
try {
  buildInfo = await response.json();
} catch (error) {
  throw new Error(`live build-info is not valid JSON: ${error.message}`);
}

const expected = {
  repository: "Atlasez/Admin-Atlesez",
  target: "admin",
  commit: expectedCommit,
};

const mismatches = Object.entries(expected)
  .filter(([key, value]) => buildInfo[key] !== value)
  .map(
    ([key, value]) =>
      `${key}: expected ${value}, got ${buildInfo[key] ?? "<missing>"}`,
  );

if (mismatches.length > 0) {
  throw new Error(
    `live ADMIN build is stale or misidentified (${mismatches.join("; ")})`,
  );
}

console.log(
  JSON.stringify(
    {
      verified: true,
      url: buildInfoUrl,
      repository: buildInfo.repository,
      target: buildInfo.target,
      commit: buildInfo.commit,
      builtAt: buildInfo.builtAt ?? null,
    },
    null,
    2,
  ),
);
