/**
 * Student Honor Board & Badge System
 * - Daily snapshot updates every 24h at 4:00 PM Baghdad time (UTC+3)
 * - Monthly leaderboard reset cycle (calendar month season)
 * - Top 10 ranked students automatically receive the Student Honor Badge
 * - Platform Owner can grant or revoke the badge for any user directly from their profile
 */

import { calculateStudentReputation } from "@/utils/algorithms";

export interface HonorBadgeRecord {
  username: string;
  awardedAt: string; // ISO string
  source: "leaderboard_top10" | "owner";
  awardedBy?: string; // username of owner if granted manually
  monthKey?: string; // e.g. "2026-09"
  rank?: number; // 1-10 if from leaderboard
  note?: string;
}

export interface HonorStudent {
  username: string;
  profile: {
    avatarColor: string;
    avatarUrl?: string;
    bio: string;
  };
  totalLikes: number;
  totalDislikes: number;
  reviewsCount: number;
  postsCount: number;
  approvalRate: number;
  reputationScore: number;
  rank: number;
  hasHonorBadge: boolean;
}

export interface BaghdadCycleInfo {
  cycleId: string; // e.g. "2026-09-22-16:00"
  monthKey: string; // e.g. "2026-09"
  monthNameEn: string;
  monthNameAr: string;
  lastUpdateDateStr: string;
  nextUpdateDateStr: string;
  lastUpdateUtc: number;
  nextUpdateUtc: number;
  msUntilNextUpdate: number;
  hoursUntilNextUpdate: number;
  minutesUntilNextUpdate: number;
  startOfMonthUtc: number;
}

const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const MONTH_NAMES_AR = [
  "كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران",
  "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"
];

const BAGHDAD_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3 (Iraq Standard Time)

/**
 * Calculates the current 24-hour cycle anchored at 4:00 PM Baghdad time,
 * along with the monthly season boundaries.
 */
export function getBaghdadCycleInfo(referenceDate = new Date()): BaghdadCycleInfo {
  const refTime = referenceDate.getTime();
  const baghdadTime = new Date(refTime + BAGHDAD_OFFSET_MS);

  const bYear = baghdadTime.getUTCFullYear();
  const bMonth = baghdadTime.getUTCMonth(); // 0 - 11
  const bDay = baghdadTime.getUTCDate();
  const bHour = baghdadTime.getUTCHours();

  // Month season key
  const monthKey = `${bYear}-${String(bMonth + 1).padStart(2, "0")}`;
  const monthNameEn = `${MONTH_NAMES_EN[bMonth]} ${bYear}`;
  const monthNameAr = `${MONTH_NAMES_AR[bMonth]} ${bYear}`;

  // Start of current month in UTC (Baghdad midnight on 1st of month)
  const startOfMonthUtc = Date.UTC(bYear, bMonth, 1, 0, 0, 0) - BAGHDAD_OFFSET_MS;

  // 4:00 PM Baghdad time = 16:00 AST = 13:00 UTC (16 - 3 = 13)
  let lastUpdateYear = bYear;
  let lastUpdateMonth = bMonth;
  let lastUpdateDay = bDay;

  let nextUpdateYear = bYear;
  let nextUpdateMonth = bMonth;
  let nextUpdateDay = bDay;

  if (bHour >= 16) {
    // Current time is past 4:00 PM today.
    // Last update was today at 16:00 Baghdad (13:00 UTC).
    // Next update is tomorrow at 16:00 Baghdad (13:00 UTC).
    const tomorrow = new Date(Date.UTC(bYear, bMonth, bDay + 1, 0, 0, 0));
    nextUpdateYear = tomorrow.getUTCFullYear();
    nextUpdateMonth = tomorrow.getUTCMonth();
    nextUpdateDay = tomorrow.getUTCDate();
  } else {
    // Current time is before 4:00 PM today.
    // Last update was yesterday at 16:00 Baghdad (13:00 UTC).
    // Next update is today at 16:00 Baghdad (13:00 UTC).
    const yesterday = new Date(Date.UTC(bYear, bMonth, bDay - 1, 0, 0, 0));
    lastUpdateYear = yesterday.getUTCFullYear();
    lastUpdateMonth = yesterday.getUTCMonth();
    lastUpdateDay = yesterday.getUTCDate();
  }

  const lastUpdateUtc = Date.UTC(lastUpdateYear, lastUpdateMonth, lastUpdateDay, 13, 0, 0);
  const nextUpdateUtc = Date.UTC(nextUpdateYear, nextUpdateMonth, nextUpdateDay, 13, 0, 0);

  const msUntilNextUpdate = Math.max(0, nextUpdateUtc - refTime);
  const totalMinutes = Math.floor(msUntilNextUpdate / (1000 * 60));
  const hoursUntilNextUpdate = Math.floor(totalMinutes / 60);
  const minutesUntilNextUpdate = totalMinutes % 60;

  const cycleId = `${lastUpdateYear}-${String(lastUpdateMonth + 1).padStart(2, "0")}-${String(lastUpdateDay).padStart(2, "0")}-16:00`;

  return {
    cycleId,
    monthKey,
    monthNameEn,
    monthNameAr,
    lastUpdateDateStr: `${lastUpdateYear}/${lastUpdateMonth + 1}/${lastUpdateDay} 16:00`,
    nextUpdateDateStr: `${nextUpdateYear}/${nextUpdateMonth + 1}/${nextUpdateDay} 16:00`,
    lastUpdateUtc,
    nextUpdateUtc,
    msUntilNextUpdate,
    hoursUntilNextUpdate,
    minutesUntilNextUpdate,
    startOfMonthUtc,
  };
}

