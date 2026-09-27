import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = (name: string) =>
  readFileSync(new URL(`../../migrations/${name}`, import.meta.url), "utf8");

describe("ADMIN D1 migration history", () => {
  it("keeps source for migrations already recorded in production", () => {
    expect(migration("0111_editorial_progress_reactions.sql")).toContain(
      "CREATE TABLE IF NOT EXISTS editorial_progress_reactions",
    );
    expect(migration("0112_admin_genre_role_catalog_lifecycle.sql")).toContain(
      "ADD COLUMN permission_scope",
    );
    expect(migration("0113_admin_member_lifecycle.sql")).toContain(
      "CREATE TABLE IF NOT EXISTS admin_member_lifecycle",
    );
  });

  it("enforces lowercase reaction emails with a copy-preserving follow-up migration", () => {
    const rebuild = migration(
      "0117_enforce_lowercase_progress_reaction_emails.sql",
    );

    expect(rebuild).toContain("CHECK(actor_email = lower(actor_email))");
    expect(rebuild).toContain("SELECT id, progress_id, lower(actor_email)");
    expect(rebuild).not.toContain("INSERT OR IGNORE");
    expect(rebuild).toContain("DROP TABLE editorial_progress_reactions");
    expect(rebuild).toContain("RENAME TO editorial_progress_reactions");
  });
});
