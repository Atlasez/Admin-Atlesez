import { describe, expect, it } from "vitest";
import {
  holidaysForRegions,
  localDateTimeToInstant,
  supportedHolidayRegions,
} from "../../src/lib/calendar-support";

describe("calendar support", () => {
  it("supports the worldwide country, state, and regional directory", () => {
    const regions = supportedHolidayRegions("en");
    expect(regions.length).toBeGreaterThanOrEqual(500);
    expect(regions).toContainEqual(
      expect.objectContaining({
        code: "US/CA",
        name: "United States of America / California",
      }),
    );
  });

  it("calculates holidays for next year and the year after without manual data", () => {
    const nextYear = new Date().getUTCFullYear() + 1;
    for (const year of [nextYear, nextYear + 1]) {
      const holidays = holidaysForRegions(["JP", "US"], year);
      expect(
        holidays.some(
          (holiday) =>
            holiday.date === `${year}-01-01` && holiday.region === "JP",
        ),
      ).toBe(true);
      expect(
        holidays.some(
          (holiday) =>
            holiday.date === `${year}-07-04` && holiday.region === "US",
        ),
      ).toBe(true);
    }
  });

  it("shows Japanese holiday names in Japanese", () => {
    expect(
      holidaysForRegions(["JP"], 2026).some(
        (holiday) =>
          holiday.date === "2026-08-11" && holiday.name === "山の日",
      ),
    ).toBe(true);
  });

  it("includes subdivision-specific holidays", () => {
    expect(
      holidaysForRegions(["US/CA"], 2026, "en").some(
        (holiday) =>
          holiday.date === "2026-03-31" && holiday.name.includes("Chávez"),
      ),
    ).toBe(true);
  });

  it("normalizes local time to UTC and rejects nonexistent DST time", () => {
    expect(localDateTimeToInstant("2026-01-15T09:00", "Asia/Tokyo")).toBe(
      "2026-01-15T00:00:00Z",
    );
    expect(() =>
      localDateTimeToInstant("2026-03-08T02:30", "America/New_York"),
    ).toThrow();
  });
});
