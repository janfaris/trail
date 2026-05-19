// Compute current + longest day-streak from a list of session dates.
// Input must be sorted DESC by date (most-recent first). Days are bucketed
// by UTC calendar day. Current streak counts back from today: if today
// has no session, yesterday must — otherwise streak is 0.

function utcDayKey(d: Date): number {
  return Math.floor(d.getTime() / 86400000);
}

export function computeStreak(sharedDates: Date[]): { current: number; longest: number } {
  if (sharedDates.length === 0) return { current: 0, longest: 0 };
  const days = Array.from(new Set(sharedDates.map(utcDayKey))).sort((a, b) => b - a);

  // longest: scan descending list, count consecutive runs
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === days[i - 1] - 1) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  // current: starts today or yesterday (grace for "haven't coded yet today")
  const today = utcDayKey(new Date());
  let current = 0;
  let expected = today;
  if (days[0] !== today && days[0] !== today - 1) {
    return { current: 0, longest };
  }
  if (days[0] === today - 1) expected = today - 1;
  for (const d of days) {
    if (d === expected) {
      current++;
      expected--;
    } else if (d < expected) {
      break;
    }
  }
  return { current, longest };
}
