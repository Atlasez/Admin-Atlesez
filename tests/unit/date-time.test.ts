import { describe, expect, it } from "vitest";
import {
  localDateTimeToEpoch,
  localDateTimeToInstant,
  nextRepeatedLocalDateTime,
  reminderBeforeDue,
} from "../../src/lib/date-time";

describe("task reminder date-time", () => {
  it("converts UTC and JST wall time to absolute instants", () => {
    expect(localDateTimeToInstant("2026-01-15T09:00", "UTC")).toBe(
      "2026-01-15T09:00:00Z",
    );
    expect(localDateTimeToInstant("2026-01-15T09:00", "Asia/Tokyo")).toBe(
      "2026-01-15T00:00:00Z",
    );
    expect(localDateTimeToEpoch("2026-01-15T09:00", "Asia/Tokyo")).toBe(
      Date.parse("2026-01-15T00:00:00Z"),
    );
  });

  it("rejects nonexistent and ambiguous DST wall times", () => {
    expect(() =>
      localDateTimeToInstant("2026-03-08T02:30", "America/New_York"),
    ).toThrow();
    expect(() =>
      localDateTimeToInstant("2026-11-01T01:30", "America/New_York"),
    ).toThrow();
  });

  it("keeps repeated reminders on the requested local wall clock", () => {
    expect(
      nextRepeatedLocalDateTime(
        "2026-03-07T09:00",
        "daily",
        "America/New_York",
        Date.parse("2026-03-07T14:00:00Z"),
      ),
    ).toBe("2026-03-08T09:00");
    expect(
      nextRepeatedLocalDateTime(
        "2026-01-31T09:00",
        "monthly",
        "Asia/Tokyo",
        Date.parse("2026-02-01T00:00:00Z"),
      ),
    ).toBe("2026-02-28T09:00");
  });

  it("uses calendar days and elapsed hours for before-due rules", () => {
    expect(
      reminderBeforeDue("2026-03-09T09:00", "America/New_York", 1, "days"),
    ).toBe("2026-03-08T09:00");
    expect(
      reminderBeforeDue("2026-03-09T09:00", "America/New_York", 24, "hours"),
    ).toBe("2026-03-08T09:00");
  });
});
