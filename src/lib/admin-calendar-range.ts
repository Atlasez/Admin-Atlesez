import { Temporal } from "@js-temporal/polyfill";

/** UTC bounds for a displayed Gregorian month, including DST changes. */
export function adminCalendarMonthRange(
  year: number,
  month: number,
  timezone: string,
) {
  const first = Temporal.PlainDate.from({ year, month: month + 1, day: 1 });
  return {
    start: first.toZonedDateTime(timezone).toInstant().toString(),
    end: first
      .add({ months: 1 })
      .toZonedDateTime(timezone)
      .toInstant()
      .toString(),
  };
}
