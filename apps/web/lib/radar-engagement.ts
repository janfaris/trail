// Shared definition of Trail Pick reaction kinds, used by the radar engagement
// API routes, the feed loader, and the feed engagement client component.

export const RADAR_REACTION_KINDS = ["fire", "eyes", "building"] as const;
export type RadarReactionKind = (typeof RADAR_REACTION_KINDS)[number];

export function isRadarReactionKind(value: unknown): value is RadarReactionKind {
  return typeof value === "string" && (RADAR_REACTION_KINDS as readonly string[]).includes(value);
}

export type RadarReactionMeta = {
  kind: RadarReactionKind;
  emoji: string;
  label: string;
  hint: string;
};

export const RADAR_REACTION_META: RadarReactionMeta[] = [
  { kind: "fire", emoji: "🔥", label: "Fire", hint: "This is a big deal" },
  { kind: "eyes", emoji: "👀", label: "Watching", hint: "Keeping an eye on this" },
  { kind: "building", emoji: "🛠️", label: "Building", hint: "I'm building with this" },
];

export function emptyRadarReactionCounts(): Record<RadarReactionKind, number> {
  return { fire: 0, eyes: 0, building: 0 };
}
