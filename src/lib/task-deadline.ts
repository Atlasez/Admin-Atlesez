/** Local D1 values retain their own timezone; ISO instants are converted explicitly. */
export function formatTaskDeadline(value: string, timezone = "Asia/Tokyo") {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    let local: string;
    if (/Z$|[+-]\d\d:\d\d$/.test(value)) {
      const parts = new Map(
        formatter
          .formatToParts(new Date(value))
          .map((part) => [part.type, part.value]),
      );
      local = `${parts.get("year")}-${parts.get("month")}-${parts.get("day")} ${parts.get("hour")}:${parts.get("minute")}`;
    } else {
      const match =
        /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value);
      if (!match) throw new Error("invalid local deadline");
      const date = new Date(`${match[1]}T${match[2]}:00Z`);
      if (date.toISOString().slice(0, 16) !== `${match[1]}T${match[2]}`)
        throw new Error("invalid local deadline");
      local = `${match[1]} ${match[2]}`;
    }
    return `${local} (${timezone})`;
  } catch {
    return `${value}（日時・タイムゾーンを確認してください）`;
  }
}
