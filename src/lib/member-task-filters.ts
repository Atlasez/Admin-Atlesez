import { Temporal } from "@js-temporal/polyfill";

type Project = { id: string; name: string };

/** Extra filters are applied after the permission predicate, before LIMIT. */
export function memberTaskFilters(
  params: URLSearchParams,
  email: string,
  projects: Project[],
  timezones: string[],
  now = new Date(),
) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, ...bindings: unknown[]) => {
    conditions.push(sql);
    values.push(...bindings);
  };
  if (params.has("project")) {
    const allowed = new Set(projects.map((project) => project.id));
    const selected = [...new Set(params.getAll("project"))].filter((id) =>
      allowed.has(id),
    );
    add(
      selected.length
        ? `project_id IN (${selected.map(() => "?").join(",")})`
        : "0=1",
      ...selected,
    );
  }
  const query = (params.get("q") ?? "").trim().slice(0, 200).toLowerCase();
  if (query) {
    const matchingProjects = projects
      .filter((project) => project.name.toLowerCase().includes(query))
      .map((project) => project.id);
    add(
      `(instr(lower(title), ?) > 0 OR instr(lower(COALESCE(details,'')), ?) > 0${matchingProjects.length ? ` OR project_id IN (${matchingProjects.map(() => "?").join(",")})` : ""})`,
      query,
      query,
      ...matchingProjects,
    );
  }
  const status = params.get("status");
  if (status && ["open", "doing", "done"].includes(status))
    add("status=?", status);
  if (status === "unfinished") add("status<>'done'");
  if (params.get("view") === "created")
    add("lower(created_by)=lower(?)", email);
  if (params.get("view") === "assigned")
    add(
      "(lower(assignee_email)=lower(?) OR instr(',' || lower(COALESCE(assignee_email,'')) || ',', ',' || lower(?) || ',') > 0 OR (task_kind='feedback' AND assignee_email='*'))",
      email,
      email,
    );
  const focus = params.get("focus");
  if (focus) add("id=?", focus.slice(0, 100));
  const due = params.get("due");
  if (due === "none") add("(due_at IS NULL OR due_at='')");
  if (due && ["overdue", "today", "week"].includes(due)) {
    const instant = Temporal.Instant.from(now.toISOString());
    let viewerToday: Temporal.ZonedDateTime;
    try {
      viewerToday = instant
        .toZonedDateTimeISO(params.get("timezone") || "Asia/Tokyo")
        .startOfDay();
    } catch {
      viewerToday = instant.toZonedDateTimeISO("Asia/Tokyo").startOfDay();
    }
    const end = viewerToday.add({ days: due === "week" ? 7 : 1 }).toInstant();
    const bounds = [...new Set([...timezones, "Asia/Tokyo"])].flatMap(
      (timezone) => {
        try {
          const local = (value: Temporal.Instant) =>
            value
              .toZonedDateTimeISO(timezone)
              .toPlainDateTime()
              .toString({ smallestUnit: "second" });
          return [
            {
              timezone,
              start: local(viewerToday.toInstant()),
              end: local(end),
              now: local(instant),
            },
          ];
        } catch {
          return [];
        }
      },
    );
    add(
      `(due_at IS NOT NULL AND due_at<>'' AND EXISTS (SELECT 1 FROM json_each(?) AS bounds WHERE json_extract(bounds.value,'$.timezone')=COALESCE(NULLIF(due_timezone,''),'Asia/Tokyo') AND ${due === "overdue" ? "julianday(due_at) < julianday(json_extract(bounds.value,'$.now')) AND status<>'done'" : "julianday(due_at) >= julianday(json_extract(bounds.value,'$.start')) AND julianday(due_at) < julianday(json_extract(bounds.value,'$.end'))"}))`,
      JSON.stringify(bounds),
    );
  }
  return {
    sql: conditions.length
      ? ` AND ${conditions.map((condition) => `(${condition})`).join(" AND ")}`
      : "",
    values,
  };
}
