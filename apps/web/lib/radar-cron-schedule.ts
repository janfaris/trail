// The radar fetch cron schedule, kept in sync with apps/web/vercel.json.
// Vercel cron expressions are UTC. Radar runs every 6 hours at minute 30.
export const RADAR_FETCH_SCHEDULE = "30 */6 * * *";
export const RADAR_FETCH_RUNS_PER_DAY = 4;

// Minimal next-run resolver for the cron shapes Radar uses: a fixed minute with
// an hourly ("*"), every-n-hours ("*/6"), or fixed-hour schedule. Returns the
// next UTC instant strictly after `from`. Throws on unsupported expressions so
// callers fail loudly rather than silently reporting a wrong time.
export function nextCronRunAfter(schedule: string, from: Date = new Date()): Date {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Unsupported cron expression: ${schedule}`);
  }
  const [minuteField, hourField, dom, mon, dow] = parts;
  if (dom !== "*" || mon !== "*" || dow !== "*") {
    throw new Error(`Unsupported cron expression: ${schedule}`);
  }

  const minute = Number(minuteField);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error(`Unsupported cron minute: ${minuteField}`);
  }

  const everyHour = hourField === "*";
  const everyNthHour = hourField.match(/^\*\/(\d+)$/);
  let fixedHour: number | null = null;
  let stepHour: number | null = null;
  if (everyNthHour) {
    stepHour = Number(everyNthHour[1] ?? Number.NaN);
    if (!Number.isInteger(stepHour) || stepHour < 1 || stepHour > 23) {
      throw new Error(`Unsupported cron hour: ${hourField}`);
    }
  } else if (!everyHour) {
    fixedHour = Number(hourField);
    if (!Number.isInteger(fixedHour) || fixedHour < 0 || fixedHour > 23) {
      throw new Error(`Unsupported cron hour: ${hourField}`);
    }
  }

  const next = new Date(from.getTime());
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(minute);
  if (next <= from) {
    next.setUTCHours(next.getUTCHours() + 1);
  }
  for (let i = 0; i < 48; i++) {
    const hour = next.getUTCHours();
    if (everyHour || hour === fixedHour || (stepHour !== null && hour % stepHour === 0)) {
      return next;
    }
    next.setUTCHours(next.getUTCHours() + 1);
  }
  throw new Error(`Unable to resolve next run for cron expression: ${schedule}`);
}
