export const CATEGORIES = [
  { id: "relationships", label: "Relationships" },
  { id: "life", label: "Life" },
  { id: "career", label: "Career" },
  { id: "education", label: "Education" },
  { id: "mathematics", label: "Mathematics" },
  { id: "technology", label: "Technology" },
  { id: "business", label: "Business" },
  { id: "health", label: "Health" },
  { id: "home", label: "Home" },
  { id: "other", label: "Other" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export type QuestionKind = "experience" | "knowledge";

const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));

export function isCategory(value: string): value is CategoryId {
  return CATEGORY_IDS.has(value);
}

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? "Other";
}

export function kindLabel(kind: QuestionKind): string {
  return kind === "knowledge" ? "Knowledge" : "Experience";
}

export function reputationLabel(points: number): string {
  if (points >= 60) return "Guide";
  if (points >= 30) return "Trusted";
  if (points >= 10) return "Helper";
  return "New voice";
}

export function formatWhen(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const seconds = Math.max(0, Date.now() - t) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(t).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export type QuestionCard = {
  id: number;
  title: string;
  body: string;
  category: string;
  kind: QuestionKind;
  authorName: string;
  reputation: number;
  answerCount: number;
  isMine: boolean;
  /** Hidden by moderators; only the asker still sees it. */
  hidden: boolean;
  createdAt: string;
  /** When the asker last edited it, or null. */
  editedAt: string | null;
  /** Photos attached to the question, in order. */
  images: ImageRef[];
  /** The asker's profile photo URL, or null. */
  authorAvatar: string | null;
};

export type QuestionPage = {
  items: QuestionCard[];
  /** Pass back as `cursor` to load the next page; null on the last page. */
  nextCursor: string | null;
};

/** A stored photo: public URL plus its size, so layouts don't jump while it loads. */
export type ImageRef = {
  /** Present on photos the viewer can re-attach (their own, when editing). */
  id?: number;
  url: string;
  width: number;
  height: number;
};

/** A photo the member just uploaded, ready to attach to a post. */
export type UploadedImage = ImageRef & { id: number };

export type AnswerCard = {
  id: number;
  body: string;
  authorName: string;
  helpful: number;
  isBest: boolean;
  isMine: boolean;
  voted: boolean;
  createdAt: string;
  images: ImageRef[];
  /** The author's profile photo URL, or null. */
  authorAvatar: string | null;
};

export type AiMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

export type AiThread = {
  id: number;
  title: string;
  updatedAt: string;
};

export type MineQuestion = {
  id: number;
  title: string;
  answerCount: number;
  hidden: boolean;
  createdAt: string;
  editedAt: string | null;
};

export type MineAnswer = {
  id: number;
  questionId: number;
  questionTitle: string;
  helpful: number;
  isBest: boolean;
  createdAt: string;
};

export type ProfileData = {
  displayName: string;
  reputation: number;
  /** Profile photo URL, or null. */
  avatarUrl: string | null;
  questions: MineQuestion[];
  answers: MineAnswer[];
};

/** Window event that tells the header bell to refresh its unread count. */
export const NOTIFICATIONS_CHANGED = "telitol:notifications-changed";
