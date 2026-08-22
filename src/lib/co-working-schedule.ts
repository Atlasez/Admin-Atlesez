export type RecurringCoWorkingSession = {
  id: string;
  weekday: number;
  day: string;
  time: string;
  hour: number;
  minute: number;
};

export type RecurringCoWorkingEvent = {
  id: string;
  title: string;
  details: string;
  starts_at: string;
  ends_at: null;
  timezone: "Asia/Tokyo";
  source: "co-working-recurring";
};

export const atlasRecurringSessions: RecurringCoWorkingSession[] = [
  {
    id: "tuesday-2100",
    weekday: 2,
    day: "毎週火曜日",
    time: "21:00〜",
    hour: 21,
    minute: 0,
  },
  {
    id: "wednesday-2100",
    weekday: 3,
    day: "毎週水曜日",
    time: "21:00〜",
    hour: 21,
    minute: 0,
  },
  {
    id: "thursday-2100",
    weekday: 4,
    day: "毎週木曜日",
    time: "21:00〜",
    hour: 21,
    minute: 0,
  },
  {
    id: "friday-2100",
    weekday: 5,
    day: "毎週金曜日",
    time: "21:00〜",
    hour: 21,
    minute: 0,
  },
  {
    id: "sunday-1000",
    weekday: 0,
    day: "毎週日曜日",
    time: "10:00〜",
    hour: 10,
    minute: 0,
  },
];

export function recurringCoWorkingEventsForMonth(
  year: number,
  monthIndex: number,
): RecurringCoWorkingEvent[] {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const events: RecurringCoWorkingEvent[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    const localDate = new Date(year, monthIndex, day);
    for (const session of atlasRecurringSessions) {
      if (localDate.getDay() !== session.weekday) continue;
      const dateKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const startsAt = new Date(
        Date.UTC(year, monthIndex, day, session.hour - 9, session.minute),
      );
      events.push({
        id: `co-working:atlas:${session.id}:${dateKey}`,
        title: "同時作業会",
        details: "Discord VCで開催",
        starts_at: startsAt.toISOString(),
        ends_at: null,
        timezone: "Asia/Tokyo",
        source: "co-working-recurring",
      });
    }
  }
  return events;
}
