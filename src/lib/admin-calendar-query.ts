type CalendarRange = { start: string; end: string };
type EventCursor = { startsAt: string; id: string };

/** Each calendar page is bounded, while its cursor remains independent of task pages. */
export function readCalendarQuery(params: URLSearchParams, member = false) {
  let range: CalendarRange | null = null;
  if (params.has("start") || params.has("end")) {
    const start = params.get("start") ?? "";
    const end = params.get("end") ?? "";
    const instant = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/;
    const startEpoch = Date.parse(start),
      endEpoch = Date.parse(end);
    if (
      !instant.test(start) ||
      !instant.test(end) ||
      !Number.isFinite(startEpoch) ||
      !Number.isFinite(endEpoch) ||
      endEpoch <= startEpoch ||
      endEpoch - startEpoch > 93 * 86400000
    )
      return { error: "カレンダーの表示期間を確認してください。" } as const;
    range = {
      start: new Date(startEpoch).toISOString(),
      end: new Date(endEpoch).toISOString(),
    };
  }
  const requested = Number(
    params.get("eventLimit") ?? (member ? params.get("limit") : null) ?? "50",
  );
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), 100)
    : 50;
  let cursor: EventCursor | null = null;
  const raw =
    params.get("eventCursor") ?? (member ? params.get("cursor") : null);
  if (raw) {
    try {
      if (raw.length > 2048) throw new Error("cursor too long");
      const value = JSON.parse(decodeURIComponent(raw)) as Partial<EventCursor>;
      if (
        typeof value.startsAt !== "string" ||
        !Number.isFinite(Date.parse(value.startsAt)) ||
        typeof value.id !== "string" ||
        !value.id ||
        value.id.length > 100
      )
        throw new Error("invalid cursor");
      cursor = { startsAt: value.startsAt, id: value.id };
    } catch {
      return { error: "予定のカーソルを確認してください。" } as const;
    }
  }
  return { range, cursor, limit };
}

export function calendarEventWhere(
  range: CalendarRange | null,
  cursor: EventCursor | null,
  alias = "",
) {
  const column = (name: string) => `${alias}${name}`;
  const clauses: string[] = [],
    values: unknown[] = [];
  if (range) {
    // A zero-duration event belongs to its start day; a longer event overlaps every day it spans.
    clauses.push(
      `julianday(${column("starts_at")}) < julianday(?) AND (julianday(${column("ends_at")}) > julianday(?) OR ((${column("ends_at")} IS NULL OR julianday(${column("ends_at")}) <= julianday(${column("starts_at")})) AND julianday(${column("starts_at")}) >= julianday(?)))`,
    );
    values.push(range.end, range.start, range.start);
  }
  if (cursor) {
    clauses.push(
      `(${column("starts_at")} > ? OR (${column("starts_at")} = ? AND ${column("id")} > ?))`,
    );
    values.push(cursor.startsAt, cursor.startsAt, cursor.id);
  }
  return {
    sql: clauses.length
      ? ` AND ${clauses.map((value) => `(${value})`).join(" AND ")}`
      : "",
    values,
  };
}

export function calendarEventPage<T extends Record<string, unknown>>(
  rows: T[],
  limit: number,
) {
  const events = rows.slice(0, limit),
    last = events.at(-1),
    hasMore = rows.length > limit;
  return {
    events,
    pagination: {
      limit,
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeURIComponent(
              JSON.stringify({
                startsAt: String(last.starts_at),
                id: String(last.id),
              }),
            )
          : null,
    },
  };
}
