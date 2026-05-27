import { describe, it, expect } from "vitest";
import { anonymize } from "../src/index.js";
import type { Session } from "@trail/schema";

function s(events: Session["events"]): Session {
  return {
    id: "sess-1",
    user: "alice",
    tool: "claude-code",
    startedAt: "2025-01-01T00:00:00Z",
    events,
  };
}

describe("anonymize: named provider keys", () => {
  it("scrubs OpenAI/Anthropic/GitHub/Stripe/AWS keys + JWTs", () => {
    const r = anonymize(
      s([
        { kind: "prompt", at: "t", text: "key=sk-ant-abcdefghijklmnop2mno" },
        { kind: "completion", at: "t", text: "openai sk-proj-abcdefghijklmnopuvwx" },
        { kind: "completion", at: "t", text: "ghp_abcdefghijklmnopqrst6789" },
        { kind: "completion", at: "t", text: "stripe sk_live_abcdefghijklmnopstuv" },
        { kind: "completion", at: "t", text: "AKIAIOSFODNN7EXAMPLE" },
        {
          kind: "completion",
          at: "t",
          text:
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n0NZh4yE0F2QT",
        },
      ]),
    );
    expect(r.report.byCategory.secret).toBeGreaterThanOrEqual(6);
    const allText = JSON.stringify(r.session);
    expect(allText).not.toMatch(/sk-ant-abc/);
    expect(allText).not.toMatch(/sk-proj-/);
    expect(allText).not.toMatch(/ghp_/);
    expect(allText).not.toMatch(/AKIA/);
  });

  it("scrubs Google / HuggingFace / Replicate / Groq / Perplexity / xAI / OpenRouter", () => {
    const r = anonymize(
      s([
        {
          kind: "completion",
          at: "t",
          text: [
            "google AIzaSyA-1234567890abcdefghijklmnopqrstuvw",
            "huggingface hf_abcdefghijklmnopqrstuvwxyz0123456789",
            "replicate r8_abcdefghijklmnopqrstuvwxyz0123456789AB",
            "groq gsk_abcdefghijklmnopqrstuvwxyz0123456789ABCDE",
            "perplexity pplx-abcdefghijklmnopqrstuvwxyz0123456789ABCDE",
            "xai xai-abcdefghijklmnopqrstuvwxyz0123456789ABCDE",
            "openrouter sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789AB",
          ].join(" "),
        },
      ]),
    );
    const out = JSON.stringify(r.session);
    expect(out).toContain("<redacted:google>");
    expect(out).toContain("<redacted:huggingface>");
    expect(out).toContain("<redacted:replicate>");
    expect(out).toContain("<redacted:groq>");
    expect(out).toContain("<redacted:perplexity>");
    expect(out).toContain("<redacted:xai>");
    expect(out).toContain("<redacted:openrouter>");
    expect(out).not.toMatch(/AIzaSyA/);
    expect(out).not.toMatch(/hf_abcd/);
  });

  it("scrubs Slack / Linear / SendGrid / Mailgun / Twilio / Sentry DSN", () => {
    const r = anonymize(
      s([
        {
          kind: "completion",
          at: "t",
          text: [
            "slack xoxb-1234567890-ABCDEFGHIJ",
            "linear lin_api_abcdefghijklmnopqrstuvwxyz0123456789",
            "sendgrid SG.abcdefghijklmnopqrstuv.abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJK",
            "mailgun key-abcdef0123456789abcdef0123456789",
            "twilio sid AC0123456789abcdef0123456789abcdef",
            "twilio key SK0123456789abcdef0123456789abcdef",
            "sentry dsn https://0123456789abcdef0123456789abcdef@o123.ingest.sentry.io/12345",
          ].join(" "),
        },
      ]),
    );
    const out = JSON.stringify(r.session);
    expect(out).toContain("<redacted:slack>");
    expect(out).toContain("<redacted:linear>");
    expect(out).toContain("<redacted:sendgrid>");
    expect(out).toContain("<redacted:mailgun>");
    expect(out).toContain("<redacted:twilio-sid>");
    expect(out).toContain("<redacted:twilio-key>");
    expect(out).toContain("<redacted:sentry-dsn>");
  });

  it("scrubs PEM-encoded private keys", () => {
    const pem = [
      "-----BEGIN PRIVATE KEY-----",
      "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ",
      "-----END PRIVATE KEY-----",
    ].join("\n");
    const r = anonymize(s([{ kind: "completion", at: "t", text: pem }]));
    const out = JSON.stringify(r.session);
    expect(out).toContain("<redacted:private-key>");
    expect(out).not.toContain("BEGIN PRIVATE KEY");
  });
});

