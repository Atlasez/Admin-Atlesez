import { describe, expect, it, vi } from "vitest";
import worker from "../../src/admin-worker";
import { dispatchApplicationEmails } from "../../src/lib/application-email-delivery";
import { seminarFields } from "../../src/lib/seminar-fields";
import { createAdminTestEnvironment } from "../helpers/admin-test-environment";

const url = "https://admin.atlasez.test";
const api = "/api/seminars";
const operator = "reviewer@atlasez.test";
const inactive = "paused-reviewer@atlasez.test";
const host = "organizer@atlasez.test";
const applicant = "applicant@atlasez.test";
const outsider = "outsider@atlasez.test";

const payload = () => ({
  ...Object.fromEntries(seminarFields.map(({ key }) => [key, `公開 ${key}`])),
  title: "宇宙物理学のゼミ",
  name: "企画者氏名",
  phase: "active",
  recruitment: "open",
  operationsNote: "非公開の企画連絡",
  submissionKey: crypto.randomUUID(),
});

function fixture() {
  const { db, env, request } = createAdminTestEnvironment();
  db.exec(`
    INSERT INTO atlasez_projects(id,slug,name,created_at)
      VALUES('seminar-platform','seminar-platform','ゼミプラットフォーム','2026-01-01');
    INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at)
      VALUES('seminar-platform','${operator}','manager','2026-01-01'),
        ('seminar-platform','${inactive}','manager','2026-01-01');
    INSERT INTO atlasez_project_member_lifecycle(project_id,email,state,role_snapshot,last_request_id,updated_at)
      VALUES('seminar-platform','${inactive}','paused','manager','test','2026-01-01');
  `);
  const anonymous = (path: string) =>
    worker.fetch(new Request(`${url}${path}`), env as never);
  const asUser = (path: string, email: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("cookie", `atlasez_admin_session=isolated-${email}`);
    headers.set("origin", url);
    return worker.fetch(
      new Request(`${url}${path}`, { ...init, headers }),
      env as never,
    );
  };
  async function approved() {
    const result = await request(`${api}/proposals`, host, payload());
    expect(result.status).toBe(201);
    const { number } = await result.json();
    expect(
      (
        await request(`${api}/${number}/review`, operator, {
          decision: "approved",
        })
      ).status,
    ).toBe(200);
    return number as number;
  }
  async function join(number: number, email = applicant) {
    const result = await request(`${api}/${number}/join`, email, {
      name: "参加申請者",
      hostNote: "主催者への質問",
      operationsNote: "運営への非公開連絡",
    });
    expect(result.status).toBe(201);
    const { id } = await result.json();
    return id as string;
  }
  return { db, env, request, anonymous, asUser, approved, join };
}

