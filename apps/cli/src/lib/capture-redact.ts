import { anonymize, type RedactionReport } from "@trail/anonymize";
import type { Session } from "@trail/schema";

export interface CaptureRedactionResult {
  session: Session;
  redactedAt: string;
  redactionCount: number;
  report: RedactionReport;
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
