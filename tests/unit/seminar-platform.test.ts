import { describe, expect, it, vi } from "vitest";
import worker from "../../src/admin-worker";
import { SEMINAR_REVIEW_PATH } from "../../src/lib/admin-routes";
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
  it.each([
    [
      "/seminars/join/?number=32",
      applicant,
      false,
      "/seminars/join/?number=32",
    ],
    [SEMINAR_REVIEW_PATH, operator, true, SEMINAR_REVIEW_PATH],
    [
      "https://atlasez.org/seminars/propose/",
      host,
      false,
      "https://atlasez.org/seminars/propose/",
    ],
    [
      "https://atlasez.org/seminars/join/?number=32",
      applicant,
      false,
      "https://atlasez.org/seminars/join/?number=32",
    ],
    [
      "https://atlasez.org/seminars/member/",
      applicant,
      false,
      "https://atlasez.org/seminars/member/",
    ],
    [
      "https://atlasez.org/seminars/workspace/?number=32",
      applicant,
      false,
      "https://atlasez.org/seminars/workspace/?number=32",
    ],
    ["https://example.com/seminars/propose/", host, false, "/apply/"],
  ])(
    "returns Google accounts to the approved page from %s",
    async (returnTo, email, canReview, expectedReturnTo) => {
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
              email,
              email_verified: true,
              sub: "new-seminar-user",
            });
          return new Response(null, { status: 500 });
        }),
      );
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
      expect(callback.headers.get("location")).toBe(expectedReturnTo);
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
        email,
        canReview,
      });
    },
  );

  it("allows credentialed seminar requests from the public site only", async () => {
    const { env, request } = fixture();
    const preflight = await worker.fetch(
      new Request(`${url}${api}/proposals`, {
        method: "OPTIONS",
        headers: {
          origin: "https://atlasez.org",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      }),
      env as never,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(
      "https://atlasez.org",
    );
    expect(preflight.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );

    const session = await request(
      `${api}/session`,
      host,
      undefined,
      "https://atlasez.org",
    );
    expect(session.status).toBe(200);
    expect(session.headers.get("access-control-allow-origin")).toBe(
      "https://atlasez.org",
    );
    expect(await session.json()).toMatchObject({ signedIn: true, email: host });

    const proposal = await request(
      `${api}/proposals`,
      host,
      payload(),
      "https://atlasez.org",
    );
    expect(proposal.status).toBe(201);
    expect(proposal.headers.get("access-control-allow-origin")).toBe(
      "https://atlasez.org",
    );

    const rejected = await request(
      `${api}/proposals`,
      host,
      payload(),
      "https://example.com",
    );
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get("access-control-allow-origin")).toBeNull();

    const operations = await request(
      `${api}/operations`,
      operator,
      undefined,
      "https://atlasez.org",
    );
    expect(operations.status).toBe(403);
    expect(operations.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("allows public catalog and approved-member reads with credentialed CORS", async () => {
    const { request, approved, join } = fixture();
    const catalog = await request(
      api,
      applicant,
      undefined,
      "https://atlasez.org",
    );
    expect(catalog.status).toBe(200);
    expect(catalog.headers.get("access-control-allow-origin")).toBe(
      "https://atlasez.org",
    );
    expect((await catalog.json()).seminars).toHaveLength(32);

    const detail = await request(
      `${api}/32`,
      applicant,
      undefined,
      "https://atlasez.org",
    );
    expect(detail.status).toBe(200);
    expect(detail.headers.get("access-control-allow-credentials")).toBe("true");

    const number = await approved();
    const applicationId = await join(number);
    expect(
      (
        await request(`${api}/${number}/applications/${applicationId}`, host, {
          decision: "approved",
        })
      ).status,
    ).toBe(200);
    const dashboard = await request(
      `${api}/dashboard`,
      applicant,
      undefined,
      "https://atlasez.org",
    );
    expect(dashboard.status).toBe(200);
    expect(dashboard.headers.get("access-control-allow-origin")).toBe(
      "https://atlasez.org",
    );
    expect(await dashboard.json()).toMatchObject({
      memberships: [{ number, isHost: false }],
    });
    const workspace = await request(
      `${api}/${number}/workspace`,
      applicant,
      undefined,
      "https://atlasez.org",
    );
    expect(workspace.status).toBe(200);
    expect(workspace.headers.get("access-control-allow-origin")).toBe(
      "https://atlasez.org",
    );
  });

  it("limits public preflights to seminar pages and membership actions", async () => {
    const { env } = fixture();
    const publicHeaders = {
      origin: "https://atlasez.org",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type, x-seminar-filename",
    };
    const upload = await worker.fetch(
      new Request(`${url}${api}/32/materials`, {
        method: "OPTIONS",
        headers: publicHeaders,
      }),
      env as never,
    );
    expect(upload.status).toBe(204);
    expect(upload.headers.get("access-control-allow-methods")).toContain(
      "DELETE",
    );

    const operations = await worker.fetch(
      new Request(`${url}${api}/operations`, {
        method: "OPTIONS",
        headers: {
          origin: "https://atlasez.org",
          "access-control-request-method": "GET",
        },
      }),
      env as never,
    );
    expect(operations.status).toBe(403);
    expect(operations.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("redirects the former operations URL and serves the admin page only to project reviewers", async () => {
    const { anonymous, request } = fixture();
    const legacy = await anonymous("/seminars/operations/");
    expect(legacy.status).toBe(302);
    expect(legacy.headers.get("location")).toBe(SEMINAR_REVIEW_PATH);
    const signedOut = await anonymous(SEMINAR_REVIEW_PATH);
    expect(signedOut.status).toBe(302);
    expect(signedOut.headers.get("location")).toBe(
      `/auth/google/login?returnTo=${encodeURIComponent(SEMINAR_REVIEW_PATH)}`,
    );
    expect(
      (await request(`${SEMINAR_REVIEW_PATH}?project=atlas`, outsider)).status,
    ).toBe(403);
    expect((await request(SEMINAR_REVIEW_PATH, inactive)).status).toBe(403);
    expect((await request(SEMINAR_REVIEW_PATH, operator)).status).toBe(200);
  });

  it.each([
    ["/seminars", "https://atlasez.org/seminars/"],
    ["/seminars/", "https://atlasez.org/seminars/"],
    ["/seminars/propose/", "https://atlasez.org/seminars/propose/"],
    ["/seminars/member/", "https://atlasez.org/seminars/member/"],
    [
      "/seminars/join/?number=32",
      "https://atlasez.org/seminars/join/?number=32",
    ],
    [
      "/seminars/detail/?number=32",
      "https://atlasez.org/seminars/detail/?number=32",
    ],
    [
      "/seminars/workspace/?number=32",
      "https://atlasez.org/seminars/workspace/?number=32",
    ],
  ])(
    "sends public seminar route %s to the public site",
    async (path, target) => {
      const { anonymous } = fixture();
      const response = await anonymous(path);
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(target);
    },
  );

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
    const imported = new Map(
      seminars.map((seminar: { number: number }) => [seminar.number, seminar]),
    );
    expect(imported.get(20)).toMatchObject({
      title: "流体力学ゼミ",
      details: { theme: "流体力学" },
    });
    expect(imported.get(31)).toMatchObject({
      details: {
        description: expect.stringContaining(
          "主催者自身は近現代ドイツの歴史・政治に非常に強い関心があります。",
        ),
        remarks:
          "他人を傷つけたり、差別的な発言をする方の参加は断固お断りさせていただきます。\n「差別をしない」というのは人として当たり前のことであり、普遍的な理念です。",
      },
    });
    expect(imported.get(5)).toMatchObject({
      details: {
        remarks:
          "かなり進んでいて、上巻の半分以上は終わりました。これから超関数を導入していく感じです。",
      },
    });
    expect(imported.get(29)).toMatchObject({
      details: {
        remarks:
          "9版と10版で多少数値にブレがある。しかし、0.1とかの些細な違いなのでこの違いの意図まではよく分からなかった。",
      },
    });
    expect(imported.get(16)).toMatchObject({
      details: {
        remarks: expect.stringContaining(
          "https://docs.google.com/document/d/1oC5vn6lWZ5_S2tFY8tsbUfJQM68vjwK-WhLmSHwPvNg/edit?usp=sharing",
        ),
      },
    });
    expect(imported.get(10)).toMatchObject({
      details: { remarks: "6/20時点で§8の中盤です。" },
    });
    expect(imported.get(8)).toMatchObject({
      details: {
        remarks:
          "現在の進行状況としては、まだ数学的準備のフェーズです。ラグランジアンも出てきてません。",
      },
    });
    expect(imported.get(15)).toMatchObject({
      details: {
        remarks: expect.stringContaining("火曜6限"),
      },
    });
    for (const number of [2, 3])
      expect(imported.get(number)).toMatchObject({
        details: {
          remarks: expect.stringContaining("個別ページでは「募集中」"),
        },
      });
    expect(imported.get(17)).toMatchObject({
      details: {
        description:
          expect.stringContaining("場の量子論を勉強中の初学者です。"),
      },
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

  it("routes proposals to active global reviewers when the seminar project has no active managers", async () => {
    const { db, env, request } = fixture();
    env.ADMIN_PRIMARY_EMAIL = "";
    const globalReviewer = "fallback@atlasez.test";
    const pausedReviewer = "paused-global@atlasez.test";
    db.exec(`
      DELETE FROM atlasez_project_memberships WHERE email='${operator}';
      DELETE FROM report_admin_permissions WHERE subject='*';
      INSERT INTO report_admin_permissions(email,subject)
        VALUES('${globalReviewer}','*'),('${pausedReviewer}','*');
      INSERT INTO atlasez_project_member_lifecycle(project_id,email,state,role_snapshot,last_request_id,updated_at)
        VALUES('atlas','${pausedReviewer}','paused','manager','test','2026-01-01');
    `);
    const proposal = await request(`${api}/proposals`, host, payload());
    expect(proposal.status).toBe(201);
    const { number } = await proposal.json();
    expect(
      db.prepare("SELECT recipient_email FROM seminar_email_deliveries").all(),
    ).toEqual([{ recipient_email: globalReviewer }]);
    const decision = { decision: "approved" };
    expect(
      (await request(`${api}/${number}/review`, pausedReviewer, decision))
        .status,
    ).toBe(403);
    expect(
      (await request(`${api}/${number}/review`, globalReviewer, decision))
        .status,
    ).toBe(200);
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
