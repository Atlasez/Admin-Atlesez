import { Temporal } from "@js-temporal/polyfill";
import type { D1Database } from "./admin-database";

export type InsightsScope = {
  projectId: string;
  email: string;
  subjects: string[];
  allSubjects: boolean;
};

export async function readOperationsInsights(
  db: D1Database,
  scope: InsightsScope,
  now: Date,
) {
  const { projectId, email, subjects, allSubjects } = scope;
  const subjectSql = subjects.length
    ? `subject IN (${subjects.map(() => "?").join(",")})`
    : "0=1";
  const taskWhere = `project_id=? AND archived_at IS NULL${allSubjects ? "" : ` AND (lower(created_by)=lower(?) OR instr(',' || lower(COALESCE(assignee_email,'')) || ',', ',' || lower(?) || ',')>0 OR (task_kind='feedback' AND assignee_email='*') OR subject IS NULL OR ${subjectSql})`}`;
  const taskValues = allSubjects
    ? [projectId]
    : [projectId, email, email, ...subjects];
  const zones = await db
    .prepare(
      `SELECT DISTINCT COALESCE(NULLIF(due_timezone,''),'Asia/Tokyo') AS timezone FROM editorial_tasks WHERE ${taskWhere}`,
    )
    .bind(...taskValues)
    .all<{ timezone: string }>();
  const bounds = zones.results.flatMap(({ timezone }) => {
    try {
      return [
        {
          timezone,
          now: Temporal.Instant.from(now.toISOString())
            .toZonedDateTimeISO(timezone)
            .toPlainDateTime()
            .toString({ smallestUnit: "second" }),
        },
      ];
    } catch {
      return [];
    }
  });
  const classified = `WITH visible AS (SELECT *, CASE WHEN status<>'done' AND EXISTS (SELECT 1 FROM json_each(?) b WHERE json_extract(b.value,'$.timezone')=COALESCE(NULLIF(due_timezone,''),'Asia/Tokyo') AND julianday(due_at)<julianday(json_extract(b.value,'$.now'))) THEN 1 ELSE 0 END AS overdue FROM editorial_tasks WHERE ${taskWhere})`;
  const values = [JSON.stringify(bounds), ...taskValues];
  const otherSubjectWhere = allSubjects
    ? ""
    : ` AND (subject IS NULL OR ${subjectSql})`;
  const documentWhere = `archived_at IS NULL AND status='in-review' AND publication_review_stage IS NOT NULL${allSubjects ? "" : ` AND (${subjectSql})`}`;
  const [tasks, workload, events, reports, approval, waiting] =
    await Promise.all([
      db
        .prepare(
          `${classified} SELECT COUNT(*) AS total, COALESCE(SUM(status<>'done'),0) AS unfinished, COALESCE(SUM(overdue),0) AS overdue, MAX(updated_at) AS lastUpdatedAt FROM visible`,
        )
        .bind(...values)
        .first<{
          total: number;
          unfinished: number;
          overdue: number;
          lastUpdatedAt: string | null;
        }>(),
      db
        .prepare(
          `${classified}, split(id,status,overdue,email,rest) AS (
      SELECT id,status,overdue,'',COALESCE(assignee_email,'')||',' FROM visible WHERE status<>'done'
      UNION ALL SELECT id,status,overdue,lower(trim(substr(rest,1,instr(rest,',')-1))),substr(rest,instr(rest,',')+1) FROM split WHERE rest<>''
    ), unique_assignees AS (SELECT DISTINCT id,status,overdue,email FROM split WHERE rest<>'' OR email<>'' OR (email='' AND id IN (SELECT id FROM visible WHERE assignee_email IS NULL OR trim(assignee_email)='')))
    SELECT CASE WHEN a.email='' THEN '未担当' WHEN a.email='*' THEN '分野担当者全員' ELSE COALESCE(NULLIF(trim(p.display_name),''),'表示名未設定') END AS name, COUNT(DISTINCT a.id) AS unfinished, COUNT(DISTINCT CASE WHEN a.status='doing' THEN a.id END) AS doing, COUNT(DISTINCT CASE WHEN a.overdue=1 THEN a.id END) AS overdue
    FROM unique_assignees a LEFT JOIN editorial_member_profiles p ON lower(p.email)=a.email
    WHERE a.email<>'' OR a.id IN (SELECT id FROM visible WHERE assignee_email IS NULL OR trim(assignee_email)='') GROUP BY a.email ORDER BY unfinished DESC,name LIMIT 100`,
        )
        .bind(...values)
        .all<{
          name: string;
          unfinished: number;
          doing: number;
          overdue: number;
        }>(),
      db
        .prepare(
          `SELECT COUNT(*) AS total FROM editorial_events WHERE project_id=?${otherSubjectWhere}`,
        )
        .bind(projectId, ...(allSubjects ? [] : subjects))
        .first<{ total: number }>(),
      db
        .prepare(
          `SELECT COUNT(*) AS total FROM editorial_progress_reports WHERE project_id=?${allSubjects ? "" : " AND lower(email)=lower(?)"}`,
        )
        .bind(projectId, ...(allSubjects ? [] : [email]))
        .first<{ total: number }>(),
      projectId === "atlas"
        ? db
            .prepare(
              `SELECT COUNT(*) AS total, SUM(publication_review_started_at IS NULL) AS unknownStart, MAX(MAX(0,julianday(?)-julianday(publication_review_started_at))) AS oldestDays FROM editorial_documents WHERE ${documentWhere}`,
            )
            .bind(now.toISOString(), ...(allSubjects ? [] : subjects))
            .first<{
              total: number;
              unknownStart: number;
              oldestDays: number | null;
            }>()
        : Promise.resolve(null),
      projectId === "atlas"
        ? db
            .prepare(
              `SELECT id,title,publication_review_stage AS stage,publication_review_started_at AS startedAt FROM editorial_documents WHERE ${documentWhere} ORDER BY publication_review_started_at IS NULL,publication_review_started_at,id LIMIT 10`,
            )
            .bind(...(allSubjects ? [] : subjects))
            .all<{
              id: string;
              title: string;
              stage: string;
              startedAt: string | null;
            }>()
        : Promise.resolve({ results: [] }),
    ]);
  return {
    generatedAt: now.toISOString(),
    tasks: tasks ?? {
      total: 0,
      unfinished: 0,
      overdue: 0,
      lastUpdatedAt: null,
    },
    workload: workload.results,
    workloadLimit: 100,
    events: events?.total ?? 0,
    reports: reports?.total ?? 0,
    approval: approval ?? { total: 0, unknownStart: 0, oldestDays: null },
    waiting: waiting.results,
  };
}
