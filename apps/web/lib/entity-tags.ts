// Pure helpers for the public "Tools & Frameworks" entity pages
// (/tools/[slug], /frameworks/[slug] and their index pages). Kept free of DB
// and Next imports so the ranking/summary logic is trivially unit-testable and
// stays in sync with the SQL in lib/entity-queries.ts.
//
// Data flows from the `session_tag` projection JOINed to public `trail_session`
// rows. These helpers decide how those rows are scored and ordered so the pages
// surface "best tools grounded in proof" rather than raw volume alone.

import { canonicalLabel } from "./tags";

export type EntityKind = "tool" | "framework";

/** URL segment for each kind. */
export const KIND_PLURAL: Record<EntityKind, string> = {
  tool: "tools",
  framework: "frameworks",
};

/** Human label for the kind, e.g. for headings. */
export const KIND_NOUN: Record<EntityKind, string> = {
  tool: "tool",
  framework: "framework",
};

/** Canonical detail-page href for an entity. */
export function entityHref(kind: EntityKind, slug: string): string {
  return `/${KIND_PLURAL[kind]}/${slug}`;
}

/** Public session permalink. Mirrors the /u/[user]/[slug] route. */
export function sessionHref(handle: string, slug: string): string {
  return `/u/${handle}/${slug}`;
}

/**
 * Prefer the stored display label (chosen via mode() in SQL so it's the most
 * frequent variant) but fall back to the deterministic canonical label derived
 * from the slug. Guards against null/empty labels surfacing in titles.
 */
export function displayLabel(slug: string, storedLabel?: string | null): string {
  const trimmed = (storedLabel ?? "").trim();
  if (trimmed) return trimmed;
  return canonicalLabel(slug) || slug;
}

// ---------------------------------------------------------------------------
// Outcome summary
// ---------------------------------------------------------------------------

export type Outcome = "shipped" | "abandoned" | "rabbithole" | "unknown";

export interface OutcomeSummary {
  total: number;
  shipped: number;
  abandoned: number;
  rabbithole: number;
  unknown: number;
  /** shipped / total in [0,1]; 0 when total is 0. */
  shippedRate: number;
}

function classifyOutcome(outcome: string | null | undefined): Outcome {
  switch (outcome) {
    case "shipped":
      return "shipped";
    case "abandoned":
      return "abandoned";
    case "rabbithole":
      return "rabbithole";
    default:
      return "unknown";
  }
}

export function summarizeOutcomes(rows: readonly { outcome: string | null }[]): OutcomeSummary {
  let shipped = 0;
  let abandoned = 0;
  let rabbithole = 0;
  let unknown = 0;
  for (const r of rows) {
    switch (classifyOutcome(r.outcome)) {
      case "shipped":
        shipped++;
        break;
      case "abandoned":
        abandoned++;
        break;
      case "rabbithole":
        rabbithole++;
        break;
      default:
        unknown++;
        break;
    }
  }
  const total = rows.length;
  return {
    total,
    shipped,
    abandoned,
    rabbithole,
    unknown,
    shippedRate: total ? shipped / total : 0,
  };
}

/**
 * Bayesian-smoothed shipped rate so a single 1/1 entity doesn't outrank a
 * well-proven 20/30 one. Pulls sparse rates toward the global mean.
 */
export function smoothedShippedRate(
  shipped: number,
  total: number,
  priorMean = 0.5,
  priorWeight = 4,
): number {
  if (total <= 0) return 0;
  return (shipped + priorMean * priorWeight) / (total + priorWeight);
}

// ---------------------------------------------------------------------------
// Detail-page session ranking
// ---------------------------------------------------------------------------

/** Minimal shape rankEntitySessions needs; real rows carry more columns. */
export interface RankableEntitySession {
  id: string;
  outcome: string | null;
  receiptStatus: string | null;
  startedAt: Date | string;
  sharedAt: Date | string | null;
  /** 'worked' + 'worked-verified' reaction count. */
  positiveReactions: number;
  /** 'needs-tweak' + 'broken' reaction count. */
  negativeReactions: number;
}

function outcomeWeight(outcome: string | null): number {
  switch (classifyOutcome(outcome)) {
    case "shipped":
      return 3;
    case "rabbithole":
      return 1;
    case "abandoned":
      return 0;
    default:
      return 1;
  }
}

/**
 * Proof score for a single session under an entity. Rewards verified-shipped
 * receipts and positive peer reactions; penalizes "broken"/"needs-tweak" so a
 * widely-flagged session can't coast on a shipped flag alone.
 */
export function sessionScore(row: RankableEntitySession): number {
  const receipt = row.receiptStatus === "shipped" ? 2 : 0;
  return (
    row.positiveReactions * 2 - row.negativeReactions * 1.5 + outcomeWeight(row.outcome) + receipt
  );
}

function toTime(value: Date | string | null | undefined): number {
  if (value == null) return Number.NEGATIVE_INFINITY;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

function rankTime(row: RankableEntitySession): number {
  const shared = toTime(row.sharedAt);
  if (shared !== Number.NEGATIVE_INFINITY) return shared;
  return toTime(row.startedAt);
}

/**
 * Order sessions by proof score desc, then recency (coalesce(sharedAt,
 * startedAt)) desc, then id desc as a deterministic tie-break. Never mutates
 * the input.
 */
export function rankEntitySessions<T extends RankableEntitySession>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const s = sessionScore(b) - sessionScore(a);
    if (s !== 0) return s;
    const t = rankTime(b) - rankTime(a);
    if (t !== 0) return t;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

// ---------------------------------------------------------------------------
// Index-page entity ranking
// ---------------------------------------------------------------------------

export interface EntityStat {
  tag: string;
  label: string | null;
  sessions: number;
  builders: number;
  shipped: number;
}

/**
 * Index ordering is honest "most used" first (sessions desc) — the primary
 * proof of real usage — with smoothed shipped rate as the tie-break so equally
 * popular entities surface the more-proven one first. Label is the final stable
 * tie-break.
 */
export function rankEntities<T extends EntityStat>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (b.sessions !== a.sessions) return b.sessions - a.sessions;
    const ra = smoothedShippedRate(a.shipped, a.sessions);
    const rb = smoothedShippedRate(b.shipped, b.sessions);
    if (rb !== ra) return rb - ra;
    return displayLabel(a.tag, a.label).localeCompare(displayLabel(b.tag, b.label));
  });
}

// ---------------------------------------------------------------------------
// Top builders rollup (detail page)
// ---------------------------------------------------------------------------

export interface BuilderRowInput {
  handle: string | null;
  name: string | null;
  image: string | null;
  outcome: string | null;
}

export interface BuilderStat {
  handle: string;
  name: string | null;
  image: string | null;
  sessions: number;
  shipped: number;
}

/**
 * Roll the session rows up by builder handle, counting sessions and shipped
 * outcomes. Sorted by sessions desc, shipped desc, handle asc.
 */
export function topBuilders(rows: readonly BuilderRowInput[], limit = 8): BuilderStat[] {
  const map = new Map<string, BuilderStat>();
  for (const r of rows) {
    if (!r.handle) continue;
    const cur = map.get(r.handle) ?? {
      handle: r.handle,
      name: r.name,
      image: r.image,
      sessions: 0,
      shipped: 0,
    };
    cur.sessions++;
    if (classifyOutcome(r.outcome) === "shipped") cur.shipped++;
    map.set(r.handle, cur);
  }
  return [...map.values()]
    .sort(
      (a, b) =>
        b.sessions - a.sessions || b.shipped - a.shipped || a.handle.localeCompare(b.handle),
    )
    .slice(0, limit);
}
