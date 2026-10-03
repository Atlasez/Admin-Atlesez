import { describe, expect, it } from "vitest";
import { adminCalendarMonthRange } from "../../src/lib/admin-calendar-range";

describe("displayed calendar month bounds", () => {
  it("uses local month boundaries rather than UTC dates", () => {
    expect(adminCalendarMonthRange(2026, 9, "Asia/Tokyo")).toEqual({
      start: "2026-09-30T15:00:00Z",
      end: "2026-10-31T15:00:00Z",
    });
  });

  it("includes the offset change inside a daylight-saving month", () => {
    expect(adminCalendarMonthRange(2026, 2, "America/New_York")).toEqual({
      start: "2026-03-01T05:00:00Z",
      end: "2026-04-01T04:00:00Z",
    });
  });

  it("moves across the year boundary", () => {
    expect(adminCalendarMonthRange(2026, 11, "UTC")).toEqual({
      start: "2026-12-01T00:00:00Z",
      end: "2027-01-01T00:00:00Z",
    });
  });
});
