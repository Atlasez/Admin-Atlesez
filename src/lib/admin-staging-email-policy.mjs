// These exact domains are reserved for documentation and testing. Do not
// replace this exact-match policy with a substring or suffix check.
const STAGING_TEST_DOMAINS = new Set([
  "atlasez.test",
  "staging.example.test",
  "staging.example.invalid",
]);

const RESEND_TEST_RECIPIENTS = new Set([
  "delivered@resend.dev",
  "bounced@resend.dev",
  "complained@resend.dev",
]);

function normalizedAddress(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0 || separator !== normalized.indexOf("@")) return null;

  const local = normalized.slice(0, separator);
  const domain = normalized.slice(separator + 1);
  if (
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..")
  )
    return null;

  const labels = domain.split(".");
  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        !label ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  )
    return null;

  return { normalized, domain };
}

/** Return true only for an address under one explicitly approved test FQDN. */
export function isApprovedStagingAddress(value) {
  const address = normalizedAddress(value);
  return Boolean(address && STAGING_TEST_DOMAINS.has(address.domain));
}

/**
 * Return true for an explicitly approved synthetic domain address or one of
 * Resend's documented test-recipient simulator addresses. Callers must still
 * require the complete address to match their exact staging allowlist.
 */
export function isApprovedStagingRecipient(value) {
  const address = normalizedAddress(value);
  return Boolean(
    address &&
    (STAGING_TEST_DOMAINS.has(address.domain) ||
      RESEND_TEST_RECIPIENTS.has(address.normalized)),
  );
}
