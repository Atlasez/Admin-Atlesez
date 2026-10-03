import { Temporal } from "@js-temporal/polyfill";
import { localDateTimeToEpoch } from "./date-time";

/** Legacy ISO instants and current local deadlines have different storage contracts. */
export function taskDeadlineEpoch(value: string, timezone = "Asia/Tokyo") {
  try {
    if (/Z$|[+-]\d{2}:\d{2}$/.test(value))
      return Number(Temporal.Instant.from(value).epochMilliseconds);
    return localDateTimeToEpoch(value, timezone || "Asia/Tokyo");
  } catch {
    return NaN;
  }
}

/** The portal's calendar also reads local deadlines against an instant range. */
export function deadlineRangeSql(timezones: string[], start: Date, end: Date) {
  const first = Temporal.Instant.from(start.toISOString());
  const last = Temporal.Instant.from(end.toISOString());
  const bounds = [...new Set([...timezones, "Asia/Tokyo"])].flatMap(
    (timezone) => {
      try {
        const local = (value: Temporal.Instant) =>
          value
            .toZonedDateTimeISO(timezone)
            .toPlainDateTime()
            .toString({ smallestUnit: "millisecond" });
        return [{ timezone, start: local(first), end: local(last) }];
      } catch {
        return [];
      }
    },
  );
  return {
    sql: `(CASE WHEN (t.due_at GLOB '*Z' OR t.due_at GLOB '*[+-][0-9][0-9]:[0-9][0-9]') THEN julianday(t.due_at) >= julianday(?) AND julianday(t.due_at) <= julianday(?) ELSE EXISTS(SELECT 1 FROM json_each(?) bounds WHERE json_extract(bounds.value,'$.timezone')=COALESCE(NULLIF(t.due_timezone,''),'Asia/Tokyo') AND julianday(t.due_at) >= julianday(json_extract(bounds.value,'$.start')) AND julianday(t.due_at) <= julianday(json_extract(bounds.value,'$.end'))) END)`,
    values: [start.toISOString(), end.toISOString(), JSON.stringify(bounds)],
  };
}

/** Convert a handful of distinct zones into SQL bounds instead of loading every task. */
export function deadlineSummarySql(
  timezones: string[],
  viewerTimezone = "Asia/Tokyo",
  now = new Date(),
) {
  const instant = Temporal.Instant.from(now.toISOString());
  let today: Temporal.ZonedDateTime;
  try {
    today = instant.toZonedDateTimeISO(viewerTimezone).startOfDay();
  } catch {
    today = instant.toZonedDateTimeISO("Asia/Tokyo").startOfDay();
  }
  const tomorrow = today.add({ days: 1 }).toInstant();
  const weekEnd = instant.add({ hours: 7 * 24 });
  const bounds = [...new Set([...timezones, "Asia/Tokyo"])].flatMap(
    (timezone) => {
      try {
        const local = (value: Temporal.Instant) =>
          value
            .toZonedDateTimeISO(timezone)
            .toPlainDateTime()
            .toString({ smallestUnit: "second" });
        return [
          { timezone, tomorrow: local(tomorrow), weekEnd: local(weekEnd) },
        ];
      } catch {
        return [];
      }
    },
  );
  const localCondition = (dueSoon: boolean) =>
    `EXISTS(SELECT 1 FROM json_each(?) bounds WHERE json_extract(bounds.value,'$.timezone')=COALESCE(NULLIF(t.due_timezone,''),'Asia/Tokyo') AND julianday(t.due_at) ${dueSoon ? ">=" : "<"} julianday(json_extract(bounds.value,'$.tomorrow'))${dueSoon ? " AND julianday(t.due_at) <= julianday(json_extract(bounds.value,'$.weekEnd'))" : ""})`;
  const instantCondition = (dueSoon: boolean) =>
    `julianday(t.due_at) ${dueSoon ? ">=" : "<"} julianday(?)${dueSoon ? " AND julianday(t.due_at) <= julianday(?)" : ""}`;
  const storedInstant = `(t.due_at GLOB '*Z' OR t.due_at GLOB '*[+-][0-9][0-9]:[0-9][0-9]')`;
  const expression = (dueSoon: boolean) =>
    `(CASE WHEN ${storedInstant} THEN (${instantCondition(dueSoon)}) ELSE (${localCondition(dueSoon)}) END)`;
  const values = (dueSoon: boolean) => [
    tomorrow.toString(),
    ...(dueSoon ? [weekEnd.toString()] : []),
    JSON.stringify(bounds),
  ];
  return {
    today: expression(false),
    soon: expression(true),
    values: [...values(false), ...values(true)],
  };
}
