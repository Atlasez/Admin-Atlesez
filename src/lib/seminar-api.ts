import { SEMINAR_REVIEW_PATH } from "./admin-routes";
import {
  seminarJson,
  seminarError,
  missingSeminar,
  seminarText,
  seminarPayload,
} from "./seminar-http";
import type { D1Database } from "./admin-database";
import {
  maxSeminarFileBytes,
  phaseLabels,
  profileFields,
  recruitmentLabels,
  seminarFields,
} from "./seminar-fields";
import {
  handleSeminarWorkspace,
  listSeminarActivities,
} from "./seminar-workspace";

export type SeminarAccount = { id: string; canonical_email: string };

type SeminarAccess = {
  account: () => Promise<SeminarAccount | Response>;
  reviewer: () => Promise<boolean | Response>;
  primaryEmail: string;
  origin: string;
};

type Seminar = {
  number: number;
  title: string;
  details: string;
  proposal_status: "pending" | "approved" | "rejected";
  recruitment: keyof typeof recruitmentLabels;
  phase: keyof typeof phaseLabels;
  host_id: string | null;
  source_url: string | null;
  created_at: string;
  decided_at: string | null;
  decision_note: string;
};

type Proposal = Seminar & {
  applicant_profile: string;
  operations_note: string;
  email: string;
};

const publicColumns =
  "number,title,details,proposal_status,recruitment,phase,host_id,source_url,created_at,decided_at,decision_note";
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

const parseProfile = (body: Record<string, unknown>) =>
  Object.fromEntries(
    profileFields.map(({ key, limit }) => [key, seminarText(body[key], limit)]),
  );

function publicSeminar(seminar: Seminar) {
  return {
    number: seminar.number,
    title: seminar.title,
    details: JSON.parse(seminar.details) as Record<string, string>,
    recruitment: seminar.recruitment,
    phase: seminar.phase,
    sourceUrl: seminar.source_url,
    acceptingApplications:
      seminar.recruitment === "open" &&
      seminar.phase !== "ended" &&
      !!seminar.host_id,
  };
}

const applicationState = (seminar: Seminar) => ({
  ...publicSeminar(seminar),
  status: seminar.proposal_status,
  createdAt: seminar.created_at,
  decidedAt: seminar.decided_at,
  decisionNote: seminar.decision_note,
});

async function submitProposal(
  db: D1Database,
  account: SeminarAccount,
  request: Request,
  access: SeminarAccess,
) {
  const body = await seminarPayload(request);
  if (!body) return seminarError("入力内容を確認してください。");
  const title = seminarText(body.title, 160);
  const submissionKey = seminarText(body.submissionKey, 36);
  const recruitment = seminarText(body.recruitment, 10);
  const phase = seminarText(body.phase, 10);
  const profile = parseProfile(body);
  const details = Object.fromEntries(
    seminarFields.map(({ key, limit }) => [key, seminarText(body[key], limit)]),
  );
  if (
    !title ||
    !profile.name ||
    !uuid.test(submissionKey) ||
    !Object.hasOwn(recruitmentLabels, recruitment) ||
    !Object.hasOwn(phaseLabels, phase) ||
    phase === "unknown" ||
    (phase === "ended" && recruitment === "open") ||
    seminarFields.some((field) => !("optional" in field) && !details[field.key])
  ) {
    return seminarError("必須項目と募集・実施状況を確認してください。");
  }
  const now = new Date().toISOString();
  const statements = [
    db
      .prepare(
        `INSERT INTO seminars(host_id,title,details,proposal_status,recruitment,phase,applicant_profile,operations_note,submission_key,created_at)
       VALUES (?,?,?,'pending',?,?,?,?,?,?)
       ON CONFLICT(host_id,submission_key) DO NOTHING`,
      )
      .bind(
        account.id,
        title,
        JSON.stringify(details),
        recruitment,
        phase,
        JSON.stringify(profile),
        seminarText(body.operationsNote, 2000),
        submissionKey,
        now,
      ),
    db
      .prepare(
        `INSERT INTO seminar_email_deliveries
        (id,seminar_number,recipient_email,subject,text_body,next_attempt_at,created_at,updated_at)
       SELECT lower(hex(randomblob(16))),s.number,r.email,?,?,?,?,?
         FROM seminars s
         CROSS JOIN (
           SELECT lower(m.email) AS email FROM atlasez_project_memberships m
           JOIN atlasez_projects p ON p.id=m.project_id
           WHERE p.slug IN ('seminar-platform','semi-platform') AND m.role='manager'
             AND NOT EXISTS (SELECT 1 FROM atlasez_project_member_lifecycle l
                             WHERE l.project_id=m.project_id AND lower(l.email)=lower(m.email) AND l.state!='active')
           UNION SELECT ? WHERE ?<>''
         ) r
       WHERE s.host_id=? AND s.submission_key=? AND changes()=1`,
      )
      .bind(
        "ゼミプラットフォーム｜新しい企画申請",
        `新しいゼミ企画の確認をお願いします。\n${access.origin}${SEMINAR_REVIEW_PATH}`,
        now,
        now,
        now,
        access.primaryEmail,
        access.primaryEmail,
        account.id,
        submissionKey,
      ),
  ];
  await db.batch(statements);
  const created = await db
    .prepare("SELECT number FROM seminars WHERE host_id=? AND submission_key=?")
    .bind(account.id, submissionKey)
    .first<{ number: number }>();
  return seminarJson({ number: created?.number }, 201);
}

