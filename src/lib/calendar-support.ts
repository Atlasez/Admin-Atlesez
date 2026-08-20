import { Temporal } from "@js-temporal/polyfill";
import Holidays from "date-holidays";

export type HolidayRegion = {
  code: string;
  name: string;
  country: string;
  state?: string;
  region?: string;
};

export type CalendarHoliday = {
  date: string;
  name: string;
  region: string;
  regionName: string;
};

export function supportedHolidayRegions(locale = "ja") {
  const holidays = new Holidays();
  return Object.entries(holidays.getCountries(locale))
    .flatMap(([country, countryName]): HolidayRegion[] => {
      const countryEntry: HolidayRegion = {
        code: country,
        name: countryName,
        country,
      };
      const states = Object.entries(holidays.getStates(country, locale) ?? {});
      const stateEntries = states.flatMap(
        ([state, stateName]): HolidayRegion[] => {
          const stateEntry: HolidayRegion = {
            code: `${country}/${state}`,
            name: `${countryName} / ${stateName}`,
            country,
            state,
          };
          const regions = Object.entries(
            holidays.getRegions(country, state, locale) ?? {},
          ).map(([region, regionName]): HolidayRegion => ({
            code: `${country}/${state}/${region}`,
            name: `${countryName} / ${stateName} / ${regionName}`,
            country,
            state,
            region,
          }));
          return [stateEntry, ...regions];
        },
      );
      return [countryEntry, ...stateEntries];
    })
    .sort((left, right) => left.name.localeCompare(right.name, locale));
}

export function holidaysForRegions(
  regions: string[],
  year: number,
  locale = "ja",
): CalendarHoliday[] {
  // date-holidays uses `jp` for Japanese holiday-name translations while the
  // rest of the application uses the BCP 47 language code `ja`.
  const holidayLocale = locale === "ja" ? "jp" : locale;
  const supportedRegions = supportedHolidayRegions(locale);
  const regionByCode = new Map(
    supportedRegions.map((region) => [region.code, region]),
  );
  return [...new Set(regions)].flatMap((region) => {
    const selectedRegion = regionByCode.get(region);
    if (!selectedRegion) return [];
    const holidays = new Holidays(
      {
        country: selectedRegion.country,
        state: selectedRegion.state,
        region: selectedRegion.region,
      },
      {
        languages: [holidayLocale, "en"],
        types: ["public", "bank"],
      },
    );
    return holidays.getHolidays(year, holidayLocale).map((holiday) => ({
      date: holiday.date.slice(0, 10),
      name: holiday.name,
      region,
      regionName: selectedRegion.name,
    }));
  });
}

export function localDateTimeToInstant(value: string, timezone: string) {
  if (!value) return "";
  return Temporal.PlainDateTime.from(value)
    .toZonedDateTime(timezone, { disambiguation: "reject" })
    .toInstant()
    .toString();
}
