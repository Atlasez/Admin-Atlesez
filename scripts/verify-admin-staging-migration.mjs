import { runAdminStagingMigrationDrill } from "./lib/admin-staging-migration-drill.mjs";

try {
  const result = runAdminStagingMigrationDrill();
  console.log(
    JSON.stringify({
      event: "admin_staging_migration_drill_passed",
      ...result,
    }),
  );
} catch {
  console.error(
    "Isolated migration 0134 backup/restore drill failed. No remote D1 was contacted; fixture rows and values were not logged.",
  );
  process.exit(1);
}
