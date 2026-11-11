import type { D1Database } from "./admin-database";
import type { SeminarAccount } from "./seminar-api";
import {
  seminarBody,
  seminarError,
  seminarJson,
  seminarPayload,
  seminarText,
  missingSeminar,
} from "./seminar-http";

type Activity = {
  id: string;
  number: number;
  seminar_title: string;
  phase: string;
  kind: "event" | "task" | "poll" | "notice";
  title: string;
  description: string;
  due_at: string | null;
  completed_at: string | null;
  options: string;
  choice: number | null;
  assignee: string | null;
  canComplete: number;
  counts: string;
};

export async function listSeminarActivities(
  db: D1Database,
  accountId: string,
  number?: number,
) {
  const result = await db
    .prepare(
      `SELECT a.id,s.number,s.title AS seminar_title,s.phase,a.kind,a.title,a.description,a.due_at,
       a.completed_at,a.options,answer.choice,
       (SELECT json_extract(profile,'$.name') FROM seminar_applications
         WHERE seminar_number=s.number AND applicant_id=a.assignee_id AND status='approved') AS assignee,
       (s.host_id=? OR a.assignee_id=?) AS canComplete,
       CASE WHEN a.kind='poll' THEN (SELECT json_group_object(choice,amount) FROM
         (SELECT choice,count(*) AS amount FROM seminar_poll_answers WHERE activity_id=a.id GROUP BY choice))
         ELSE '{}' END AS counts
     FROM seminar_activities a JOIN seminars s ON s.number=a.seminar_number
     LEFT JOIN seminar_poll_answers answer ON answer.activity_id=a.id AND answer.account_id=?
     WHERE s.proposal_status='approved' AND (? IS NULL OR s.number=?)
       AND (s.host_id=? OR s.number IN (
         SELECT seminar_number FROM seminar_applications WHERE applicant_id=? AND status='approved'
       ))
       AND (? IS NOT NULL OR a.kind<>'task' OR a.assignee_id IS NULL OR a.assignee_id=? OR s.host_id=?)
     ORDER BY COALESCE(a.due_at,a.created_at) DESC`,
    )
    .bind(
      accountId,
      accountId,
      accountId,
      number ?? null,
      number ?? null,
      accountId,
      accountId,
      number ?? null,
      accountId,
      accountId,
    )
    .all<Activity>();
  return result.results.map((row) => ({
    ...row,
    options: JSON.parse(row.options) as string[],
    counts: JSON.parse(row.counts) as Record<string, number>,
  }));
}

type Context = {
  db: D1Database;
  request: Request;
  action: string;
  account: SeminarAccount;
  isHost: boolean;
  seminar: { number: number; title: string; phase: string };
  maxFileBytes: number;
};

async function getWorkspace({ db, seminar, account, isHost }: Context) {
  const [activities, materials, applications] = await Promise.all([
    listSeminarActivities(db, account.id, seminar.number),
    db
      .prepare(
        `SELECT id,filename,bytes,created_at,(uploader_id=? OR ?) AS canManage
       FROM seminar_materials WHERE seminar_number=? ORDER BY created_at DESC`,
      )
      .bind(account.id, Number(isHost), seminar.number)
      .all(),
    isHost
      ? db
          .prepare(
            `SELECT a.id,a.applicant_id,a.profile,a.host_note,a.status,a.created_at,u.canonical_email AS email
           FROM seminar_applications a JOIN atlasez_accounts u ON u.id=a.applicant_id
           WHERE a.seminar_number=? ORDER BY a.status='pending' DESC,a.created_at DESC`,
          )
          .bind(seminar.number)
          .all<{
            id: string;
            applicant_id: string;
            profile: string;
            host_note: string;
            status: string;
            created_at: string;
            email: string;
          }>()
      : { results: [] },
  ]);
  return seminarJson({
    seminar,
    isHost,
    activities,
    materials: materials.results,
    applications: applications.results.map((row) => ({
      ...row,
      profile: JSON.parse(row.profile) as Record<string, string>,
    })),
  });
}

