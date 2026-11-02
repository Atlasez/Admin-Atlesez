import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const TARGET_MIGRATION = "0134_application_intake_reconciliation.sql";
const SYNTHETIC_APPLICATION_ID = "staging-migration-fixture-0134";
const NOW = "2026-11-03T00:00:00.000Z";

function columnNames(db) {
  return new Set(
    db
      .prepare("PRAGMA table_info(atlasez_member_applications)")
      .all()
      .map((column) => column.name),
  );
}

function count(db, sql, ...values) {
  return Number(db.prepare(sql).get(...values)?.count ?? 0);
}

export function runAdminStagingMigrationDrill({
  migrationDirectory = resolve("migrations"),
} = {}) {
  const files = readdirSync(migrationDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const targetIndex = files.indexOf(TARGET_MIGRATION);
  assert.notEqual(
    targetIndex,
    -1,
    "migration 0134 must be present on the tested branch",
  );
  const directory = mkdtempSync(
    join(tmpdir(), "atlasez-admin-staging-migration-"),
  );
  const databasePath = join(directory, "staging.sqlite");
  const backupPath = join(directory, "before-0134.sqlite");
  let db;

  try {
    db = new DatabaseSync(databasePath);
    db.exec("PRAGMA foreign_keys=ON");
    for (const file of files.slice(0, targetIndex))
      db.exec(readFileSync(join(migrationDirectory, file), "utf8"));
    db.exec(`
      CREATE TABLE d1_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const recordMigration = db.prepare(
      "INSERT INTO d1_migrations(name) VALUES(?)",
    );
    for (const file of files.slice(0, targetIndex)) recordMigration.run(file);

    const oldColumns = columnNames(db);
    assert.equal(
      oldColumns.has("operator_notification_recipients_json"),
      false,
    );
    assert.equal(oldColumns.has("intake_reconciliation_required"), false);

    db.prepare(
      `
      INSERT INTO atlasez_member_applications
        (id,name,email,interests,message,status,created_at,updated_at,project_slug)
      VALUES (?,?,?,?,?,'new',?,?,?)
    `,
    ).run(
      SYNTHETIC_APPLICATION_ID,
      "synthetic fixture",
      "staging-applicant@atlasez.test",
      "staging",
      "migration drill",
      NOW,
      NOW,
      "thinking-cafe",
    );
    const insertDelivery = db.prepare(`
      INSERT INTO atlasez_application_email_deliveries
        (id,application_id,recipient_email,kind,subject,text_body,html_body,status,attempt_count,
         next_attempt_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?, ?,0,?,?,?)
    `);
    insertDelivery.run(
      "staging-applicant-confirmation",
      SYNTHETIC_APPLICATION_ID,
      "staging-applicant@atlasez.test",
      "applicant_confirmation",
      "synthetic confirmation",
      "synthetic body",
      "<p>synthetic</p>",
      "sent",
      NOW,
      NOW,
      NOW,
    );
    insertDelivery.run(
      "staging-operator-notification",
      SYNTHETIC_APPLICATION_ID,
      "staging-operator@atlasez.test",
      "operator_notification",
      "synthetic operator notice",
      "synthetic body",
      "<p>synthetic</p>",
      "pending",
      NOW,
      NOW,
      NOW,
    );
    assert.equal(
      count(
        db,
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries WHERE application_id=?",
        SYNTHETIC_APPLICATION_ID,
      ),
      2,
    );

    db.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
    db.close();
    db = undefined;

    db = new DatabaseSync(databasePath);
    db.exec(readFileSync(join(migrationDirectory, TARGET_MIGRATION), "utf8"));
    db.prepare("INSERT INTO d1_migrations(name) VALUES(?)").run(
      TARGET_MIGRATION,
    );
    const migrated = db
      .prepare(
        `
      SELECT operator_notification_recipients_json,intake_reconciliation_required
        FROM atlasez_member_applications WHERE id=?
    `,
      )
      .get(SYNTHETIC_APPLICATION_ID);
    assert.equal(
      migrated?.operator_notification_recipients_json,
      '["staging-operator@atlasez.test"]',
    );
    assert.equal(migrated?.intake_reconciliation_required, 0);
    assert.equal(
      count(
        db,
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries WHERE application_id=?",
        SYNTHETIC_APPLICATION_ID,
      ),
      2,
    );
    assert.equal(
      db
        .prepare(
          "SELECT status FROM atlasez_application_email_deliveries WHERE id='staging-applicant-confirmation'",
        )
        .get()?.status,
      "sent",
    );
    assert.ok(
      db
        .prepare("SELECT 1 FROM d1_migrations WHERE name=?")
        .get(TARGET_MIGRATION),
    );

    // An older Worker that inserts only its pre-0134 columns remains compatible:
    // the two added columns are nullable/defaulted and do not become required inputs.
    db.prepare(
      `
      INSERT INTO atlasez_member_applications
        (id,name,email,interests,message,status,created_at,updated_at,project_slug)
      VALUES ('staging-old-worker-write','synthetic fixture','old-worker@atlasez.test','compat','compat','new',?,?,?)
    `,
    ).run(NOW, NOW, "thinking-cafe");
    const oldWorkerRow = db
      .prepare(
        `
      SELECT operator_notification_recipients_json,intake_reconciliation_required
        FROM atlasez_member_applications WHERE id='staging-old-worker-write'
    `,
      )
      .get();
    assert.equal(oldWorkerRow?.operator_notification_recipients_json, null);
    assert.equal(oldWorkerRow?.intake_reconciliation_required, 0);
    db.close();
    db = undefined;

    // Restore only the isolated SQLite fixture and verify it returns to pre-0134.
    copyFileSync(backupPath, databasePath);
    db = new DatabaseSync(databasePath);
    const restoredColumns = columnNames(db);
    assert.equal(
      restoredColumns.has("operator_notification_recipients_json"),
      false,
    );
    assert.equal(restoredColumns.has("intake_reconciliation_required"), false);
    assert.equal(
      count(db, "SELECT COUNT(*) AS count FROM atlasez_member_applications"),
      1,
    );
    assert.equal(
      count(
        db,
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries WHERE application_id=?",
        SYNTHETIC_APPLICATION_ID,
      ),
      2,
    );
    assert.equal(
      count(
        db,
        "SELECT COUNT(*) AS count FROM d1_migrations WHERE name=?",
        TARGET_MIGRATION,
      ),
      0,
    );
    return {
      preMigrationFiles: targetIndex,
      migration: TARGET_MIGRATION,
      preservedApplicationRows: 1,
      preservedEmailQueueRows: 2,
      legacyInsertCompatible: true,
      isolatedBackupRestore: true,
    };
  } finally {
    db?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
