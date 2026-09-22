/**
 * Algorithmic Ranking & Text Normalization Engine
 * 
 * Provides mathematical models for:
 * 1. Wilson Score Lower Bound (Statistical 95% confidence sorting for teacher quality).
 * 2. Hacker News / Reddit Gravity Decay (Hot sorting for student discussion feed).
 * 3. 7-Day Rolling Interaction Velocity (Trending teachers weekly momentum).
 * 4. Multi-Factor Student Reputation (Leaderboard scoring for helpful contributors).
 * 5. Normalized Arabic Fuzzy Matching (Tokenized, honorific-stripped search).
 */

/**
 * Calculates the lower bound of the Wilson score confidence interval (95% confidence).
 * Standard formula used by Reddit, Steam, and Yelp for quality rating sorting.
 * 
 * Accurately penalizes small sample sizes (e.g. 1 positive vote • 0 negative votes yields ~0.20)
 * while rewarding high positive ratios at high volume (e.g. 98 positive • 2 negative yields ~0.92).
 *
 * @param likes Positive votes
 * @param dislikes Negative votes
 * @param z Standard normal deviate (1.96 = 95% confidence interval)
 * @returns Score between 0 and 1
 */
export function calculateWilsonScore(likes: number, dislikes: number, z = 1.96): number {
  const n = Math.max(0, likes) + Math.max(0, dislikes);
  if (n <= 0) return 0;

  const p = Math.max(0, likes) / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centreAdjusted = p + z2 / (2 * n);
  const varianceTerm = (p * (1 - p) + z2 / (4 * n)) / n;
  const adjustedStd = Math.sqrt(Math.max(0, varianceTerm));

  const lowerBound = (centreAdjusted - z * adjustedStd) / denominator;
  return Math.max(0, Math.min(1, lowerBound));
}

/**
 * Calculates the "Hot" ranking score for community posts using gravity decay.
 * Formula: Score = (NetVotes + Comments * 2) / (AgeInHours + 2)^gravity
 *
 * @param likes Number of post likes
 * @param dislikes Number of post dislikes
 * @param commentsCount Total number of comments
 * @param createdAt Creation ISO string or Date
 * @param gravity Decay exponent (default 1.5)
 * @returns Float score representing hotness
 */
export function calculateHotScore(
  likes: number,
  dislikes: number,
  commentsCount: number,
  createdAt: string | Date,
  gravity = 1.5
): number {
  const netVotes = Math.max(0, (likes || 0) - (dislikes || 0));
  // Community engagement points: Net upvotes + double-weight on active discussion
  const interactionPoints = netVotes + Math.max(0, commentsCount || 0) * 2;

  const postTime = typeof createdAt === "string" ? new Date(createdAt).getTime() : createdAt.getTime();
  const now = Date.now();
  const ageInHours = Math.max(0, (now - postTime) / (1000 * 60 * 60));

  // Time decay with 2-hour grace period in the denominator
  const decay = Math.pow(ageInHours + 2, gravity);

  return interactionPoints / decay;
}

export interface TeacherPostInput {
  created_at: string;
  teacher_id?: string;
  teacherId?: string;
  likes?: number;
  dislikes?: number;
  comments?: unknown[];
}

/**
 * Calculates a rolling 7-day velocity score for trending teachers.
 * Replaces stale all-time counters by strictly measuring recent student interest.
 * 
 * Reviews & discussions in the last 48 hours receive a 2.5x multiplier.
 * Interactions between 3 and 7 days receive a 1.0x baseline multiplier.
 * Interactions older than 7 days are excluded.
 */
export function calculateWeeklyTrendingVelocity(
  teacherId: string,
  teacherLikes: number,
  teacherDislikes: number,
  allPosts: TeacherPostInput[]
): number {
  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

  let velocityScore = 0;

  for (const post of allPosts) {
    const tid = post.teacher_id || post.teacherId;
    if (tid !== teacherId) continue;

    const postTime = new Date(post.created_at).getTime();
    const age = now - postTime;

    // Ignore posts outside the 7-day rolling window
    if (isNaN(age) || age < 0 || age > SEVEN_DAYS_MS) continue;

    const isRecent = age <= TWO_DAYS_MS;
    const recencyMultiplier = isRecent ? 2.5 : 1.0;

    const baseReviewPoints = 5;
    const netVotes = Math.max(0, (post.likes || 0) - (post.dislikes || 0));
    const commentsCount = Array.isArray(post.comments) ? post.comments.length : 0;

    velocityScore += (baseReviewPoints + netVotes * 0.5 + commentsCount * 1.5) * recencyMultiplier;
  }

  // Add small baseline confidence from teacher quality (Wilson score • 5)
  const qualityBaseline = calculateWilsonScore(teacherLikes, teacherDislikes) * 5;

  return Math.round((velocityScore + qualityBaseline) * 10) / 10;
}

