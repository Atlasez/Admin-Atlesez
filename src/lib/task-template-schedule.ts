import { Temporal } from "@js-temporal/polyfill";
export type Schedule = "none" | "daily" | "weekly" | "monthly";
export function scheduleInstant(value: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("開始日時をカレンダーから指定してください。");
  return Temporal.PlainDateTime.from(value)
    .toZonedDateTime(timezone, { disambiguation: "reject" })
    .toInstant()
    .toString({ smallestUnit: "millisecond" });
}
/** Each occurrence is calculated from the original anchor, keeping Jan 31 -> Feb 28 -> Mar 31. */
export function nextTemplateOccurrence(
  anchor: string,
  timezone: string,
  schedule: Exclude<Schedule, "none">,
  after: string,
) {
  const start = Temporal.PlainDateTime.from(anchor);
  const instant = Temporal.Instant.from(after);
  const local = instant.toZonedDateTimeISO(timezone).toPlainDateTime();
  const days = local
    .toPlainDate()
    .since(start.toPlainDate(), { largestUnit: "day" }).days;
  let step = Math.max(
    0,
    schedule === "monthly"
      ? (local.year - start.year) * 12 + local.month - start.month
      : schedule === "weekly"
        ? Math.floor(days / 7)
        : days,
  );
  for (let attempt = 0; attempt < 8; attempt++, step++) {
    const candidate = start.add(
      schedule === "monthly"
        ? { months: step }
        : schedule === "weekly"
          ? { weeks: step }
          : { days: step },
      { overflow: "constrain" },
    );
    try {
      const next = candidate
        .toZonedDateTime(timezone, { disambiguation: "reject" })
        .toInstant();
      if (Temporal.Instant.compare(next, instant) > 0)
        return next.toString({ smallestUnit: "millisecond" });
    } catch {
      /* DST gap/overlap: skip the ambiguous occurrence. */
    }
  }
  throw new Error("次回の作成日時を算出できませんでした。");
}
export function templateDeadline(
  occurrence: string,
  timezone: string,
  days: number,
) {
  return Temporal.Instant.from(occurrence)
    .toZonedDateTimeISO(timezone)
    .add({ days })
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}
