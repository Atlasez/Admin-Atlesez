import { expect, it } from "vitest";
import { runAdminStagingMigrationDrill } from "../../scripts/lib/admin-staging-migration-drill.mjs";

it("runs migration 0134, verifies backfill and old-column compatibility, then restores the synthetic pre-migration snapshot", () => {
  expect(runAdminStagingMigrationDrill()).toMatchObject({
    migration: "0134_application_intake_reconciliation.sql",
    preservedApplicationRows: 1,
    preservedEmailQueueRows: 2,
    legacyInsertCompatible: true,
    isolatedBackupRestore: true,
  });
});
