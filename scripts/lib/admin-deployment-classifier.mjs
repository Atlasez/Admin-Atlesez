export const ADMIN_DEPLOYMENT_AUDIT_RECORD =
  "docs/deployments/cloudflare-latest.json";

const SHA_PATTERN = /^[0-9a-f]{40}$/;

export function parseGitDiffNameOnly(output) {
  return output.split("\0").filter(Boolean);
}

export function classifyAdminDeployment({
  liveCommit,
  liveRef,
  targetCommit,
  changedFiles,
  liveIsAncestor,
}) {
  if (liveRef !== "main") {
    return { deployRequired: true, reason: "invalid-live-build-ref" };
  }

  if (
    !SHA_PATTERN.test(liveCommit ?? "") ||
    !SHA_PATTERN.test(targetCommit ?? "")
  ) {
    return { deployRequired: true, reason: "missing-or-invalid-sha" };
  }

  if (liveCommit === targetCommit) {
    return { deployRequired: false, reason: "already-deployed" };
  }

  if (
    !liveIsAncestor ||
    !Array.isArray(changedFiles) ||
    changedFiles.length === 0
  ) {
    return { deployRequired: true, reason: "unrelated-or-unknown-history" };
  }

  if (changedFiles.every((path) => path === ADMIN_DEPLOYMENT_AUDIT_RECORD)) {
    return { deployRequired: false, reason: "audit-record-only" };
  }

  return { deployRequired: true, reason: "site-change" };
}
