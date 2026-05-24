import { describe, test, expect } from 'vitest';
import { validateReceipt } from './receipt-validator';

describe('validateReceipt', () => {
  test('flags banned phrases', () => {
    const r = validateReceipt({ outcome: 'Leveraged Stripe for seamless checkout', decisions: [] });
    expect(r.warnings).toContain('banned-phrase:leveraged');
    expect(r.warnings).toContain('banned-phrase:seamless');
  });
  test('flags missing decisions', () => {
    const r = validateReceipt({ outcome: 'Added auth', decisions: [] });
    expect(r.warnings).toContain('missing-decisions');
  });
  test('passes clean receipt', () => {
    const r = validateReceipt({
      outcome: 'Added Stripe checkout with webhook retry.',
      decisions: ['Picked Stripe over Lemon Squeezy for PR market', 'Idempotent webhook handler', 'Tested with stripe-cli locally'],
    });
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
  });
  test('flags overlong outcome', () => {
    const r = validateReceipt({ outcome: 'x'.repeat(241), decisions: ['a','b','c'] });
    expect(r.warnings).toContain('outcome-too-long');
  });
});
