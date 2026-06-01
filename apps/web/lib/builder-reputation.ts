export interface BuilderReputationInputs {
  publicReceipts: number;
  verifiedShips: number;
  extractedLessons: number;
  lessonSaves: number;
  lessonReuses: number;
  reactions: number;
  comments: number;
  followers: number;
  streakDays?: number;
}

export interface BuilderReputation {
  score: number;
  label: "New signal" | "Proof builder" | "Lesson source" | "Network magnet";
  summary: string;
}

function clampMetric(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function computeBuilderReputation(input: BuilderReputationInputs): BuilderReputation {
  const publicReceipts = clampMetric(input.publicReceipts);
  const verifiedShips = clampMetric(input.verifiedShips);
  const extractedLessons = clampMetric(input.extractedLessons);
  const lessonSaves = clampMetric(input.lessonSaves);
  const lessonReuses = clampMetric(input.lessonReuses);
  const reactions = clampMetric(input.reactions);
  const comments = clampMetric(input.comments);
  const followers = clampMetric(input.followers);
  const streakDays = clampMetric(input.streakDays ?? 0);

  const score =
    publicReceipts * 8 +
    verifiedShips * 18 +
    extractedLessons * 3 +
    lessonSaves * 3 +
    lessonReuses * 7 +
    reactions * 2 +
    comments * 4 +
    followers * 5 +
    Math.min(streakDays, 14) * 2;

  const label: BuilderReputation["label"] =
    score >= 160
      ? "Network magnet"
      : lessonReuses + lessonSaves >= 10 || extractedLessons >= 12
        ? "Lesson source"
        : publicReceipts + verifiedShips + followers >= 5
          ? "Proof builder"
          : "New signal";

  const summary =
    lessonReuses > 0
      ? `${lessonReuses} lesson ${lessonReuses === 1 ? "reuse" : "reuses"} from other builders`
      : extractedLessons > 0
        ? `${extractedLessons} reusable ${extractedLessons === 1 ? "lesson" : "lessons"} extracted`
        : publicReceipts > 0
          ? `${publicReceipts} public ${publicReceipts === 1 ? "receipt" : "receipts"} published`
          : "Publish receipts and reusable moves to build signal";

  return { score, label, summary };
}
