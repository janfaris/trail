// The radar fetch cron schedule, kept in sync with apps/web/vercel.json.
// Vercel cron expressions are UTC. Radar runs hourly at minute 30.
export const RADAR_FETCH_SCHEDULE = "30 * * * *";

// Minimal next-run resolver for the cron shapes Radar uses: a fixed minute with
// an hourly ("*") or fixed hour. Returns the next UTC instant strictly after
// `from`. Throws on unsupported expressions so callers fail loudly rather than
// silently reporting a wrong time.
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

  const hourlyAnyHour = hourField === "*";
  let fixedHour: number | null = null;
  if (!hourlyAnyHour) {
    const parsedHour = Number(hourField);
    if (!Number.isInteger(parsedHour) || parsedHour < 0 || parsedHour > 23) {
      throw new Error(`Unsupported cron hour: ${hourField}`);
    }
    fixedHour = parsedHour;
  }

  const next = new Date(from.getTime());
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(minute);
  if (next <= from) {
    next.setUTCHours(next.getUTCHours() + 1);
  }
  if (!hourlyAnyHour) {
    // Advance hour-by-hour until we land on the fixed hour. Bounded to 24 steps.
    for (let i = 0; i < 24 && next.getUTCHours() !== fixedHour; i++) {
      next.setUTCHours(next.getUTCHours() + 1);
    }
  }
  return next;
}