describe("anonymize: credential URLs", () => {
  it("masks userinfo in postgres / mongodb / redis URLs but preserves host", () => {
    const r = anonymize(
      s([
        {
          kind: "decision",
          at: "t",
          note: [
            "postgres://app:s3cret@db.neon.tech:5432/trail",
            "mongodb+srv://u:p@cluster0.example.mongodb.net/mydb",
            "redis://default:VeryLongP@ssw0rdNoYouCannot@cache.upstash.io:6379",
          ].join(" | "),
        },
      ]),
    );
    const out = (r.session.events[0] as { note: string }).note;
    expect(out).toContain("postgres://<redacted:db-creds>@db.neon.tech:5432/trail");
    expect(out).toContain("mongodb+srv://<redacted:db-creds>@cluster0.example.mongodb.net/mydb");
    expect(out).not.toMatch(/:s3cret@/);
    expect(r.report.byCategory["credential-url"]).toBeGreaterThanOrEqual(2);
  });
});

describe("anonymize: generic KEY=VALUE", () => {
  it("redacts .env-style assignments regardless of value shape", () => {
    const dotenv = [
      'AZURE_OPENAI_API_KEY="1Da4ohJ0t35jOLBJuwcGL04oMFYsJPewMKzb6IhPYx7sdUbVDvCqJQQJ99CEACHYHv6XJ3w3"',
      "VERCEL_TOKEN=abc123def456ghi789jkl012",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJI.dummy.signature_part_here_long_enough",
      "DATABASE_URL='postgres://localhost/x'",
      "JWT_SECRET=`my-very-long-secret-value`",
    ].join("\n");
    const r = anonymize(s([{ kind: "completion", at: "t", text: dotenv }]));
    const out = (r.session.events[0] as { text: string }).text;
    expect(out).toContain("<redacted:env-value>");
    // Key names should survive so the shape stays readable.
    expect(out).toMatch(/AZURE_OPENAI_API_KEY/);
    expect(out).toMatch(/VERCEL_TOKEN/);
    expect(out).toMatch(/JWT_SECRET/);
    // Actual secrets should be gone.
    expect(out).not.toMatch(/1Da4ohJ0t35jOLBJuwc/);
    expect(out).not.toMatch(/abc123def456ghi789jkl012/);
  });

  it("does not redact normal English prose that happens to contain 'token' as a word", () => {
    const r = anonymize(
      s([
        {
          kind: "prompt",
          at: "t",
          text: "Discuss the access token concept and how authentication works.",
        },
      ]),
    );
    expect(r.report.byCategory.secret).toBe(0);
  });

  it("redacts shell export form", () => {
    const r = anonymize(
      s([
        {
          kind: "tool_call",
          at: "t",
          name: "bash",
          args: { cmd: "export OPENAI_API_KEY=sk-proj-realsecretvaluehere0123456789ab" },
        },
      ]),
    );
    const out = JSON.stringify(r.session);
    // Caught by the named OpenAI pattern (highest priority), not the
    // generic KEY=VALUE — either is acceptable, but the actual value
    // must be gone.
    expect(out).not.toMatch(/sk-proj-realsecret/);
  });
});

describe("anonymize: classic categories", () => {
  it("scrubs home paths", () => {
    const r = anonymize(
      s([{ kind: "decision", at: "t", note: "saw /Users/janfaris/trail/foo.ts" }]),
    );
    expect(r.report.byCategory.path).toBe(1);
    expect((r.session.events[0] as { note: string }).note).toContain(
      "/Users/anon/trail/foo.ts",
    );
  });

  it("scrubs emails", () => {
    const r = anonymize(
      s([{ kind: "prompt", at: "t", text: "ping me at jan@example.com" }]),
    );
    expect(r.report.byCategory.email).toBe(1);
    expect((r.session.events[0] as { text: string }).text).toContain(
      "<redacted:email>",
    );
  });

  it("scrubs internal hosts", () => {
    const r = anonymize(
      s([{ kind: "prompt", at: "t", text: "see http://api.corp.internal/v1/foo" }]),
    );
    expect(r.report.byCategory["internal-host"]).toBe(1);
  });
});

