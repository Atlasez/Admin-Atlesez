import { Temporal } from "@js-temporal/polyfill";

export type ReminderRepeat = "daily" | "weekly" | "monthly";

export const isValidTimeZone = (value: string) => {
  try {
    Temporal.Now.instant().toZonedDateTimeISO(value);
    return true;
  } catch {
    return false;
  }
};

const minutePrecision = (value: Temporal.PlainDateTime) =>
  value.toString({ smallestUnit: "minute" });

export function localDateTimeToInstant(value: string, timezone: string) {
  if (!value) return "";
  return Temporal.PlainDateTime.from(value)
    .toZonedDateTime(timezone, { disambiguation: "reject" })
    .toInstant()
    .toString();
}

export function localDateTimeToEpoch(value: string, timezone: string) {
  return Number(
    Temporal.Instant.from(localDateTimeToInstant(value, timezone))
      .epochMilliseconds,
  );
}

export function reminderBeforeDue(
  dueAt: string,
  timezone: string,
  amount: number,
  unit: "days" | "hours",
) {
  const due = Temporal.PlainDateTime.from(dueAt).toZonedDateTime(timezone, {
    disambiguation: "reject",
  });
  const reminder =
    unit === "days"
      ? due.subtract({ days: amount })
      : due
          .toInstant()
          .subtract({ hours: amount })
          .toZonedDateTimeISO(timezone);
  return minutePrecision(reminder.toPlainDateTime());
}

export function nextRepeatedLocalDateTime(
  value: string,
  repeat: ReminderRepeat,
  timezone: string,
  afterEpoch = Date.now(),
) {
  let next = Temporal.PlainDateTime.from(value);
  for (let occurrence = 0; occurrence < 10_000; occurrence += 1) {
    next = next.add(
      repeat === "daily"
        ? { days: 1 }
        : repeat === "weekly"
          ? { weeks: 1 }
          : { months: 1 },
      { overflow: "constrain" },
    );
    const epoch = localDateTimeToEpoch(minutePrecision(next), timezone);
    if (epoch > afterEpoch) return minutePrecision(next);
  }
  return null;
}
