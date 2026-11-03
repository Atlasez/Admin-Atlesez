import type { D1Database } from "./admin-database";

const dayMs = 24 * 60 * 60 * 1_000;

/** Applies the retention periods documented for ADMIN-managed personal data. */
export async function purgeExpiredPersonalData(
  db: D1Database,
  now = new Date(),
  options: {
    clearArticleReportData?: boolean;
    deleteTerminalApplications?: boolean;
  } = {},
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

  // Keep the independent application-retention switch default-off. Even after
  // an operator explicitly enables it, do not delete an application while any
  // associated delivery is unsent (including failed or future/unknown states).
  // An eligible delete still cascades sent deliveries and interview/review/
  // history rows; the general admin_audit_log has no application FK and remains.
  // The SQL predicate and delete run together so a concurrent queue transition
  // to sending/retry is checked at the point the parent row is deleted.
  const undeliveredApplicationCount = options.deleteTerminalApplications
    ? await db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM atlasez_member_applications AS application
           WHERE application.status IN ('rejected','accepted')
             AND application.updated_at < ?
             AND EXISTS (
               SELECT 1 FROM atlasez_application_email_deliveries AS delivery
               WHERE delivery.application_id=application.id
                 AND delivery.status<>'sent'
             )`,
        )
        .bind(expiredApplications)
        .first<{ count: number }>()
    : null;

  const expiredApplicationsResult = options.deleteTerminalApplications
    ? await db
        .prepare(
          `DELETE FROM atlasez_member_applications
           WHERE status IN ('rejected','accepted')
             AND updated_at < ?
             AND NOT EXISTS (
               SELECT 1 FROM atlasez_application_email_deliveries AS delivery
               WHERE delivery.application_id=atlasez_member_applications.id
                 AND delivery.status<>'sent'
             )`,
        )
        .bind(expiredApplications)
        .run()
    : { meta: { changes: 0 } };

  const statements = [
    db
      .prepare("DELETE FROM admin_auth_sessions WHERE expires_at < ?")
      .bind(expiredSessions)
      .run(),
    db
      .prepare("DELETE FROM atlasez_application_rate_limits WHERE bucket < ?")
      .bind(expiredRateLimits)
      .run(),
  ];
  if (options.clearArticleReportData) {
    statements.push(
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
    );
  }
  const results = await Promise.all(statements);

  return {
    sessionsDeleted: Number(results[0]?.meta?.changes ?? 0),
    rateLimitsDeleted: Number(results[1]?.meta?.changes ?? 0),
    resolvedApplicationsDeleted: Number(
      expiredApplicationsResult.meta?.changes ?? 0,
    ),
    terminalApplicationsWithUndeliveredEmail: Number(
      undeliveredApplicationCount?.count ?? 0,
    ),
    reporterHashesCleared: Number(results[2]?.meta?.changes ?? 0),
    reportContentHashesCleared: Number(results[3]?.meta?.changes ?? 0),
    resolvedReportContactsCleared: Number(results[4]?.meta?.changes ?? 0),
  };
}
