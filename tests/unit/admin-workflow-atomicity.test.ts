import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import worker from "../../src/admin-worker";

class SqliteD1Statement {
  private values: SQLInputValue[] = [];

  constructor(
    private readonly db: DatabaseSync,
    private readonly query: string,
    private readonly afterFirst?: (query: string, row: unknown) => void,
  ) {}

  bind(...values: unknown[]) {
    this.values = values as SQLInputValue[];
    return this;
  }

  async first<T>() {
    const row =
      (this.db.prepare(this.query).get(...this.values) as T | undefined) ??
      null;
    this.afterFirst?.(this.query, row);
    return row;
  }

  async all<T>() {
    return {
      results: this.db.prepare(this.query).all(...this.values) as T[],
    };
  }

  async run() {
    const result = this.db.prepare(this.query).run(...this.values);
    return { meta: { changes: Number(result.changes) } };
  }
}

const databases: DatabaseSync[] = [];

const createEnvironment = (
  options: {
    withoutWorkflowEvents?: boolean;
    raceApplicationRead?: boolean;
  } = {},
) => {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec(`
    CREATE TABLE editorial_member_profile_change_requests (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      status TEXT NOT NULL,
      reviewed_by TEXT,
      reviewed_at TEXT,
      review_note TEXT,
      proposed_display_name TEXT,
      proposed_university TEXT,
      proposed_year TEXT,
      proposed_affiliation_type TEXT,
      proposed_country TEXT,
      proposed_timezone TEXT,
      proposed_bio TEXT,
      task_id TEXT
    );
    CREATE TABLE editorial_member_profiles (
      email TEXT PRIMARY KEY,
      display_name TEXT,
      availability_note TEXT,
      university TEXT,
      year TEXT,
      interests TEXT,
      affiliation_type TEXT,
      country TEXT,
      timezone TEXT,
      bio TEXT,
      updated_at TEXT
    );
    CREATE TABLE editorial_tasks (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE TABLE editorial_project_profile_change_requests (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      status TEXT NOT NULL,
      project_id TEXT NOT NULL,
      proposed_internal_bio TEXT,
      task_id TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      review_note TEXT
    );
    CREATE TABLE editorial_project_member_profiles (
      project_id TEXT NOT NULL,
      email TEXT NOT NULL,
      internal_bio TEXT,
      updated_at TEXT,
      UNIQUE(project_id,email)
    );
    CREATE TABLE atlasez_projects (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE atlasez_project_memberships (
      project_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      UNIQUE(project_id,email)
    );
    CREATE TABLE atlasez_member_discord_accounts (
      email TEXT PRIMARY KEY,
      discord_user_id TEXT,
      access_token_ciphertext TEXT NOT NULL DEFAULT '',
      refresh_token_ciphertext TEXT NOT NULL DEFAULT '',
      token_expires_at TEXT,
      oauth_scope TEXT NOT NULL DEFAULT '',
      oauth_connected_at TEXT
    );
    CREATE TABLE atlasez_application_email_deliveries (
      id TEXT PRIMARY KEY, application_id TEXT, recipient_email TEXT, kind TEXT,
      subject TEXT, text_body TEXT, html_body TEXT, status TEXT, attempt_count INTEGER,
      next_attempt_at TEXT, created_at TEXT, updated_at TEXT,
      UNIQUE(application_id,kind)
    );
    CREATE TABLE atlasez_member_applications (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      nickname TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL,
      status TEXT NOT NULL,
      project_slug TEXT NOT NULL,
      family_name TEXT NOT NULL DEFAULT '',
      given_name TEXT NOT NULL DEFAULT '',
      middle_name TEXT NOT NULL DEFAULT '',
      family_name_kana TEXT NOT NULL DEFAULT '',
      given_name_kana TEXT NOT NULL DEFAULT '',
      form_language TEXT NOT NULL DEFAULT 'ja',
      institution TEXT NOT NULL DEFAULT '',
      grade TEXT NOT NULL DEFAULT '',
      affiliation_type TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
      desired_subjects TEXT NOT NULL DEFAULT '',
      availability_note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      provisioning_status TEXT,
      provisioning_error TEXT,
      accepted_by TEXT,
      provisioning_attempt_count INTEGER NOT NULL DEFAULT 0,
      provisioned_at TEXT,
      provisioning_next_attempt_at TEXT,
      provisioning_last_attempt_at TEXT
    );
    CREATE TABLE admin_audit_log (
      id TEXT PRIMARY KEY,
      actor_email TEXT,
      action TEXT,
      target_type TEXT,
      target_id TEXT,
      target_label TEXT,
      summary TEXT,
      details_json TEXT,
      created_at TEXT
    );
    ${
      options.withoutWorkflowEvents
        ? ""
        : `
      CREATE TABLE workflow_transition_events (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        from_state TEXT NOT NULL,
        to_state TEXT NOT NULL,
        actor_email TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        expected_updated_at TEXT,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(actor_email,idempotency_key)
      );
    `
    }
  `);
  db.prepare(
    `
    INSERT INTO editorial_member_profile_change_requests (
      id,email,status,proposed_display_name,proposed_university,proposed_year,
      proposed_affiliation_type,proposed_country,proposed_timezone,proposed_bio,task_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `,
  ).run(
    "123e4567-e89b-12d3-a456-426614174000",
    "member@example.com",
    "pending",
    "Member Example",
    "University",
    "3",
    "student",
    "JP",
    "Asia/Tokyo",
    "Profile bio",
    "task-1",
  );
  db.prepare(
    `
    INSERT INTO editorial_project_profile_change_requests (
      id,email,status,project_id,proposed_internal_bio
    ) VALUES (?,?,?,?,?)
  `,
  ).run(
    "323e4567-e89b-12d3-a456-426614174000",
    "member@example.com",
    "pending",
    "atlas",
    "Project profile bio",
  );
  db.prepare("INSERT INTO editorial_tasks (id,status) VALUES (?,?)").run(
    "task-1",
    "open",
  );
  db.prepare(
    "INSERT INTO atlasez_projects (id,slug,name) VALUES ('atlas','atlas','Atlas')",
  ).run();
  db.prepare(
    `
    INSERT INTO atlasez_member_applications (id,name,email,status,project_slug,updated_at)
    VALUES (?,?,?,?,?,?)
  `,
  ).run(
    "223e4567-e89b-12d3-a456-426614174000",
    "Applicant Example",
    "applicant@example.com",
    "reviewing",
    "atlas",
    "2026-09-28T00:00:00.000Z",
  );

  const environment = {
    ADMIN_AUTH_MODE: "local",
    ADMIN_LOCAL_EMAIL: "reviewer@example.com",
    REPORTS: {
      prepare: (query: string) =>
        new SqliteD1Statement(db, query, (sql) => {
          if (
            options.raceApplicationRead &&
            sql.includes(
              "SELECT project_slug,status FROM atlasez_member_applications",
            )
          ) {
            options.raceApplicationRead = false;
            db.prepare(
              "UPDATE atlasez_member_applications SET status='new',updated_at='2026-09-28T00:01:00.000Z'",
            ).run();
          }
        }),
      batch: async (statements: SqliteD1Statement[]) => {
        db.exec("BEGIN");
        try {
          const results = [];
          for (const statement of statements)
            results.push(await statement.run());
          db.exec("COMMIT");
          return results;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    },
  };
  return { db, environment };
};

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

const approveRequest = (
  environment: ReturnType<typeof createEnvironment>["environment"],
  viaWorkflowApi = false,
) =>
  worker.fetch(
    new Request(
      viaWorkflowApi
        ? "http://localhost/api/admin/workflow/transition"
        : "http://localhost/api/admin/profile-change-requests/123e4567-e89b-12d3-a456-426614174000",
      {
        method: viaWorkflowApi ? "POST" : "PATCH",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify(
          viaWorkflowApi
            ? {
                entityType: "approval",
                entityId: "123e4567-e89b-12d3-a456-426614174000",
                fromState: "pending",
                toState: "approved",
                idempotencyKey: "approve-profile-1",
              }
            : { action: "approve" },
        ),
      },
    ),
    environment as never,
  );

const rejectApplication = (
  environment: ReturnType<typeof createEnvironment>["environment"],
  viaWorkflowApi = false,
  idempotencyKey = "reject-application-1",
) =>
  worker.fetch(
    new Request(
      viaWorkflowApi
        ? "http://localhost/api/admin/workflow/transition"
        : "http://localhost/api/admin/applications/223e4567-e89b-12d3-a456-426614174000?project=atlas",
      {
        method: viaWorkflowApi ? "POST" : "PATCH",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify(
          viaWorkflowApi
            ? {
                entityType: "application",
                entityId: "223e4567-e89b-12d3-a456-426614174000",
                fromState: "reviewing",
                toState: "rejected",
                idempotencyKey,
              }
            : {
                status: "rejected",
                expectedUpdatedAt: "2026-09-28T00:00:00.000Z",
                idempotencyKey,
              },
        ),
      },
    ),
    environment as never,
  );

const approveProjectProfile = (
  environment: ReturnType<typeof createEnvironment>["environment"],
) =>
  worker.fetch(
    new Request(
      "http://localhost/api/admin/project-profile-change-requests/323e4567-e89b-12d3-a456-426614174000",
      {
        method: "PATCH",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "approve",
          idempotencyKey: "approve-project-profile-1",
        }),
      },
    ),
    environment as never,
  );

