import { rawTimeZones, timeZonesNames } from "@vvo/tzdb";

export interface TimeZoneOption {
  value: string;
  label: string;
  offsetMinutes: number;
}

/**
 * @vvo/tzdb is generated from the IANA database and uses current canonical
 * identifiers (for example Asia/Kathmandu rather than ICU's old Katmandu
 * alias). UTC is a valid application choice but is not part of the zone list.
 */
export const IANA_TIME_ZONE_NAMES = Object.freeze(
  [...new Set([...timeZonesNames, "UTC"])].sort((a, b) =>
    a.localeCompare(b, "en"),
  ),
);

const rawOffsetByName = new Map<string, number>();
for (const zone of rawTimeZones) {
  rawOffsetByName.set(zone.name, zone.rawOffsetInMinutes);
  for (const alias of zone.group)
    rawOffsetByName.set(alias, zone.rawOffsetInMinutes);
}
rawOffsetByName.set("UTC", 0);

export const isValidTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

export const formatUtcOffset = (minutes: number) => {
  const sign = minutes < 0 ? "−" : "+";
  const absolute = Math.abs(minutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const remainder = String(absolute % 60).padStart(2, "0");
  return `UTC${sign}${hours}:${remainder}`;
};

/** Returns the offset at the supplied instant, including DST where applicable. */
export const timeZoneOffsetMinutes = (timeZone: string, date = new Date()) => {
  try {
    const offsetName = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value;
    if (offsetName === "GMT" || offsetName === "UTC") return 0;
    const match = /(?:GMT|UTC)([+\-−])(\d{1,2})(?::(\d{2}))?/.exec(
      offsetName ?? "",
    );
    if (match) {
      const offset = Number(match[2]) * 60 + Number(match[3] ?? 0);
      return match[1] === "+" ? offset : -offset;
    }
  } catch {
    // An older browser may not know a newly-added identifier. Its IANA raw
    // offset still lets the option be described; validation happens on use.
  }
  return rawOffsetByName.get(timeZone) ?? 0;
};

export const getTimeZoneOptions = (date = new Date()): TimeZoneOption[] =>
  IANA_TIME_ZONE_NAMES.map((value) => {
    const offsetMinutes = timeZoneOffsetMinutes(value, date);
    return {
      value,
      offsetMinutes,
      label: `(${formatUtcOffset(offsetMinutes)}) ${value}`,
    };
  });

/** Converts a datetime-local wall clock value in an IANA zone to an instant. */
export const zonedWallTimeToDate = (value: string, timeZone: string) => {
  if (/(?:Z|[+\-]\d{2}:\d{2})$/i.test(value)) return new Date(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(
    value,
  );
  if (!match || !isValidTimeZone(timeZone)) return new Date(value);
  const [year, month, day, hour, minute, second] = match
    .slice(1)
    .map((part) => Number(part ?? 0));
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = wall;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(guess))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess = wall - (represented - guess);
  }
  return new Date(guess);
};
