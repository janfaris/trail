import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const findFirst = vi.fn();
  const accountFindFirst = vi.fn();
  const userFindFirst = vi.fn();
  const orderBy = vi.fn();
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy,
  };
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const update = vi.fn().mockReturnValue({ set: updateSet });
  const create = vi.fn();
  const verifyShipped = vi.fn();
  return {
    findFirst,
    accountFindFirst,
    userFindFirst,
    orderBy,
    selectChain,
    update,
    updateSet,
    create,
    verifyShipped,
  };
});

vi.mock("../db/client", () => ({
  db: {
    query: {
      trailSession: { findFirst: mocks.findFirst },
      account: { findFirst: mocks.accountFindFirst },
      user: { findFirst: mocks.userFindFirst },
    },
    select: vi.fn().mockReturnValue(mocks.selectChain),
    update: mocks.update,
  },
  schema: {
    trailSession: { id: "id", slug: "slug" },
    event: { sessionId: "sessionId", idx: "idx", kind: "kind", data: "data" },
  },
}));

vi.mock("./ai-client", () => ({
  aiClient: () => ({ chat: { completions: { create: mocks.create } } }),
  textModel: () => "test-model",
}));

vi.mock("./github-verify", () => ({
  verifyShipped: (...args: unknown[]) => mocks.verifyShipped(...args),
}));

const {
  findFirst,
  accountFindFirst,
  userFindFirst,
  orderBy,
  selectChain,
  update,
  updateSet,
  create,
  verifyShipped,
} = mocks;

// --- validator spy ----------------------------------------------------------
import * as validatorModule from "./receipt-validator";
const validateSpy = vi.spyOn(validatorModule, "validateReceipt");

import { generateReceipt } from "./receipt-generator";

function llmJson(overrides: Record<string, unknown> = {}) {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            outcome: "Added Stripe checkout with webhook retry.",
            tldr: "Shipped Stripe checkout.",
            decisionSummary: [
              "Picked Stripe over Lemon Squeezy for PR market",
              "Idempotent webhook handler keyed on event id",
              "Verified locally with stripe-cli listen",
            ],
            changedFiles: ["app/api/checkout/route.ts", "lib/stripe.ts"],
            keyPromptIdxs: [0, 1, 2],
            ...overrides,
          }),
        },
      },
    ],
  };
}

describe("generateReceipt", () => {
  beforeEach(() => {
    mocks.findFirst.mockReset();
    mocks.accountFindFirst.mockReset();
    mocks.userFindFirst.mockReset();
    mocks.selectChain.orderBy.mockReset();
    mocks.update.mockClear();
    mocks.updateSet.mockClear();
    mocks.create.mockReset();
    mocks.verifyShipped.mockReset();
    validateSpy.mockClear();
    // Default owner identity for the commit-linked cases.
    mocks.accountFindFirst.mockResolvedValue({ accessToken: "tok", accountId: "123" });
    mocks.userFindFirst.mockResolvedValue({ handle: "octocat" });
  });

  it("runs the validator and persists 'shipped' when GitHub confirms merge", async () => {
    findFirst.mockResolvedValue({
      id: "s1",
      slug: "abc",
      title: "Checkout work",
      summary: "",
      userId: "u1",
      linkedRepo: "owner/repo",
      linkedCommitSha: "deadbee",
    });
    selectChain.orderBy.mockResolvedValue([
      { idx: 0, kind: "prompt", data: { text: "Add Stripe" } },
      { idx: 1, kind: "tool", data: { name: "edit" } },
      { idx: 2, kind: "prompt", data: { text: "Wire webhook" } },
    ]);
    create.mockResolvedValue(llmJson());
    verifyShipped.mockResolvedValue({ shipped: true, reason: "merged-and-owned" });

    const result = await generateReceipt("s1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe("shipped");
    expect(validateSpy).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    const persisted = updateSet.mock.calls[0][0];
    expect(persisted.receiptStatus).toBe("shipped");
    expect(persisted.receiptOutcome).toContain("Stripe");
    expect(persisted.receiptDecisionSummary).toHaveLength(3);
    // The owner's token + identity must be threaded into verification.
    expect(verifyShipped).toHaveBeenCalledWith("owner/repo", "deadbee", {
      userToken: "tok",
      owner: { githubId: 123, login: "octocat" },
    });
  });

  it("returns 'draft' when commit linked but not merged", async () => {
    findFirst.mockResolvedValue({
      id: "s2",
      slug: "abc",
      title: "x",
      summary: "",
      userId: "u1",
      linkedRepo: "owner/repo",
      linkedCommitSha: "deadbee",
    });
    selectChain.orderBy.mockResolvedValue([{ idx: 0, kind: "prompt", data: { text: "go" } }]);
    create.mockResolvedValue(llmJson());
    verifyShipped.mockResolvedValue({ shipped: false, reason: "not-on-default" });

    const result = await generateReceipt("s2");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe("draft");
  });

  it("returns 'unverified' when no commit is linked", async () => {
    findFirst.mockResolvedValue({
      id: "s3",
      slug: "abc",
      title: "x",
      summary: "",
      linkedRepo: null,
      linkedCommitSha: null,
    });
    selectChain.orderBy.mockResolvedValue([{ idx: 0, kind: "prompt", data: { text: "go" } }]);
    create.mockResolvedValue(llmJson());

    const result = await generateReceipt("s3");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe("unverified");
    expect(verifyShipped).not.toHaveBeenCalled();
  });

  it("surfaces validator warnings without rewriting LLM output", async () => {
    findFirst.mockResolvedValue({
      id: "s4",
      slug: "abc",
      title: "x",
      summary: "",
      linkedRepo: null,
      linkedCommitSha: null,
    });
    selectChain.orderBy.mockResolvedValue([{ idx: 0, kind: "prompt", data: { text: "go" } }]);
    create.mockResolvedValue(
      llmJson({
        outcome: "Leveraged Stripe for seamless checkout.",
        decisionSummary: ["one", "two", "three"],
      }),
    );

    const result = await generateReceipt("s4");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual(
      expect.arrayContaining(["banned-phrase:leveraged", "banned-phrase:seamless"]),
    );
    // Verify we DID NOT rewrite: persisted outcome still contains banned word.
    const persisted = updateSet.mock.calls[0][0];
    expect(persisted.receiptOutcome).toContain("Leveraged");
  });

  it("returns no-events when session has no events", async () => {
    findFirst.mockResolvedValue({ id: "s5", slug: "abc", title: "x", summary: "" });
    selectChain.orderBy.mockResolvedValue([]);
    const result = await generateReceipt("s5");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no-events");
  });
});