const acceptApplication = (
  environment: ReturnType<typeof createEnvironment>["environment"],
  idempotencyKey = "accept-application-1",
) =>
  worker.fetch(
    new Request("http://localhost/api/admin/workflow/transition", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        entityType: "application",
        entityId: "223e4567-e89b-12d3-a456-426614174000",
        fromState: "reviewing",
        toState: "accepted",
        idempotencyKey,
      }),
    }),
    environment as never,
  );

it("commits profile approval, task completion, and workflow event together", async () => {
  const { db, environment } = createEnvironment();

  const response = await approveRequest(environment, true);

  expect(response.status, await response.clone().text()).toBe(200);
  expect(
    db
      .prepare("SELECT status FROM editorial_member_profile_change_requests")
      .get(),
  ).toEqual({ status: "approved" });
  expect(
    db.prepare("SELECT display_name FROM editorial_member_profiles").get(),
  ).toEqual({ display_name: "Member Example" });
  expect(
    db.prepare("SELECT status FROM editorial_tasks WHERE id='task-1'").get(),
  ).toEqual({ status: "done" });
  expect(
    db
      .prepare(
        "SELECT entity_type,from_state,to_state FROM workflow_transition_events",
      )
      .get(),
  ).toEqual({
    entity_type: "approval",
    from_state: "pending",
    to_state: "approved",
  });
  const replay = await approveRequest(environment, true);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toMatchObject({ ok: true, replayed: true });
  expect(
    db
      .prepare("SELECT COUNT(*) AS count FROM workflow_transition_events")
      .get(),
  ).toEqual({ count: 1 });
  const reusedKey = await rejectApplication(
    environment,
    true,
    "approve-profile-1",
  );
  expect(reusedKey.status).toBe(409);
  expect(await reusedKey.json()).toMatchObject({
    code: "IDEMPOTENCY_KEY_REUSED",
  });
  expect(
    db.prepare("SELECT status FROM atlasez_member_applications").get(),
  ).toEqual({ status: "reviewing" });
});