describe("seminar platform", () => {
  it("returns a new Google account to the selected seminar form", async () => {
    const { env } = fixture();
    const oauthEnv = {
      ...env,
      ADMIN_PUBLIC_ORIGIN: url,
      GOOGLE_OAUTH_CLIENT_ID: "test-client",
      GOOGLE_OAUTH_CLIENT_SECRET: "test-secret",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "https://oauth2.googleapis.com/token")
          return Response.json({ access_token: "test-token" });
        if (
          String(input) === "https://openidconnect.googleapis.com/v1/userinfo"
        )
          return Response.json({
            email: applicant,
            email_verified: true,
            sub: "new-seminar-user",
          });
        return new Response(null, { status: 500 });
      }),
    );
    const returnTo = "/seminars/join/?number=32";
    const login = await worker.fetch(
      new Request(
        `${url}/auth/google/login?returnTo=${encodeURIComponent(returnTo)}`,
      ),
      oauthEnv,
    );
    expect(login.status).toBe(302);
    const google = new URL(login.headers.get("location")!);
    const callback = await worker.fetch(
      new Request(
        `${url}/auth/google/callback?code=test&state=${google.searchParams.get("state")}`,
        {
          headers: {
            cookie: login.headers.get("set-cookie")!.split(";", 1)[0],
          },
        },
      ),
      oauthEnv,
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe(returnTo);
    const accountCookie = callback.headers
      .getSetCookie()
      .find((value) => value.startsWith("atlasez_admin_session="))!;
    const session = await worker.fetch(
      new Request(`${url}${api}/session`, {
        headers: { cookie: accountCookie.split(";", 1)[0] },
      }),
      oauthEnv,
    );
    expect(await session.json()).toMatchObject({
      signedIn: true,
      email: applicant,
      canReview: false,
    });
  });

  it("lists the imported directory publicly without enabling unassigned hosts", async () => {
    const { anonymous, request } = fixture();
    expect(await (await anonymous(`${api}/session`)).json()).toEqual({
      signedIn: false,
    });
    expect((await anonymous(`${api}/dashboard`)).status).toBe(401);
    const { seminars } = await (await anonymous(api)).json();
    expect(seminars).toHaveLength(32);
    expect(seminars[0]).toMatchObject({
      number: 32,
      title: "リーマン面ゼミ",
      acceptingApplications: false,
    });
    expect(
      (await request(`${api}/32/host`, outsider, { email: host })).status,
    ).toBe(403);
    expect(
      (await request(`${api}/32/host`, operator, { email: host })).status,
    ).toBe(400);
    expect((await request(`${api}/session`, host)).status).toBe(200);
    expect(
      (await request(`${api}/32/host`, operator, { email: host })).status,
    ).toBe(200);
    expect(await (await anonymous(`${api}/32`)).json()).toMatchObject({
      acceptingApplications: true,
    });
    expect(
      (await request(`${api}/32/host`, operator, { email: host })).status,
    ).toBe(409);
  });

  it("publishes only approved proposals and queues exactly one notification per eligible reviewer", async () => {
    const { request, anonymous, db, env } = fixture();
    const body = payload();
    expect(
      (await request(`${api}/proposals`, host, body, "https://other.test"))
        .status,
    ).toBe(403);
    expect(
      (await request(`${api}/proposals`, host, { ...body, method: "" })).status,
    ).toBe(400);
    const first = await request(`${api}/proposals`, host, body);
    expect(first.status).toBe(201);
    const { number } = await first.json();
    expect(number).toBeGreaterThan(32);
    expect(
      await (await request(`${api}/proposals`, host, body)).json(),
    ).toEqual({ number });
    expect((await anonymous(`${api}/${number}`)).status).toBe(404);
    expect((await request(`${api}/operations`, inactive)).status).toBe(403);
    expect(
      (await request(`${api}/${number}/review`, host, { decision: "approved" }))
        .status,
    ).toBe(403);
    const { proposals } = await (
      await request(`${api}/operations`, operator)
    ).json();
    expect(proposals[0]).toMatchObject({
      number,
      status: "pending",
      email: host,
      operationsNote: body.operationsNote,
    });
    expect(
      db
        .prepare(
          "SELECT recipient_email FROM seminar_email_deliveries ORDER BY recipient_email",
        )
        .all(),
    ).toEqual([
      { recipient_email: "global@atlasez.test" },
      { recipient_email: operator },
    ]);
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
    expect(
      await dispatchApplicationEmails(
        {
          ...env,
          EMAIL_FROM: "apply@atlasez.test",
          RESEND_API_KEY: "test-key",
        },
        { channel: "seminar", fetcher },
      ),
    ).toMatchObject({ sent: 2, failed: 0 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const decision = { decision: "approved", note: "審査メモ" };
    expect(
      (await request(`${api}/${number}/review`, operator, decision)).status,
    ).toBe(200);
    expect(
      (await request(`${api}/${number}/review`, operator, decision)).status,
    ).toBe(409);
    const entry = await (await anonymous(`${api}/${number}`)).json();
    expect(entry).toMatchObject({
      number,
      title: body.title,
      acceptingApplications: true,
    });
    expect(JSON.stringify(entry)).not.toMatch(
      /非公開|企画者氏名|審査メモ|organizer@/,
    );
  });

  it("limits participation approval to the host and protects private workspaces", async () => {
    const { request, approved, join, db } = fixture();
    const number = await approved();
    const id = await join(number);
    const path = `${api}/${number}`;
    expect(
      (await request(`${path}/join`, applicant, { name: "申請" })).status,
    ).toBe(409);
    expect(
      db
        .prepare(
          "SELECT recipient_email FROM seminar_email_deliveries WHERE subject LIKE '%参加申請%'",
        )
        .all(),
    ).toEqual([{ recipient_email: host }]);
    expect((await request(`${path}/workspace`, applicant)).status).toBe(404);
    expect(
      (
        await request(`${path}/applications/${id}`, operator, {
          decision: "approved",
        })
      ).status,
    ).toBe(404);
    const hostView = await (await request(`${path}/workspace`, host)).json();
    expect(hostView.applications[0]).toMatchObject({
      email: applicant,
      host_note: "主催者への質問",
    });
    expect(JSON.stringify(hostView)).not.toContain("運営への非公開連絡");
    expect(
      (
        await request(`${path}/applications/${id}`, host, {
          decision: "approved",
        })
      ).status,
    ).toBe(200);
    expect((await request(`${path}/workspace`, applicant)).status).toBe(200);
    expect((await request(`${path}/workspace`, outsider)).status).toBe(404);
    const view = await (await request(`${api}/dashboard`, applicant)).json();
    expect(view.memberships).toEqual([
      { number, title: "宇宙物理学のゼミ", phase: "active", isHost: false },
    ]);
    expect(view.applications[0]).toMatchObject({ status: "approved" });
  });

  it("lets approved members vote, complete assigned work, and manage their own attachments", async () => {
    const { request, approved, join, asUser } = fixture();
    const number = await approved();
    const id = await join(number);
    const path = `${api}/${number}`;
    await request(`${path}/applications/${id}`, host, { decision: "approved" });
    const hostView = await (await request(`${path}/workspace`, host)).json();
    const assignee = hostView.applications[0].applicant_id;
    for (const activity of [
      { kind: "poll", title: "日程", options: "金曜\n土曜" },
      { kind: "task", title: "文献を読む", assignee },
      { kind: "notice", title: "重要なお知らせ" },
      { kind: "event", title: "初回", dueAt: "2099-01-01T10:00+09:00" },
    ])
      expect((await request(`${path}/activities`, host, activity)).status).toBe(
        201,
      );
    const { activities } = await (
      await request(`${api}/dashboard`, applicant)
    ).json();
    expect(activities).toHaveLength(4);
    const poll = activities.find(
      (row: { kind: string }) => row.kind === "poll",
    );
    const task = activities.find(
      (row: { kind: string }) => row.kind === "task",
    );
    expect(
      (await request(`${path}/activities/${poll.id}`, applicant, { choice: 1 }))
        .status,
    ).toBe(200);
    expect(
      (await request(`${path}/activities/${poll.id}`, host, { complete: true }))
        .status,
    ).toBe(200);
    expect(
      (await request(`${path}/activities/${poll.id}`, applicant, { choice: 0 }))
        .status,
    ).toBe(409);
    expect(
      (
        await request(`${path}/activities/${task.id}`, applicant, {
          complete: true,
        })
      ).status,
    ).toBe(200);

    const upload = await asUser(`${path}/materials`, applicant, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-seminar-filename": encodeURIComponent("資料.txt"),
      },
      body: "seminar handout",
    });
    expect(upload.status).toBe(201);
    const workspace = await (await request(`${path}/workspace`, host)).json();
    const material = `${path}/materials/${workspace.materials[0].id}`;
    expect((await request(material, outsider)).status).toBe(404);
    const download = await request(material, host);
    expect(download.headers.get("content-disposition")).toContain("attachment");
    expect(await download.text()).toBe("seminar handout");
    const rename = await asUser(material, applicant, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "新版.txt" }),
    });
    expect(rename.status).toBe(200);
    expect((await asUser(material, host, { method: "DELETE" })).status).toBe(
      200,
    );
    expect((await request(material, applicant)).status).toBe(404);
  });
});