async function submitApplication(
  db: D1Database,
  seminar: Seminar,
  account: SeminarAccount,
  request: Request,
  origin: string,
) {
  if (
    !publicSeminar(seminar).acceptingApplications ||
    seminar.host_id === account.id
  )
    return seminarError("このゼミは現在参加申請を受け付けていません。", 409);
  const body = await seminarPayload(request);
  if (!body) return seminarError("入力内容を確認してください。");
  const profile = parseProfile(body);
  if (!profile.name) return seminarError("氏名を入力してください。");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const result = await db.batch([
    db
      .prepare(
        `INSERT INTO seminar_applications(id,seminar_number,applicant_id,profile,host_note,operations_note,created_at)
       SELECT ?,number,?,?,?,?,? FROM seminars
       WHERE number=? AND proposal_status='approved' AND recruitment='open' AND phase<>'ended'
         AND host_id IS NOT NULL AND host_id<>?
       ON CONFLICT(seminar_number,applicant_id) WHERE status IN ('pending','approved') DO NOTHING`,
      )
      .bind(
        id,
        account.id,
        JSON.stringify(profile),
        seminarText(body.hostNote, 2000),
        seminarText(body.operationsNote, 2000),
        now,
        seminar.number,
        account.id,
      ),
    db
      .prepare(
        `INSERT INTO seminar_email_deliveries
        (id,seminar_number,recipient_email,subject,text_body,next_attempt_at,created_at,updated_at)
       SELECT ?,s.number,a.canonical_email,?,?,?,?,?
       FROM seminars s JOIN atlasez_accounts a ON a.id=s.host_id
       JOIN seminar_applications r ON r.seminar_number=s.number
       WHERE r.id=?`,
      )
      .bind(
        crypto.randomUUID(),
        "ゼミプラットフォーム｜新しい参加申請",
        `参加申請を確認してください。\n${origin}/seminars/workspace/?number=${seminar.number}#applications`,
        now,
        now,
        now,
        id,
      ),
  ]);
  return result[0].meta?.changes
    ? seminarJson({ id }, 201)
    : seminarError("申請済み、参加中、または募集が停止しています。", 409);
}

async function reviewProposal(
  db: D1Database,
  seminar: Seminar,
  account: SeminarAccount,
  request: Request,
) {
  const body = await seminarPayload(request);
  if (body?.decision !== "approved" && body?.decision !== "rejected")
    return seminarError("承認または見送りを選んでください。");
  const result = await db
    .prepare(
      `UPDATE seminars SET proposal_status=?,decided_at=?,decided_by=?,decision_note=?
     WHERE number=? AND proposal_status='pending'`,
    )
    .bind(
      body.decision,
      new Date().toISOString(),
      account.id,
      seminarText(body.note, 2000),
      seminar.number,
    )
    .run();
  return result.meta?.changes
    ? seminarJson({ ok: true })
    : seminarError("この企画はすでに審査済みです。", 409);
}