it("records and replays application status changes only once", async () => {
  const { db, environment } = createEnvironment();

  const response = await rejectApplication(environment, true);
  expect(response.status, await response.clone().text()).toBe(200);
  expect(
    db.prepare("SELECT status FROM atlasez_member_applications").get(),
  ).toEqual({ status: "rejected" });
  expect(
    db
      .prepare(
        "SELECT entity_type,from_state,to_state FROM workflow_transition_events",
      )
      .get(),
  ).toEqual({
    entity_type: "application",
    from_state: "reviewing",
    to_state: "rejected",
  });

  const replay = await rejectApplication(environment, true);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toMatchObject({ ok: true, replayed: true });
  expect(
    db
      .prepare("SELECT COUNT(*) AS count FROM workflow_transition_events")
      .get(),
  ).toEqual({ count: 1 });
});

it("rejects task workflow idempotency keys already used by another entity", async () => {
  const { db, environment } = createEnvironment();
  db.prepare(
    `INSERT INTO workflow_transition_events
    (id,entity_type,entity_id,from_state,to_state,actor_email,idempotency_key,metadata_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    "application-event",
    "application",
    "223e4567-e89b-12d3-a456-426614174000",
    "reviewing",
    "rejected",
    "reviewer@example.com",
    "cross-entity-key",
    "{}",
    "2026-09-28T00:00:00.000Z",
  );

  const response = await worker.fetch(
    new Request("http://localhost/api/admin/workflow/transition", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        entityType: "task",
        entityId: "task-1",
        fromState: "open",
        toState: "doing",
        idempotencyKey: "cross-entity-key",
      }),
    }),
    environment as never,
  );

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    code: "IDEMPOTENCY_KEY_REUSED",
  });
  expect(
    db
      .prepare("SELECT status FROM atlasez_member_applications WHERE id=?")
      .get("223e4567-e89b-12d3-a456-426614174000"),
  ).toEqual({ status: "reviewing" });
});

it("rejects a delegated application transition when its state changes after the workflow read", async () => {
  const { db, environment } = createEnvironment({ raceApplicationRead: true });

  const response = await rejectApplication(
    environment,
    true,
    "racing-application",
  );

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    code: "STALE_STATE",
    currentState: "new",
  });
  expect(
    db.prepare("SELECT status FROM atlasez_member_applications").get(),
  ).toEqual({ status: "new" });
  expect(
    db
      .prepare("SELECT COUNT(*) AS count FROM workflow_transition_events")
      .get(),
  ).toEqual({ count: 0 });
});

it("commits application acceptance, profile, membership, and event as one operation", async () => {
  const { db, environment } = createEnvironment();

  const response = await acceptApplication(environment);

  expect(response.status, await response.clone().text()).toBe(200);
  expect(
    db.prepare("SELECT status FROM atlasez_member_applications").get(),
  ).toEqual({ status: "accepted" });
  expect(
    db.prepare("SELECT display_name FROM editorial_member_profiles").get(),
  ).toEqual({ display_name: "Applicant Example" });
  expect(
    db
      .prepare(
        "SELECT project_id,role FROM atlasez_project_memberships WHERE email='applicant@example.com'",
      )
      .get(),
  ).toEqual({ project_id: "atlas", role: "member" });
  expect(
    db
      .prepare(
        "SELECT entity_type,from_state,to_state FROM workflow_transition_events",
      )
      .get(),
  ).toEqual({
    entity_type: "application",
    from_state: "reviewing",
    to_state: "accepted",
  });
});

it("rolls back application acceptance and membership if its workflow event cannot be recorded", async () => {
  const { db, environment } = createEnvironment({
    withoutWorkflowEvents: true,
  });

  const response = await acceptApplication(environment, "accept-without-event");

  expect(response.status).toBe(500);
  expect(
    db.prepare("SELECT status FROM atlasez_member_applications").get(),
  ).toEqual({ status: "reviewing" });
  expect(
    db.prepare("SELECT COUNT(*) AS count FROM editorial_member_profiles").get(),
  ).toEqual({ count: 0 });
  expect(
    db
      .prepare("SELECT COUNT(*) AS count FROM atlasez_project_memberships")
      .get(),
  ).toEqual({ count: 1 });
});

it("commits project-profile approval with its event and replays it once", async () => {
  const { db, environment } = createEnvironment();

  const response = await approveProjectProfile(environment);
  expect(response.status, await response.clone().text()).toBe(200);
  expect(
    db
      .prepare("SELECT status FROM editorial_project_profile_change_requests")
      .get(),
  ).toEqual({ status: "approved" });
  expect(
    db
      .prepare("SELECT internal_bio FROM editorial_project_member_profiles")
      .get(),
  ).toEqual({ internal_bio: "Project profile bio" });

  const replay = await approveProjectProfile(environment);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toMatchObject({ ok: true, replayed: true });
  expect(
    db
      .prepare("SELECT COUNT(*) AS count FROM workflow_transition_events")
      .get(),
  ).toEqual({ count: 1 });
});

it("rolls back project-profile data when the workflow event cannot be recorded", async () => {
  const { db, environment } = createEnvironment({
    withoutWorkflowEvents: true,
  });

  const response = await approveProjectProfile(environment);

  expect(response.status).toBe(500);
  expect(
    db
      .prepare("SELECT status FROM editorial_project_profile_change_requests")
      .get(),
  ).toEqual({ status: "pending" });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM editorial_project_member_profiles",
      )
      .get(),
  ).toEqual({ count: 0 });
});

it("does not replay a member-profile event for a project-profile request with the same ID", async () => {
  const { db, environment } = createEnvironment();
  db.prepare(
    `INSERT INTO editorial_project_profile_change_requests (id,email,status,project_id,proposed_internal_bio)
    VALUES (?,?,?,?,?)`,
  ).run(
    "123e4567-e89b-12d3-a456-426614174000",
    "member@example.com",
    "pending",
    "atlas",
    "Other project bio",
  );
  db.prepare(
    `INSERT INTO workflow_transition_events
    (id,entity_type,entity_id,from_state,to_state,actor_email,idempotency_key,metadata_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    "event-collision",
    "approval",
    "123e4567-e89b-12d3-a456-426614174000",
    "pending",
    "approved",
    "reviewer@example.com",
    "collision-key",
    JSON.stringify({ requestType: "member-profile" }),
    "2026-09-28T00:00:00.000Z",
  );

  const response = await worker.fetch(
    new Request(
      "http://localhost/api/admin/project-profile-change-requests/123e4567-e89b-12d3-a456-426614174000",
      {
        method: "PATCH",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "approve",
          idempotencyKey: "collision-key",
        }),
      },
    ),
    environment as never,
  );

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    code: "IDEMPOTENCY_KEY_REUSED",
  });
  expect(
    db
      .prepare(
        "SELECT status FROM editorial_project_profile_change_requests WHERE id=?",
      )
      .get("123e4567-e89b-12d3-a456-426614174000"),
  ).toEqual({ status: "pending" });
});

it("rolls back the profile approval when its workflow event cannot be recorded", async () => {
  const { db, environment } = createEnvironment({
    withoutWorkflowEvents: true,
  });

  const response = await approveRequest(environment);

  expect(response.status).toBe(500);
  expect(
    db
      .prepare("SELECT status FROM editorial_member_profile_change_requests")
      .get(),
  ).toEqual({ status: "pending" });
  expect(
    db.prepare("SELECT COUNT(*) AS count FROM editorial_member_profiles").get(),
  ).toEqual({ count: 0 });
  expect(
    db.prepare("SELECT status FROM editorial_tasks WHERE id='task-1'").get(),
  ).toEqual({ status: "open" });
});
