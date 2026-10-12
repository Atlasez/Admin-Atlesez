import type { D1Database } from "./admin-database";

const dayMs = 24 * 60 * 60 * 1_000;

/** Applies the retention periods documented for ADMIN-managed personal data. */
export async function purgeExpiredPersonalData(
  db: D1Database,
  now = new Date(),
) {
  const expiredSessions = new Date(now.getTime() - dayMs).toISOString();
  const expiredApplications = new Date(
    now.getTime() - 180 * dayMs,
  ).toISOString();
  const expiredReporterHashes = new Date(
    now.getTime() - 30 * dayMs,
  ).toISOString();
  const expiredReportDedupHashes = new Date(
    now.getTime() - 7 * dayMs,
  ).toISOString();
  const expiredRateLimits = Math.floor((now.getTime() - dayMs) / 600_000);

  const results = await Promise.all([
    db
      .prepare("DELETE FROM admin_auth_sessions WHERE expires_at < ?")
      .bind(expiredSessions)
      .run(),
    db
      .prepare("DELETE FROM atlasez_application_rate_limits WHERE bucket < ?")
      .bind(expiredRateLimits)
      .run(),
    db
      .prepare(
        "DELETE FROM atlasez_member_applications WHERE status IN ('rejected','accepted') AND updated_at < ?",
      )
      .bind(expiredApplications)
      .run(),
    db
      .prepare(
        "UPDATE article_reports SET reporter_hash='' WHERE reporter_hash<>'' AND created_at < ?",
      )
      .bind(expiredReporterHashes)
      .run(),
    db
      .prepare(
        "UPDATE article_reports SET content_hash='' WHERE content_hash<>'' AND created_at < ?",
      )
      .bind(expiredReportDedupHashes)
      .run(),
    db
      .prepare(
        "UPDATE article_reports SET contact=NULL WHERE status='resolved' AND contact IS NOT NULL AND updated_at < ?",
      )
      .bind(expiredApplications)
      .run(),
  ]);

  return {
    sessionsDeleted: Number(results[0]?.meta?.changes ?? 0),
    rateLimitsDeleted: Number(results[1]?.meta?.changes ?? 0),
    resolvedApplicationsDeleted: Number(results[2]?.meta?.changes ?? 0),
    reporterHashesCleared: Number(results[3]?.meta?.changes ?? 0),
    reportContentHashesCleared: Number(results[4]?.meta?.changes ?? 0),
    resolvedReportContactsCleared: Number(results[5]?.meta?.changes ?? 0),
  };
}