async function assignLegacyHost(
  db: D1Database,
  seminar: Seminar,
  request: Request,
) {
  const body = await seminarPayload(request);
  const email = seminarText(body?.email, 254).toLowerCase();
  const host =
    email &&
    (await db
      .prepare("SELECT id FROM atlasez_accounts WHERE canonical_email=?")
      .bind(email)
      .first<{ id: string }>());
  if (!host)
    return seminarError(
      "指定されたアカウントが見つかりません。主催者は先にGoogleでログインしてください。",
    );
  const result = await db
    .prepare(
      "UPDATE seminars SET host_id=? WHERE number=? AND source_url IS NOT NULL AND host_id IS NULL",
    )
    .bind(host.id, seminar.number)
    .run();
  return result.meta?.changes
    ? seminarJson({ ok: true })
    : seminarError("主催者は設定済みです。", 409);
}

async function reviewApplication(
  db: D1Database,
  seminar: Seminar,
  account: SeminarAccount,
  id: string,
  request: Request,
) {
  const body = await seminarPayload(request);
  if (body?.decision !== "approved" && body?.decision !== "rejected")
    return seminarError("承認または見送りを選んでください。");
  const result = await db
    .prepare(
      `UPDATE seminar_applications SET status=?,decided_at=?,decided_by=?,decision_note=?
      WHERE id=? AND seminar_number=? AND status='pending'
        AND EXISTS(SELECT 1 FROM seminars WHERE number=? AND host_id=?
          AND (?='rejected' OR phase<>'ended'))`,
    )
    .bind(
      body.decision,
      new Date().toISOString(),
      account.id,
      seminarText(body.note, 2000),
      id,
      seminar.number,
      seminar.number,
      account.id,
      body.decision,
    )
    .run();
  return result.meta?.changes
    ? seminarJson({ ok: true })
    : seminarError("審査済み、またはゼミが終了しています。", 409);
}

async function seminarDashboard(db: D1Database, account: SeminarAccount) {
  const [memberships, proposals, applications, activities] = await Promise.all([
    db
      .prepare(
        `SELECT number,title,phase,host_id FROM seminars WHERE proposal_status='approved'
       AND (host_id=? OR number IN (SELECT seminar_number FROM seminar_applications WHERE applicant_id=? AND status='approved'))
       ORDER BY number DESC`,
      )
      .bind(account.id, account.id)
      .all<Seminar>(),
    db
      .prepare(
        `SELECT ${publicColumns} FROM seminars WHERE host_id=? AND submission_key IS NOT NULL ORDER BY number DESC`,
      )
      .bind(account.id)
      .all<Seminar>(),
    db
      .prepare(
        `SELECT s.number,s.title,a.status,a.created_at,a.decided_at,a.decision_note
       FROM seminar_applications a JOIN seminars s ON s.number=a.seminar_number
       WHERE a.applicant_id=? ORDER BY a.created_at DESC`,
      )
      .bind(account.id)
      .all(),
    listSeminarActivities(db, account.id),
  ]);
  return seminarJson({
    memberships: memberships.results.map((row) => ({
      number: row.number,
      title: row.title,
      phase: row.phase,
      isHost: row.host_id === account.id,
    })),
    proposals: proposals.results.map(applicationState),
    applications: applications.results,
    activities,
  });
}

async function seminarOperations(db: D1Database) {
  const [proposals, imports, feedback] = await Promise.all([
    db
      .prepare(
        `SELECT s.*,a.canonical_email AS email FROM seminars s
       JOIN atlasez_accounts a ON a.id=s.host_id
       WHERE s.submission_key IS NOT NULL ORDER BY s.proposal_status='pending' DESC,s.number DESC`,
      )
      .all<Proposal>(),
    db
      .prepare(
        "SELECT number,title FROM seminars WHERE source_url IS NOT NULL AND host_id IS NULL ORDER BY number DESC",
      )
      .all(),
    db
      .prepare(
        `SELECT s.number,s.title,r.operations_note,r.created_at,a.canonical_email AS email
       FROM seminar_applications r JOIN seminars s ON s.number=r.seminar_number
       JOIN atlasez_accounts a ON a.id=r.applicant_id
       WHERE r.operations_note<>'' ORDER BY r.created_at DESC`,
      )
      .all(),
  ]);
  return seminarJson({
    proposals: proposals.results.map((row) => ({
      ...applicationState(row),
      profile: JSON.parse(row.applicant_profile) as Record<string, string>,
      email: row.email,
      operationsNote: row.operations_note,
    })),
    imports: imports.results,
    feedback: feedback.results,
  });
}

