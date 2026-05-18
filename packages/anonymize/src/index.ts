import { Session } from "@trail/schema";
import type { Session as SessionT } from "@trail/schema";
import { DETECTORS, type RedactionCategory } from "./detectors.js";

export type { RedactionCategory } from "./detectors.js";

export interface RedactionReport {
  total: number;
  byCategory: Record<RedactionCategory, number>;
}

interface Counter {
  add(cat: RedactionCategory, n: number): void;
}

function scrubString(s: string, counter: Counter): string {
  let out = s;
  for (const det of DETECTORS) {
    out = out.replace(det.pattern, (match) => {
      counter.add(det.category, 1);
      return det.replace(match);
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

export function anonymize(session: SessionT): { session: SessionT; report: RedactionReport } {
  const byCategory: Record<RedactionCategory, number> = {
    secret: 0,
    path: 0,
    email: 0,
    "internal-host": 0,
  };
  const counter: Counter = { add: (c, n) => { byCategory[c] += n; } };

  // Deep-clone via JSON round-trip then walk.
  const cloned = JSON.parse(JSON.stringify(session)) as SessionT;
  const scrubbed = scrubValue(cloned, counter) as SessionT;

  // Validate output still matches schema (defense in depth).
  const parsed = Session.parse(scrubbed);

  const total = Object.values(byCategory).reduce((a, b) => a + b, 0);
  return { session: parsed, report: { total, byCategory } };
}
