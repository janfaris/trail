const BANNED = ['leveraged', 'utilized', 'robust', 'seamless', 'cutting-edge', 'blazing', 'lightning-fast'];

export interface ReceiptDraft {
  outcome: string;
  decisions: string[];
}

export interface ValidationResult {
  warnings: string[];
  ok: boolean;
}

export function validateReceipt(r: ReceiptDraft): ValidationResult {
  const warnings: string[] = [];
  const text = (r.outcome + ' ' + r.decisions.join(' ')).toLowerCase();
  for (const w of BANNED) {
    if (text.includes(w)) warnings.push(`banned-phrase:${w}`);
  }
  if (r.decisions.length < 3) warnings.push('missing-decisions');
  if (r.outcome.length > 240) warnings.push('outcome-too-long');
  return { warnings, ok: warnings.length === 0 };
}