export async function handleSeminarApi(
  request: Request,
  db: D1Database,
  access: SeminarAccess,
) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.replace(/\/$/, "").slice("/api/seminars".length);
  if (method !== "GET" && request.headers.get("origin") !== url.origin)
    return seminarError("この送信元からは受け付けられません。", 403);

  if (method === "GET" && path === "") {
    const result = await db
      .prepare(
        "SELECT number,title,details,recruitment,phase,host_id,source_url FROM seminars WHERE proposal_status='approved' ORDER BY number DESC",
      )
      .all<Seminar>();
    return seminarJson({ seminars: result.results.map(publicSeminar) });
  }
  const parts = /^\/(\d{1,10})(?:\/(.+))?$/.exec(path);
  const number = parts ? Number(parts[1]) : 0;
  const action = parts?.[2] ?? "";
  const seminar = parts
    ? await db
        .prepare(`SELECT ${publicColumns} FROM seminars WHERE number=?`)
        .bind(number)
        .first<Seminar>()
    : null;
  if (parts && !seminar) return missingSeminar();
  if (method === "GET" && seminar && !action)
    return seminar.proposal_status === "approved"
      ? seminarJson(publicSeminar(seminar))
      : missingSeminar();

  const account = await access.account();
  if (account instanceof Response)
    return path === "/session" && method === "GET" && account.status === 401
      ? seminarJson({ signedIn: false })
      : account;

  if (path === "/session" && method === "GET") {
    const reviewer = await access.reviewer();
    return seminarJson({
      signedIn: true,
      email: account.canonical_email,
      canReview: reviewer === true,
    });
  }
  if (path === "/dashboard" && method === "GET")
    return seminarDashboard(db, account);
  if (path === "/proposals" && method === "POST")
    return submitProposal(db, account, request, access);

  if (
    (path === "/operations" && method === "GET") ||
    (seminar && method === "POST" && ["review", "host"].includes(action))
  ) {
    const reviewer = await access.reviewer();
    if (reviewer instanceof Response) return reviewer;
    if (!reviewer) return seminarError("ゼミの運営権限が必要です。", 403);
    if (!seminar) return seminarOperations(db);
    return action === "host"
      ? assignLegacyHost(db, seminar, request)
      : reviewProposal(db, seminar, account, request);
  }

  if (!seminar || seminar.proposal_status !== "approved")
    return missingSeminar();
  if (action === "join" && method === "POST")
    return submitApplication(db, seminar, account, request, access.origin);

  const isHost = seminar.host_id === account.id;
  const membership =
    isHost ||
    (await db
      .prepare(
        "SELECT 1 FROM seminar_applications WHERE seminar_number=? AND applicant_id=? AND status='approved'",
      )
      .bind(number, account.id)
      .first());
  if (!membership) return missingSeminar();

  const application = /^applications\/([\da-f-]+)$/i.exec(action);
  if (application && uuid.test(application[1]) && method === "POST")
    return isHost
      ? reviewApplication(db, seminar, account, application[1], request)
      : missingSeminar();
  if (action === "settings" && method === "POST" && isHost) {
    const body = await seminarPayload(request);
    const recruitment = seminarText(body?.recruitment, 10);
    const phase = seminarText(body?.phase, 10);
    if (
      !Object.hasOwn(recruitmentLabels, recruitment) ||
      !Object.hasOwn(phaseLabels, phase) ||
      phase === "unknown" ||
      (phase === "ended" && recruitment === "open")
    )
      return seminarError("募集・実施状況を確認してください。");
    await db
      .prepare(
        "UPDATE seminars SET recruitment=?,phase=? WHERE number=? AND host_id=?",
      )
      .bind(recruitment, phase, number, account.id)
      .run();
    return seminarJson({ ok: true });
  }
  return handleSeminarWorkspace({
    db,
    request,
    action,
    account,
    isHost,
    seminar: publicSeminar(seminar),
    maxFileBytes: maxSeminarFileBytes,
  });
}
