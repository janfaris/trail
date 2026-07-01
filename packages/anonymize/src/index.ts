import { Session } from "@trail/schema";
import type { Session as SessionT } from "@trail/schema";
import { DETECTORS, type RedactionCategory } from "./detectors";
import { scanValue, type EntropySuspect } from "./entropy";
import { maskPreview } from "./preview";

export type { RedactionCategory } from "./detectors";
export type { EntropySuspect } from "./entropy";
export { maskPreview } from "./preview";

// Stable display order for categories in the report — most-sensitive first so
// a "here's what we removed" preview leads with secrets, not hostnames.
const CATEGORY_ORDER: RedactionCategory[] = [
  "secret",
  "credential-url",
  "path",
  "email",
  "internal-host",
];

// Per-category preview cap. We always count EVERY redaction (so byCategory and
// total stay exact), but only retain a handful of masked examples per category
// so the report stays bounded on huge sessions.
const MAX_SAMPLES_PER_CATEGORY = 5;
// Overall cap on retained items. Counts remain accurate beyond this; only the
// detailed `items` list is truncated to keep the report a sane size.
const MAX_ITEMS = 500;

/** One redacted occurrence, with a display-safe preview of what was removed. */
export interface RedactionItem {
  category: RedactionCategory;
  /** The marker substituted in, e.g. "<redacted:anthropic>". */
  label: string;
  /** Masked preview of the removed text — safe to display; never the raw value. */
  preview: string;
  /** Length (in characters) of the original removed text. */
  length: number;
  /** JSON path of the string that contained the match, e.g. "$.events[0].text". */
  location: string;
  /**
   * Approximate 0-based character offset of the match within that string.
   * Detectors run in sequence, so offsets are measured after earlier
   * redactions in the same string have already been applied — treat as a hint,
   * not an exact index into the original text.
   */
  offset: number;
}

/** A category grouping with its full count and a capped set of example previews. */
export interface RedactionCategoryDetail {
  category: RedactionCategory;
  count: number;
  samples: RedactionItem[];
}

export interface RedactionReport {
  /** Total redactions applied (sum across categories). */
  total: number;
  byCategory: Record<RedactionCategory, number>;
  /**
   * Per-category breakdown with capped, masked preview samples. Only includes
   * categories that had at least one redaction, ordered most-sensitive first.
   * This is what powers the auditable "here's exactly what we removed" preview.
   */
  categories: RedactionCategoryDetail[];
  /**
   * Flat list of redacted occurrences in document order (capped at MAX_ITEMS).
   * Useful for positional displays; `categories` is better for a grouped view.
   */
  items: RedactionItem[];
  /**
   * High-entropy tokens that survived all named detectors. Possible
   * unknown credentials. The caller decides whether to block upload or
   * surface to the user for confirmation.
   */
  suspects: EntropySuspect[];
}

// Accumulates redaction counts + capped preview samples as the scrubber walks
// the session. Counts are exact; only the retained sample/item details are
// bounded.
class ReportBuilder {
  readonly byCategory: Record<RedactionCategory, number> = {
    secret: 0,
    "credential-url": 0,
    path: 0,
    email: 0,
    "internal-host": 0,
  };
  readonly items: RedactionItem[] = [];
  private readonly samples: Record<RedactionCategory, RedactionItem[]> = {
    secret: [],
    "credential-url": [],
    path: [],
    email: [],
    "internal-host": [],
  };

  record(
    category: RedactionCategory,
    raw: string,
    label: string,
    location: string,
    offset: number,
  ): void {
    this.byCategory[category] += 1;
    const item: RedactionItem = {
      category,
      label,
      preview: maskPreview(raw),
      length: raw.length,
      location,
      offset,
    };
    if (this.items.length < MAX_ITEMS) this.items.push(item);
    const bucket = this.samples[category];
    if (bucket.length < MAX_SAMPLES_PER_CATEGORY) bucket.push(item);
  }

  build(suspects: EntropySuspect[]): RedactionReport {
    const total = Object.values(this.byCategory).reduce((a, b) => a + b, 0);
    const categories: RedactionCategoryDetail[] = CATEGORY_ORDER.filter(
      (c) => this.byCategory[c] > 0,
    ).map((c) => ({
      category: c,
      count: this.byCategory[c],
      samples: this.samples[c],
    }));
    return { total, byCategory: this.byCategory, categories, items: this.items, suspects };
  }
}

function scrubString(s: string, location: string, builder: ReportBuilder): string {
  let out = s;
  for (const det of DETECTORS) {
    out = out.replace(det.pattern, (match, ...groups) => {
      // The trailing two args of String.replace's callback are offset + full
      // string. Strip them so detector replace functions see only their capture
      // groups (which is what the detector signatures declare).
      const offset =
        typeof groups[groups.length - 2] === "number" ? (groups[groups.length - 2] as number) : 0;
      const captures = groups.slice(0, -2) as string[];
      const replacement = det.replace(match, ...captures);
      builder.record(det.category, match, replacement, location, offset);
      return replacement;
    });
  }
  return out;
}

function scrubValue(v: unknown, location: string, builder: ReportBuilder): unknown {
  if (typeof v === "string") return scrubString(v, location, builder);
  if (Array.isArray(v)) return v.map((x, i) => scrubValue(x, `${location}[${i}]`, builder));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = scrubValue(val, `${location}.${k}`, builder);
    }
    return out;
  }
  return v;
}

export function anonymize(session: SessionT): {
  session: SessionT;
  report: RedactionReport;
} {
  const builder = new ReportBuilder();

  // Deep-clone via JSON round-trip then walk.
  const cloned = JSON.parse(JSON.stringify(session)) as SessionT;
  const scrubbed = scrubValue(cloned, "$", builder) as SessionT;

  // Validate output still matches schema (defense in depth).
  const parsed = Session.parse(scrubbed);

  // After named detectors have run, sweep for unknown high-entropy tokens.
  const suspects = scanValue(parsed);

  return { session: parsed, report: builder.build(suspects) };
}