describe("anonymize: invariants", () => {
  it("is idempotent across the new detectors", () => {
    const input = s([
      {
        kind: "prompt",
        at: "t",
        text:
          "key=sk-ant-abcdefghijklmnop012m at /Users/jan/repo and postgres://u:p@db.example.com/x",
      },
      {
        kind: "completion",
        at: "t",
        text: 'AZURE_OPENAI_API_KEY="redactme0123456789abcdef0123"',
      },
    ]);
    const a = anonymize(input).session;
    const b = anonymize(a).session;
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("walks nested tool_call args and results", () => {
    const r = anonymize(
      s([
        {
          kind: "tool_call",
          at: "t",
          name: "bash",
          args: { cmd: "echo ghp_abcdefghijklmnopqrst6789" },
          result: { stdout: "user@example.com" },
        },
      ]),
    );
    expect(r.report.byCategory.secret).toBeGreaterThanOrEqual(1);
    expect(r.report.byCategory.email).toBe(1);
  });
});

describe("anonymize: entropy guard (suspects)", () => {
  it("flags high-entropy tokens that survived the named detectors", () => {
    // A token shaped like a credential but not matching any known prefix:
    // mixed-class, length 40, near-uniform random base.
    const mystery = "Zk9Q3xV7uR2pL8nA4mF6yE1tQ0wB5sX9hJ8aD2cG";
    const r = anonymize(s([{ kind: "completion", at: "t", text: `secret=${mystery}` }]));
    // It might or might not be redacted by ENV_KV depending on quoting;
    // what matters is that if it survives, the suspects array catches it.
    if (r.report.byCategory.secret === 0) {
      expect(r.report.suspects.length).toBeGreaterThanOrEqual(1);
      expect(r.report.suspects[0]?.entropy).toBeGreaterThan(4);
    }
  });

  it("does NOT flag prose, short tokens, or pure-letter words", () => {
    const r = anonymize(
      s([
        {
          kind: "prompt",
          at: "t",
          text:
            "The supercalifragilisticexpialidocious authentication scheme is conceptually similar to standard bearer flows.",
        },
      ]),
    );
    expect(r.report.suspects).toEqual([]);
  });

  it("ignores already-redacted markers", () => {
    const r = anonymize(
      s([{ kind: "completion", at: "t", text: "key=" + "sk-ant-abcdefghijklmnop012m" }]),
    );
    // The token gets replaced with <redacted:anthropic> — entropy scanner
    // strips redaction markers before checking, so no false-positive
    // suspect on the marker itself.
    expect(r.report.suspects).toEqual([]);
  });

  it("does NOT flag long file paths (slashes break tokens)", () => {
    // Real false positive observed against jankarlo.faris's prompts:
    // "/Users/anon/Documents/Codex/2026-05-24/files-mentioned-by-the-user-contrato"
    // was matched as a single 75-char high-entropy token. Excluding `/` from
    // TOKEN_RE means each path segment is scanned independently and none are
    // long enough to clear the 24-char minimum.
    const r = anonymize(
      s([
        {
          kind: "prompt",
          at: "t",
          text:
            "see /Users/jan/Documents/Codex/2026-05-24/files-mentioned-by-the-user-contrato/draft.md",
        },
      ]),
    );
    expect(r.report.suspects).toEqual([]);
  });

  it("masks Vercel dpl_* deployment IDs as a named category", () => {
    // Vercel deployment IDs are public, but they're 28-char alnum tokens
    // that easily clear the entropy threshold. Naming them as a known
    // category keeps the suspects array clean against real Trail bundles.
    const r = anonymize(
      s([
        {
          kind: "tool_call",
          at: "t",
          name: "get_deployment",
          args: { id: "dpl_8Yjf4BUMaZku34zmxGPGbEU9atiA" },
        },
      ]),
    );
    expect(r.report.suspects).toEqual([]);
    // It's masked, not surfaced as a 'secret' (it isn't one).
    expect(r.report.total).toBeGreaterThan(0);
  });
});