// ─── Local Storage Keys ──────────────────────────────────────────────
const HONOR_BADGES_KEY = "honor_badges_registry_v1";
const HONOR_SNAPSHOT_KEY = "honor_board_snapshot_v1";

/**
 * Retrieves the persisted map of all awarded honor badges.
 */
export function getHonorBadges(): Record<string, HonorBadgeRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(HONOR_BADGES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Saves a badge record into the persistent registry.
 */
export function saveHonorBadge(record: HonorBadgeRecord): void {
  if (typeof window === "undefined") return;
  try {
    const badges = getHonorBadges();
    badges[record.username] = record;
    localStorage.setItem(HONOR_BADGES_KEY, JSON.stringify(badges));
  } catch {}
}

/**
 * Removes a badge record for a given user.
 */
export function removeHonorBadge(username: string): void {
  if (typeof window === "undefined") return;
  try {
    const badges = getHonorBadges();
    delete badges[username];
    localStorage.setItem(HONOR_BADGES_KEY, JSON.stringify(badges));
  } catch {}
}

/**
 * Checks if a user possesses the Student Honor Badge.
 */
export function hasUserHonorBadge(
  username: string,
  badgesMap?: Record<string, HonorBadgeRecord>
): boolean {
  if (!username) return false;
  const badges = badgesMap || getHonorBadges();
  return !!badges[username];
}

/**
 * Computes the ranked Honor Board for the current monthly season
 * and takes a 24-hour frozen snapshot based on Baghdad 4:00 PM time.
 */
export function buildHonorBoardSnapshot({
  posts,
  profiles,
  usernames,
  cycleInfo,
}: {
  posts: any[];
  profiles: Record<string, any>;
  usernames: string[];
  cycleInfo: BaghdadCycleInfo;
}): {
  students: HonorStudent[];
  top10: HonorStudent[];
  cycleId: string;
  monthKey: string;
} {
  // Filter activities to the current monthly season and before the 4:00 PM snapshot cutoff.
  // If the monthly cycle is brand new (e.g. day 1) and there are no posts yet in this month,
  // we count contributions from the start of the month cutoff or recent 30-day window so students are shown.
  const monthlyPosts = posts.filter((p) => {
    if (!p.created_at) return true;
    const postTime = new Date(p.created_at).getTime();
    if (isNaN(postTime)) return true;
    // Activity must have occurred in current month and on or before the last 4:00 PM cutoff
    return postTime >= cycleInfo.startOfMonthUtc && postTime <= cycleInfo.lastUpdateUtc + (30 * 60 * 1000);
  });

  // Fallback: If current month has zero posts yet (e.g. first day of new month),
  // fallback to all posts so the board remains populated until new monthly posts arrive.
  const activePosts = monthlyPosts.length > 0 ? monthlyPosts : posts;

  const badges = getHonorBadges();

  const students: HonorStudent[] = usernames
    .map((username) => {
      const userPosts = activePosts.filter((p) => p.author === username);
      const userLikes = userPosts.reduce((sum, p) => sum + (p.likes || 0), 0);
      const userDislikes = userPosts.reduce((sum, p) => sum + (p.dislikes || 0), 0);
      const userReviews = userPosts.filter(
        (p) => p.grade_level?.includes("تقييم أستاذ") || p.teacher_id || p.teacherId
      ).length;

      let userCommentLikes = 0;
      for (const post of activePosts) {
        if (Array.isArray(post.comments)) {
          for (const c of post.comments) {
            if (c.author === username) {
              userCommentLikes += c.likes || 0;
            }
          }
        }
      }

      const { reputationScore, approvalRate } = calculateStudentReputation({
        likes: userLikes,
        dislikes: userDislikes,
        postsCount: userPosts.length,
        reviewsCount: userReviews,
        commentsLikes: userCommentLikes,
      });

      return {
        username,
        profile: profiles[username] || { avatarColor: "#0d9488", bio: "" },
        totalLikes: userLikes,
        totalDislikes: userDislikes,
        reviewsCount: userReviews,
        postsCount: userPosts.length,
        approvalRate,
        reputationScore,
        rank: 0,
        hasHonorBadge: hasUserHonorBadge(username, badges),
      };
    })
    .filter((s) => s.postsCount > 0 || s.totalLikes > 0 || s.reputationScore > 0)
    .sort((a, b) => b.reputationScore - a.reputationScore || b.totalLikes - a.totalLikes)
    .map((s, idx) => ({
      ...s,
      rank: idx + 1,
    }));

  const top10 = students.slice(0, 10);

  // Automatically grant honor badge in registry to top 10 students of this cycle
  top10.forEach((student, index) => {
    if (!badges[student.username]) {
      saveHonorBadge({
        username: student.username,
        awardedAt: new Date().toISOString(),
        source: "leaderboard_top10",
        monthKey: cycleInfo.monthKey,
        rank: index + 1,
        note: `Top 10 contributor in ${cycleInfo.monthNameEn}`,
      });
      student.hasHonorBadge = true;
    }
  });

  return {
    students,
    top10,
    cycleId: cycleInfo.cycleId,
    monthKey: cycleInfo.monthKey,
  };
}