async function createActivity({ db, seminar, request, isHost }: Context) {
  if (!isHost || seminar.phase === "ended") return missingSeminar();
  const body = await seminarPayload(request);
  const kind = seminarText(body?.kind, 12);
  const title = seminarText(body?.title, 160);
  const when = seminarText(body?.dueAt, 40);
  const date = /^\d{4}-\d\d-\d\dT\d\d:\d\d\+09:00$/.test(when)
    ? new Date(when)
    : null;
  if (
    !title ||
    !["event", "task", "poll", "notice"].includes(kind) ||
    ((kind === "event" || when) && (!date || !Number.isFinite(date.getTime())))
  )
    return seminarError("タイトルと日時を確認してください。");

  const assignee = kind === "task" ? seminarText(body?.assignee, 64) : "";
  if (
    assignee &&
    !(await db
      .prepare(
        "SELECT 1 FROM seminar_applications WHERE seminar_number=? AND applicant_id=? AND status='approved'",
      )
      .bind(seminar.number, assignee)
      .first())
  )
    return seminarError("参加者を選んでください。");
  const options =
    kind === "poll"
      ? [
          ...new Set(
            seminarText(body?.options, 2000)
              .split("\n")
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        ]
      : [];
  if (
    kind === "poll" &&
    (options.length < 2 ||
      options.length > 12 ||
      options.some((option) => option.length > 160))
  )
    return seminarError("日程候補を2〜12件、1行に1件ずつ入力してください。");

  const result = await db
    .prepare(
      `INSERT INTO seminar_activities(id,seminar_number,kind,title,description,due_at,assignee_id,options,created_at)
     SELECT ?,number,?,?,?,?,?,?,? FROM seminars WHERE number=? AND phase<>'ended'`,
    )
    .bind(
      crypto.randomUUID(),
      kind,
      title,
      seminarText(body?.description, 3000),
      date?.toISOString() ?? null,
      assignee || null,
      JSON.stringify(options),
      new Date().toISOString(),
      seminar.number,
    )
    .run();
  return result.meta?.changes
    ? seminarJson({ ok: true }, 201)
    : seminarError("このゼミは終了しています。", 409);
}

async function updateActivity(
  { db, seminar, account, request, isHost }: Context,
  id: string,
) {
  if (seminar.phase === "ended")
    return seminarError("このゼミは終了しています。", 409);
  const body = await seminarPayload(request);
  const now = new Date().toISOString();
  if (body?.complete === true) {
    const result = await db
      .prepare(
        `UPDATE seminar_activities SET completed_at=? WHERE id=? AND seminar_number=? AND completed_at IS NULL
       AND (kind='task' AND (assignee_id=? OR ?) OR kind='poll' AND ?)
       AND EXISTS(SELECT 1 FROM seminars WHERE number=? AND phase<>'ended')`,
      )
      .bind(
        now,
        id,
        seminar.number,
        account.id,
        Number(isHost),
        Number(isHost),
        seminar.number,
      )
      .run();
    return result.meta?.changes
      ? seminarJson({ ok: true })
      : seminarError("この項目は更新できません。", 409);
  }
  const choice = body?.choice;
  if (
    typeof choice !== "number" ||
    !Number.isInteger(choice) ||
    choice < 0 ||
    choice > 11
  )
    return seminarError("日程候補を選んでください。");
  const result = await db
    .prepare(
      `INSERT INTO seminar_poll_answers(activity_id,account_id,choice)
     SELECT a.id,?,? FROM seminar_activities a JOIN seminars s ON s.number=a.seminar_number
     WHERE a.id=? AND a.seminar_number=? AND a.kind='poll' AND a.completed_at IS NULL AND s.phase<>'ended'
       AND (a.due_at IS NULL OR a.due_at>?) AND json_array_length(a.options)>?
     ON CONFLICT(activity_id,account_id) DO UPDATE SET choice=excluded.choice`,
    )
    .bind(account.id, choice, id, seminar.number, now, choice)
    .run();
  return result.meta?.changes
    ? seminarJson({ ok: true })
    : seminarError("この日程調整は回答を受け付けていません。", 409);
}

const cleanFilename = (value: unknown) =>
  seminarText(value, 160)
    .toWellFormed()
    .replace(/[\x00-\x1F\x7F/\\]/g, "_");

async function uploadMaterial({
  db,
  seminar,
  request,
  account,
  maxFileBytes,
}: Context) {
  if (seminar.phase === "ended")
    return seminarError("このゼミは終了しています。", 409);
  if (request.headers.get("content-type") !== "application/octet-stream")
    return seminarError("ファイルを選んでください。");
  let filename: string;
  try {
    filename = cleanFilename(
      decodeURIComponent(request.headers.get("x-seminar-filename") ?? ""),
    );
  } catch {
    return seminarError("ファイル名を確認してください。");
  }
  const bytes = await seminarBody(request, maxFileBytes);
  if (!filename || !bytes?.byteLength)
    return seminarError("1 MB以下のファイルを選んでください。", 413);
  const result = await db
    .prepare(
      `INSERT INTO seminar_materials(id,seminar_number,uploader_id,filename,bytes,data,created_at)
     SELECT ?,number,?,?,?,?,? FROM seminars WHERE number=? AND phase<>'ended'
       AND ? + COALESCE((SELECT sum(bytes) FROM seminar_materials WHERE seminar_number=?),0) <= 25000000
       AND (SELECT count(*) FROM seminar_materials WHERE seminar_number=?) < 200`,
    )
    .bind(
      crypto.randomUUID(),
      account.id,
      filename,
      bytes.byteLength,
      bytes.buffer,
      new Date().toISOString(),
      seminar.number,
      bytes.byteLength,
      seminar.number,
      seminar.number,
    )
    .run();
  return result.meta?.changes
    ? seminarJson({ ok: true }, 201)
    : seminarError(
        "資料の保存上限（25 MB・200件）に達したか、ゼミが終了しています。",
        409,
      );
}

async function materialAction(
  { db, seminar, request, account, isHost }: Context,
  id: string,
) {
  if (request.method === "GET") {
    const file = await db
      .prepare(
        "SELECT filename,data FROM seminar_materials WHERE id=? AND seminar_number=?",
      )
      .bind(id, seminar.number)
      .first<{ filename: string; data: ArrayBuffer | number[] | Uint8Array }>();
    if (!file) return missingSeminar();
    const bytes =
      ArrayBuffer.isView(file.data) || Array.isArray(file.data)
        ? Uint8Array.from(file.data).buffer
        : file.data;
    const encodedName = encodeURIComponent(file.filename).replace(
      /['()*]/g,
      (value) => `%${value.charCodeAt(0).toString(16)}`,
    );
    return new Response(bytes, {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename*=UTF-8''${encodedName}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }
  const bind = [id, seminar.number, account.id, Number(isHost)] as const;
  const guard = "WHERE id=? AND seminar_number=? AND (uploader_id=? OR ?)";
  if (request.method === "DELETE") {
    const result = await db
      .prepare(`DELETE FROM seminar_materials ${guard}`)
      .bind(...bind)
      .run();
    return result.meta?.changes ? seminarJson({ ok: true }) : missingSeminar();
  }
  if (request.method === "PATCH") {
    const filename = cleanFilename((await seminarPayload(request))?.filename);
    if (!filename) return seminarError("ファイル名を入力してください。");
    const result = await db
      .prepare(`UPDATE seminar_materials SET filename=? ${guard}`)
      .bind(filename, ...bind)
      .run();
    return result.meta?.changes ? seminarJson({ ok: true }) : missingSeminar();
  }
  return missingSeminar();
}

export function handleSeminarWorkspace(context: Context) {
  const { request, action } = context;
  if (action === "workspace" && request.method === "GET")
    return getWorkspace(context);
  if (action === "activities" && request.method === "POST")
    return createActivity(context);
  if (action === "materials" && request.method === "POST")
    return uploadMaterial(context);
  const activity = /^activities\/([\da-f-]{36})$/i.exec(action);
  if (activity && request.method === "POST")
    return updateActivity(context, activity[1]);
  const material = /^materials\/([\da-f-]{36})$/i.exec(action);
  return material ? materialAction(context, material[1]) : missingSeminar();
}
