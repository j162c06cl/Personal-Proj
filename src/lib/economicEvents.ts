// Scheduled US economic releases, shared by the dashboard, the portfolio and the calendar page.
//
// Maintained by hand from the official release calendars (last checked 2026-11-21):
//   Jobs report, CPI, PPI   https://www.bls.gov/schedule/news_release/  (empsit.htm, cpi.htm, ppi.htm)
//   GDP and PCE             https://www.bea.gov/news/schedule/full  (PCE comes out with GDP since Feb 2026)
//   Retail sales            https://www.census.gov/retail/release_schedule.html
//   FOMC                    https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
// Only dates confirmed on those pages are listed. When the list nears its end, the app says
// so (calendarNotice) rather than showing an empty calendar as a quiet one.

export interface EconomicEvent {
  date: string; // YYYY-MM-DD, US Eastern
  time: string;
  name: string;
  importance: "high" | "medium";
  category: "growth" | "inflation" | "employment" | "consumer" | "fed";
  description: string;
}

const FOMC_TENTATIVE = "Tentative until confirmed at the meeting before it";

export const ECONOMIC_EVENTS: EconomicEvent[] = [
  // June 2026
  { date: "2026-06-16", time: "All day",  name: "FOMC Meeting (Day 1)",       importance: "high",   category: "fed",         description: "Federal Open Market Committee two-day meeting begins" },
  { date: "2026-06-17", time: "14:00 ET", name: "FOMC Rate Decision",         importance: "high",   category: "fed",         description: "Fed interest rate decision, economic projections and Chair press conference" },
  { date: "2026-06-25", time: "08:30 ET", name: "GDP (Q1 Third Estimate)",    importance: "high",   category: "growth",      description: "Third estimate of Q1 2026 US economic growth" },
  { date: "2026-06-25", time: "08:30 ET", name: "PCE Price Index (May)",      importance: "high",   category: "inflation",   description: "The Federal Reserve's preferred inflation measure for May 2026" },
  // July 2026
  { date: "2026-07-28", time: "All day",  name: "FOMC Meeting (Day 1)",       importance: "high",   category: "fed",         description: "Federal Open Market Committee two-day meeting begins" },
  { date: "2026-07-29", time: "14:00 ET", name: "FOMC Rate Decision",         importance: "high",   category: "fed",         description: "Fed interest rate decision and Chair press conference" },
  { date: "2026-07-30", time: "08:30 ET", name: "GDP (Q2 Advance)",           importance: "high",   category: "growth",      description: "First estimate of Q2 2026 US economic growth" },
  { date: "2026-07-30", time: "08:30 ET", name: "PCE Price Index (Jun)",      importance: "high",   category: "inflation",   description: "The Federal Reserve's preferred inflation measure for June 2026" },
  // August 2026
  { date: "2026-08-26", time: "08:30 ET", name: "GDP (Q2 Second Estimate)",   importance: "high",   category: "growth",      description: "Second estimate of Q2 2026 US economic growth" },
  { date: "2026-08-26", time: "08:30 ET", name: "PCE Price Index (Jul)",      importance: "high",   category: "inflation",   description: "The Federal Reserve's preferred inflation measure for July 2026" },
  // September 2026
  { date: "2026-09-15", time: "All day",  name: "FOMC Meeting (Day 1)",       importance: "high",   category: "fed",         description: "Federal Open Market Committee two-day meeting begins" },
  { date: "2026-09-16", time: "14:00 ET", name: "FOMC Rate Decision",         importance: "high",   category: "fed",         description: "Fed interest rate decision, economic projections and Chair press conference" },
  { date: "2026-09-30", time: "08:30 ET", name: "GDP (Q2 Third Estimate)",    importance: "high",   category: "growth",      description: "Third estimate of Q2 2026 US economic growth" },
  { date: "2026-09-30", time: "08:30 ET", name: "PCE Price Index (Aug)",      importance: "high",   category: "inflation",   description: "The Federal Reserve's preferred inflation measure for August 2026" },
  // October 2026
  { date: "2026-10-15", time: "08:30 ET", name: "Retail Sales (Sep)",         importance: "medium", category: "consumer",    description: "Monthly change in US retail spending in September 2026" },
  { date: "2026-10-27", time: "All day",  name: "FOMC Meeting (Day 1)",       importance: "high",   category: "fed",         description: "Federal Open Market Committee two-day meeting begins" },
  { date: "2026-10-28", time: "14:00 ET", name: "FOMC Rate Decision",         importance: "high",   category: "fed",         description: "Fed interest rate decision and Chair press conference" },
  { date: "2026-10-29", time: "08:30 ET", name: "GDP (Q3 Advance)",           importance: "high",   category: "growth",      description: "First estimate of Q3 2026 US economic growth" },
  { date: "2026-10-29", time: "08:30 ET", name: "PCE Price Index (Sep)",      importance: "high",   category: "inflation",   description: "The Federal Reserve's preferred inflation measure for September 2026" },
  // November 2026
  { date: "2026-11-06", time: "08:30 ET", name: "Non-Farm Payrolls (Oct)",    importance: "high",   category: "employment",  description: "Jobs added and the unemployment rate for October 2026" },
  { date: "2026-11-10", time: "08:30 ET", name: "CPI (Oct)",                  importance: "high",   category: "inflation",   description: "October 2026 Consumer Price Index" },
  { date: "2026-11-13", time: "08:30 ET", name: "PPI (Oct)",                  importance: "medium", category: "inflation",   description: "October 2026 Producer Price Index (wholesale prices)" },
  { date: "2026-11-17", time: "08:30 ET", name: "Retail Sales (Oct)",         importance: "medium", category: "consumer",    description: "Monthly change in US retail spending in October 2026" },
  { date: "2026-11-25", time: "08:30 ET", name: "GDP (Q3 Second Estimate)",   importance: "high",   category: "growth",      description: "Second estimate of Q3 2026 US economic growth" },
  { date: "2026-11-25", time: "08:30 ET", name: "PCE Price Index (Oct)",      importance: "high",   category: "inflation",   description: "The Federal Reserve's preferred inflation measure for October 2026" },
  // December 2026
  { date: "2026-12-04", time: "08:30 ET", name: "Non-Farm Payrolls (Nov)",    importance: "high",   category: "employment",  description: "Jobs added and the unemployment rate for November 2026" },
  { date: "2026-12-08", time: "All day",  name: "FOMC Meeting (Day 1)",       importance: "high",   category: "fed",         description: "Federal Open Market Committee two-day meeting begins" },
  { date: "2026-12-09", time: "14:00 ET", name: "FOMC Rate Decision",         importance: "high",   category: "fed",         description: "Fed interest rate decision, economic projections and Chair press conference" },
  { date: "2026-12-10", time: "08:30 ET", name: "CPI (Nov)",                  importance: "high",   category: "inflation",   description: "November 2026 Consumer Price Index" },
  { date: "2026-12-15", time: "08:30 ET", name: "PPI (Nov)",                  importance: "medium", category: "inflation",   description: "November 2026 Producer Price Index (wholesale prices)" },
  { date: "2026-12-16", time: "08:30 ET", name: "Retail Sales (Nov)",         importance: "medium", category: "consumer",    description: "Monthly change in US retail spending in November 2026" },
  { date: "2026-12-23", time: "08:30 ET", name: "GDP (Q3 Third Estimate)",    importance: "high",   category: "growth",      description: "Third estimate of Q3 2026 US economic growth" },
  { date: "2026-12-23", time: "08:30 ET", name: "PCE Price Index (Nov)",      importance: "high",   category: "inflation",   description: "The Federal Reserve's preferred inflation measure for November 2026" },
  // January 2027
  { date: "2027-01-08", time: "08:30 ET", name: "Non-Farm Payrolls (Dec)",    importance: "high",   category: "employment",  description: "Jobs added and the unemployment rate for December 2026" },
  { date: "2027-01-13", time: "08:30 ET", name: "CPI (Dec)",                  importance: "high",   category: "inflation",   description: "December 2026 Consumer Price Index" },
  { date: "2027-01-14", time: "08:30 ET", name: "PPI (Dec)",                  importance: "medium", category: "inflation",   description: "December 2026 Producer Price Index (wholesale prices)" },
  { date: "2027-01-15", time: "08:30 ET", name: "Retail Sales (Dec)",         importance: "medium", category: "consumer",    description: "Monthly change in US retail spending in December 2026" },
  { date: "2027-01-26", time: "All day",  name: "FOMC Meeting (Day 1)",       importance: "high",   category: "fed",         description: `Federal Open Market Committee two-day meeting begins. ${FOMC_TENTATIVE}` },
  { date: "2027-01-27", time: "14:00 ET", name: "FOMC Rate Decision",         importance: "high",   category: "fed",         description: `Fed interest rate decision and Chair press conference. ${FOMC_TENTATIVE}` },
  { date: "2027-01-28", time: "08:30 ET", name: "GDP (Q4 Advance)",           importance: "high",   category: "growth",      description: "First estimate of Q4 and full-year 2026 US economic growth" },
  { date: "2027-01-28", time: "08:30 ET", name: "PCE Price Index (Dec)",      importance: "high",   category: "inflation",   description: "The Federal Reserve's preferred inflation measure for December 2026" },
  // February 2027
  { date: "2027-02-05", time: "08:30 ET", name: "Non-Farm Payrolls (Jan)",    importance: "high",   category: "employment",  description: "Jobs added and the unemployment rate for January 2027" },
  { date: "2027-02-11", time: "08:30 ET", name: "CPI (Jan)",                  importance: "high",   category: "inflation",   description: "January 2027 Consumer Price Index" },
  { date: "2027-02-12", time: "08:30 ET", name: "PPI (Jan)",                  importance: "medium", category: "inflation",   description: "January 2027 Producer Price Index (wholesale prices)" },
  { date: "2027-02-17", time: "08:30 ET", name: "Retail Sales (Jan)",         importance: "medium", category: "consumer",    description: "Monthly change in US retail spending in January 2027" },
  { date: "2027-02-25", time: "08:30 ET", name: "GDP (Q4 Second Estimate)",   importance: "high",   category: "growth",      description: "Second estimate of Q4 and full-year 2026 US economic growth" },
  { date: "2027-02-25", time: "08:30 ET", name: "PCE Price Index (Jan)",      importance: "high",   category: "inflation",   description: "The Federal Reserve's preferred inflation measure for January 2027" },
  // March 2027
  { date: "2027-03-05", time: "08:30 ET", name: "Non-Farm Payrolls (Feb)",    importance: "high",   category: "employment",  description: "Jobs added and the unemployment rate for February 2027" },
  { date: "2027-03-10", time: "08:30 ET", name: "CPI (Feb)",                  importance: "high",   category: "inflation",   description: "February 2027 Consumer Price Index" },
  { date: "2027-03-12", time: "08:30 ET", name: "PPI (Feb)",                  importance: "medium", category: "inflation",   description: "February 2027 Producer Price Index (wholesale prices)" },
  { date: "2027-03-16", time: "08:30 ET", name: "Retail Sales (Feb)",         importance: "medium", category: "consumer",    description: "Monthly change in US retail spending in February 2027" },
  { date: "2027-03-16", time: "All day",  name: "FOMC Meeting (Day 1)",       importance: "high",   category: "fed",         description: `Federal Open Market Committee two-day meeting begins. ${FOMC_TENTATIVE}` },
  { date: "2027-03-17", time: "14:00 ET", name: "FOMC Rate Decision",         importance: "high",   category: "fed",         description: `Fed interest rate decision and Chair press conference. ${FOMC_TENTATIVE}` },
  { date: "2027-03-31", time: "08:30 ET", name: "GDP (Q4 Third Estimate)",    importance: "high",   category: "growth",      description: "Third estimate of Q4 and full-year 2026 US economic growth" },
  { date: "2027-03-31", time: "08:30 ET", name: "PCE Price Index (Feb)",      importance: "high",   category: "inflation",   description: "The Federal Reserve's preferred inflation measure for February 2027" },
  // April 2027
  { date: "2027-04-02", time: "08:30 ET", name: "Non-Farm Payrolls (Mar)",    importance: "high",   category: "employment",  description: "Jobs added and the unemployment rate for March 2027" },
  { date: "2027-04-13", time: "08:30 ET", name: "CPI (Mar)",                  importance: "high",   category: "inflation",   description: "March 2027 Consumer Price Index" },
  { date: "2027-04-14", time: "08:30 ET", name: "PPI (Mar)",                  importance: "medium", category: "inflation",   description: "March 2027 Producer Price Index (wholesale prices)" },
  { date: "2027-04-16", time: "08:30 ET", name: "Retail Sales (Mar)",         importance: "medium", category: "consumer",    description: "Monthly change in US retail spending in March 2027" },
  { date: "2027-04-27", time: "All day",  name: "FOMC Meeting (Day 1)",       importance: "high",   category: "fed",         description: `Federal Open Market Committee two-day meeting begins. ${FOMC_TENTATIVE}` },
  { date: "2027-04-28", time: "14:00 ET", name: "FOMC Rate Decision",         importance: "high",   category: "fed",         description: `Fed interest rate decision and Chair press conference. ${FOMC_TENTATIVE}` },
  { date: "2027-04-29", time: "08:30 ET", name: "GDP (Q1 Advance)",           importance: "high",   category: "growth",      description: "First estimate of Q1 2027 US economic growth" },
  { date: "2027-04-29", time: "08:30 ET", name: "PCE Price Index (Mar)",      importance: "high",   category: "inflation",   description: "The Federal Reserve's preferred inflation measure for March 2027" },
];

/** The last date the list covers */
export const CALENDAR_ENDS = ECONOMIC_EVENTS[ECONOMIC_EVENTS.length - 1].date;

/** Today's date on this device's calendar, as YYYY-MM-DD */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * A warning when the list ends within `withinDays` of `today` (both YYYY-MM-DD), so a list
 * that has run out isn't read as a quiet calendar. Null while the list reaches far enough.
 */
export function calendarNotice(today: string, withinDays: number, end: string = CALENDAR_ENDS): string | null {
  const daysLeft = (Date.parse(end) - Date.parse(today)) / 86_400_000;
  if (daysLeft > withinDays) return null;
  const shown = new Date(end + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return daysLeft < 0
    ? `The release list ended on ${shown}, so newer releases are missing. Add them to src/lib/economicEvents.ts from the official BLS, BEA, Census and Federal Reserve calendars.`
    : `Releases are only listed up to ${shown}. Add later ones to src/lib/economicEvents.ts from the official BLS, BEA, Census and Federal Reserve calendars.`;
}