export interface StudentReputationInput {
  likes: number;
  dislikes: number;
  postsCount: number;
  reviewsCount: number;
  commentsLikes?: number;
}

/**
 * Calculates student honor leaderboard score.
 * Factors in constructive answers, teacher reviews, discussion quality, and community approval rate.
 */
export function calculateStudentReputation(stats: StudentReputationInput): {
  reputationScore: number;
  approvalRate: number;
} {
  const totalVotes = stats.likes + stats.dislikes;
  const approvalRate = totalVotes > 0 
    ? Math.round((stats.likes / totalVotes) * 100) 
    : (stats.likes > 0 ? 100 : (stats.postsCount > 0 ? 95 : 0));

  const netLikes = Math.max(0, stats.likes - stats.dislikes);
  const reviewsScore = stats.reviewsCount * 4; // In-depth teacher evaluations
  const postsScore = stats.postsCount * 1;
  const commentsScore = (stats.commentsLikes || 0) * 2; // Helpful answers in comments

  // Quality multiplier penalizing spam accounts with low approval rates
  const qualityFactor = totalVotes >= 5 ? Math.max(0.4, approvalRate / 100) : 1.0;

  const rawScore = (netLikes * 1.5 + reviewsScore + postsScore + commentsScore) * qualityFactor;

  return {
    reputationScore: Math.round(rawScore),
    approvalRate,
  };
}

/**
 * Normalizes Arabic text:
 * - Strips diacritics (Tashkeel).
 * - Removes Iraqi academic honorifics (أستاذ, استاذ, ست, دكتور, د., أ., م.).
 * - Unifies Alef variants (أ, إ, آ, ٱ -> ا).
 * - Standardizes Taa Marbouta (ة -> ه).
 * - Standardizes Alef Maksoura (ى -> ي).
 * - Standardizes alternate keyboard encodings (Persian Yeh / Kaf).
 */
export function normalizeArabicText(text: string): string {
  if (!text) return "";

  let normalized = text.trim();

  // Strip Tashkeel
  normalized = normalized.replace(/[\u064B-\u065F\u0670]/g, "");

  // Strip honorific prefixes
  const honorifics = ["أستاذ", "استاذ", "الاستاذ", "الأستاذ", "ست", "الست", "دكتور", "الدكتور", "د.", "أ.", "م."];
  for (const h of honorifics) {
    if (normalized.startsWith(h + " ")) {
      normalized = normalized.slice(h.length + 1).trim();
    }
  }

  // Normalize letters
  normalized = normalized
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\u06CC/g, "ي") // Persian Yeh
    .replace(/\u06A9/g, "ك"); // Persian Kaf

  // Collapse consecutive whitespaces
  normalized = normalized.replace(/\s+/g, " ");

  return normalized.trim().toLowerCase();
}

/**
 * Matches multi-token search queries against candidate attributes.
 * Allows searching by name, subject, and governorate in arbitrary word order.
 * E.g., "حيدر بغداد فيزياء" matches a teacher named "حيدر", subject "فيزياء", in "بغداد".
 */
export function matchesArabicFuzzy(
  query: string,
  ...targetFields: (string | undefined | null)[]
): boolean {
  if (!query || !query.trim()) return true;

  const normalizedQuery = normalizeArabicText(query);
  const queryTokens = normalizedQuery.split(" ").filter(t => t.length > 0);

  if (queryTokens.length === 0) return true;

  // Combine and normalize all candidate target fields
  const combinedTarget = targetFields
    .filter(Boolean)
    .map(field => normalizeArabicText(field as string))
    .join(" ");

  // Ensure every token in query matches somewhere in the target fields
  return queryTokens.every(token => combinedTarget.includes(token));
}
