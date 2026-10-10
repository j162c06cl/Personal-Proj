// Scheduled US economic releases, shared by the dashboard and the calendar page.
// Maintained by hand: add new dates from the official release calendars (BLS, BEA, Federal Reserve).

export interface EconomicEvent {
  date: string; // YYYY-MM-DD
  time: string;
  name: string;
  importance: "high" | "medium";
  category: "growth" | "inflation" | "employment" | "consumer" | "fed";
  description: string;
}

export const ECONOMIC_EVENTS: EconomicEvent[] = [
  // June 2026
  { date: "2026-06-26", time: "08:30 ET", name: "GDP (Q1 Final)",            importance: "high",   category: "growth",      description: "Final estimate of Q1 2026 US economic growth rate" },
  { date: "2026-06-27", time: "08:30 ET", name: "PCE Price Index (May)",      importance: "high",   category: "inflation",   description: "The Federal Reserve's preferred measure of inflation" },
  // July 2026
  { date: "2026-07-02", time: "08:30 ET", name: "Non-Farm Payrolls (Jun)",    importance: "high",   category: "employment",  description: "New jobs added to the US economy in June 2026" },
  { date: "2026-07-09", time: "08:30 ET", name: "Initial Jobless Claims",     importance: "medium", category: "employment",  description: "Weekly new unemployment benefit filings" },
  { date: "2026-07-14", time: "08:30 ET", name: "PPI (Jun)",                  importance: "medium", category: "inflation",   description: "June 2026 Producer Price Index — wholesale inflation" },
  { date: "2026-07-15", time: "08:30 ET", name: "CPI (Jun)",                  importance: "high",   category: "inflation",   description: "June 2026 Consumer Price Index — key inflation reading" },
  { date: "2026-07-15", time: "08:30 ET", name: "Retail Sales (Jun)",         importance: "medium", category: "consumer",    description: "Monthly change in US retail sector spending" },
  { date: "2026-07-25", time: "08:30 ET", name: "PCE Price Index (Jun)",      importance: "high",   category: "inflation",   description: "Fed's preferred inflation measure for June 2026" },
  { date: "2026-07-28", time: "All day",  name: "FOMC Meeting (Day 1)",       importance: "high",   category: "fed",         description: "Federal Open Market Committee two-day meeting begins" },
  { date: "2026-07-29", time: "14:00 ET", name: "FOMC Rate Decision",         importance: "high",   category: "fed",         description: "Fed interest rate decision and Chair press conference" },
  { date: "2026-07-30", time: "08:30 ET", name: "GDP (Q2 Advance)",           importance: "high",   category: "growth",      description: "First advance estimate of Q2 2026 US economic growth" },
  // August 2026
  { date: "2026-08-07", time: "08:30 ET", name: "Non-Farm Payrolls (Jul)",    importance: "high",   category: "employment",  description: "New jobs added to the US economy in July 2026" },
  { date: "2026-08-12", time: "08:30 ET", name: "CPI (Jul)",                  importance: "high",   category: "inflation",   description: "July 2026 Consumer Price Index" },
  { date: "2026-08-13", time: "08:30 ET", name: "PPI (Jul)",                  importance: "medium", category: "inflation",   description: "July 2026 Producer Price Index" },
  { date: "2026-08-13", time: "08:30 ET", name: "Retail Sales (Jul)",         importance: "medium", category: "consumer",    description: "Monthly change in US retail sector spending" },
  { date: "2026-08-28", time: "08:30 ET", name: "PCE Price Index (Jul)",      importance: "high",   category: "inflation",   description: "Fed's preferred inflation measure for July 2026" },
  // September 2026
  { date: "2026-09-04", time: "08:30 ET", name: "Non-Farm Payrolls (Aug)",    importance: "high",   category: "employment",  description: "New jobs added to the US economy in August 2026" },
  { date: "2026-09-10", time: "08:30 ET", name: "CPI (Aug)",                  importance: "high",   category: "inflation",   description: "August 2026 Consumer Price Index" },
  { date: "2026-09-11", time: "08:30 ET", name: "PPI (Aug)",                  importance: "medium", category: "inflation",   description: "August 2026 Producer Price Index" },
  { date: "2026-09-15", time: "All day",  name: "FOMC Meeting (Day 1)",       importance: "high",   category: "fed",         description: "Federal Open Market Committee two-day meeting begins" },
  { date: "2026-09-16", time: "14:00 ET", name: "FOMC Rate Decision",         importance: "high",   category: "fed",         description: "Fed interest rate decision and Chair press conference" },
  { date: "2026-09-25", time: "08:30 ET", name: "GDP (Q2 Second Estimate)",   importance: "high",   category: "growth",      description: "Second estimate of Q2 2026 US economic growth" },
  { date: "2026-09-26", time: "08:30 ET", name: "PCE Price Index (Aug)",      importance: "high",   category: "inflation",   description: "Fed's preferred inflation measure for August 2026" },
  // October 2026
  { date: "2026-10-02", time: "08:30 ET", name: "Non-Farm Payrolls (Sep)",    importance: "high",   category: "employment",  description: "New jobs added to the US economy in September 2026" },
  { date: "2026-10-13", time: "08:30 ET", name: "CPI (Sep)",                  importance: "high",   category: "inflation",   description: "September 2026 Consumer Price Index" },
  { date: "2026-10-14", time: "08:30 ET", name: "PPI (Sep)",                  importance: "medium", category: "inflation",   description: "September 2026 Producer Price Index" },
  { date: "2026-10-27", time: "All day",  name: "FOMC Meeting (Day 1)",       importance: "high",   category: "fed",         description: "Federal Open Market Committee two-day meeting begins" },
  { date: "2026-10-28", time: "14:00 ET", name: "FOMC Rate Decision",         importance: "high",   category: "fed",         description: "Fed interest rate decision and Chair press conference" },
];
