import { Session } from "@trail/schema";
import type { Session as SessionT } from "@trail/schema";
import { DETECTORS, type RedactionCategory } from "./detectors";
import { scanValue, type EntropySuspect } from "./entropy";

export type { RedactionCategory } from "./detectors";
export type { EntropySuspect } from "./entropy";

export interface RedactionReport {
  /** Total redactions applied (sum across categories). */
  total: number;
  byCategory: Record<RedactionCategory, number>;
  /**
   * High-entropy tokens that survived all named detectors. Possible
   * unknown credentials. The caller decides whether to block upload or
   * surface to the user for confirmation.
   */
  suspects: EntropySuspect[];
}

interface Counter {
  add(cat: RedactionCategory, n: number): void;
}

function scrubString(s: string, counter: Counter): string {
  let out = s;
  for (const det of DETECTORS) {
    out = out.replace(det.pattern, (match, ...groups) => {
      counter.add(det.category, 1);
      // The trailing two args of String.replace's callback are offset + full.
      // Strip them so detector replace functions see only their capture
      // groups (which is what the detector signatures declare).
      const captures = groups.slice(0, -2) as string[];
      return det.replace(match, ...captures);
    });
  }
  return out;
}

function scrubValue(v: unknown, counter: Counter): unknown {
  if (typeof v === "string") return scrubString(v, counter);
  if (Array.isArray(v)) return v.map((x) => scrubValue(x, counter));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = scrubValue(val, counter);
    }
    return out;
  }
  return v;
}

export function anonymize(session: SessionT): {
  session: SessionT;
  report: RedactionReport;
} {
  const byCategory: Record<RedactionCategory, number> = {
    secret: 0,
    "credential-url": 0,
    path: 0,
    email: 0,
    "internal-host": 0,
  };
  const counter: Counter = {
    add: (c, n) => {
      byCategory[c] += n;
    },
  };

  // Deep-clone via JSON round-trip then walk.
  const cloned = JSON.parse(JSON.stringify(session)) as SessionT;
  const scrubbed = scrubValue(cloned, counter) as SessionT;

  // Validate output still matches schema (defense in depth).
  const parsed = Session.parse(scrubbed);

  // After named detectors have run, sweep for unknown high-entropy tokens.
  const suspects = scanValue(parsed);

  const total = Object.values(byCategory).reduce((a, b) => a + b, 0);
  return { session: parsed, report: { total, byCategory, suspects } };
}
