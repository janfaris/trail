import {
  anonymize,
  type RedactionCategoryDetail,
  type RedactionReport,
} from "@trail/anonymize";
import type { Session } from "@trail/schema";

export interface CaptureRedactionResult {
  session: Session;
  redactedAt: string;
  redactionCount: number;
  report: RedactionReport;
}

/**
 * Compact, persistable form of a redaction report. Holds only what the
 * auditable share preview needs — totals, per-category counts, and the capped
 * masked-preview samples. Crucially it contains NO raw secret material (every
 * preview is already masked), so it is safe to write to the local DB. The full
 * flat `items[]` and entropy `suspects[]` are dropped to keep the row small.
 */
export interface StoredCaptureReport {
  total: number;
  byCategory: Record<string, number>;
  categories: RedactionCategoryDetail[];
  suspectCount: number;
}

/** Project a full RedactionReport down to the storable, safe-to-persist shape. */
export function toStoredCaptureReport(report: RedactionReport): StoredCaptureReport {
  return {
    total: report.total,
    byCategory: report.byCategory,
    categories: report.categories,
    suspectCount: report.suspects.length,
  };
}

/**
 * Redact secrets, emails, credential URLs, paths, and internal hosts from a
 * parsed session BEFORE it is persisted to the local SQLite store. The local
 * DB therefore never holds raw API keys — compromise of `~/.trail/db.sqlite`
 * exposes only already-anonymized data. `trail share` keeps a second
 * anonymize() pass as a safety net for legacy unredacted rows.
 */
export function redactSessionForCapture(session: Session): CaptureRedactionResult {
  const { session: redacted, report } = anonymize(session);
  return {
    session: redacted,
    redactedAt: new Date().toISOString(),
    redactionCount: report.total,
    report,
  };
}
