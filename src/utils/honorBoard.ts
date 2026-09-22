import { calculateStudentReputation } from "./algorithms";

export interface BaghdadCycleInfo {
  monthStartUTC: Date;
  nextMonthStartUTC: Date;
  prevMonthStartUTC: Date;
  effectiveCutoffUTC: Date;
  nextCutoffUTC: Date;
  hoursUntilUpdate: number;
  minutesUntilUpdate: number;
  daysLeftInMonth: number;
  monthNameAr: string;
  monthNameEn: string;
}

/**
 * Calculates current Baghdad cycle information:
 * - Baghdad is UTC+3 (GMT+3 year-round, no DST).
 * - 24-hour update cutoff is at 4:00 PM Baghdad time (13:00 UTC).
 * - Monthly reset is at the 1st of each calendar month (00:00 Baghdad time).
 */
export function getBaghdadCycleInfo(): BaghdadCycleInfo {
  const now = new Date();
  const baghdadOffsetMs = 3 * 60 * 60 * 1000;
  const baghdadNow = new Date(now.getTime() + baghdadOffsetMs);

  const year = baghdadNow.getUTCFullYear();
  const month = baghdadNow.getUTCMonth(); // 0-indexed

  // 1. Month Bounds in UTC
  const monthStartUTC = new Date(Date.UTC(year, month, 1, 0, 0, 0) - baghdadOffsetMs);
  const nextMonthStartUTC = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0) - baghdadOffsetMs);
  const prevMonthStartUTC = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0) - baghdadOffsetMs);

  // 2. 24h Cycle Cutoff at 4:00 PM Baghdad (13:00 UTC)
  const targetTodayUTC = new Date(Date.UTC(year, month, baghdadNow.getUTCDate(), 13, 0, 0));

  let lastCutoffUTC: Date;
  let nextCutoffUTC: Date;

  if (now.getTime() >= targetTodayUTC.getTime()) {
    lastCutoffUTC = targetTodayUTC;
    nextCutoffUTC = new Date(targetTodayUTC.getTime() + 24 * 60 * 60 * 1000);
  } else {
    lastCutoffUTC = new Date(targetTodayUTC.getTime() - 24 * 60 * 60 * 1000);
    nextCutoffUTC = targetTodayUTC;
  }

  // Ensure effective cutoff is not before current month start
  const effectiveCutoffUTC = lastCutoffUTC.getTime() < monthStartUTC.getTime() ? monthStartUTC : lastCutoffUTC;

  const msUntilUpdate = Math.max(0, nextCutoffUTC.getTime() - now.getTime());
  const hoursUntilUpdate = Math.floor(msUntilUpdate / (1000 * 60 * 60));
  const minutesUntilUpdate = Math.floor((msUntilUpdate % (1000 * 60 * 60)) / (1000 * 60));

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const daysLeftInMonth = Math.max(0, daysInMonth - baghdadNow.getUTCDate());

  const monthNameAr = baghdadNow.toLocaleDateString("ar-IQ", { month: "long", year: "numeric", timeZone: "Asia/Baghdad" });
  const monthNameEn = baghdadNow.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "Asia/Baghdad" });

  return {
    monthStartUTC,
    nextMonthStartUTC,
    prevMonthStartUTC,
    effectiveCutoffUTC,
    nextCutoffUTC,
    hoursUntilUpdate,
    minutesUntilUpdate,
    daysLeftInMonth,
    monthNameAr,
    monthNameEn,
  };
}

export interface HonorStudentData {
  username: string;
  rank: number;
  isTop10: boolean;
  isOwnerGranted: boolean;
  totalLikes: number;
  totalDislikes: number;
  reviewsCount: number;
  postsCount: number;
  approvalRate: number;
  reputationScore: number;
}

export interface HonorBadgeInfo {
  isTop10: boolean;
  isOwnerGranted: boolean;
  rank?: number;
}

/**
 * Calculates Student Honor Board rankings based on:
 * - Current calendar month posts/reviews/comments only (monthly reset).
 * - Activity created before the latest 4:00 PM Baghdad cutoff (24h update cycle).
 * - Assigns Top 10 badges to ranks 1 through 10.
 * - Merges owner-granted honor badges from database profiles.
 */
function calculateStudentStats(
  allUsernames: string[],
  scopedPosts: any[],
  profiles: Record<string, any>
): HonorStudentData[] {
  return allUsernames.map(username => {
    const userPosts = scopedPosts.filter(p => p.author === username);
    const userLikes = userPosts.reduce((sum, p) => sum + (p.likes || 0), 0);
    const userDislikes = userPosts.reduce((sum, p) => sum + (p.dislikes || 0), 0);
    const userReviews = userPosts.filter(p => p.grade_level?.includes("تقييم أستاذ") || p.teacher_id || p.teacherId).length;

    let userCommentLikes = 0;
    for (const post of scopedPosts) {
      if (Array.isArray(post.comments)) {
        for (const c of post.comments) {
          if (c.author === username) {
            userCommentLikes += (c.likes || 0);
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

    const isOwnerGranted = Boolean(profiles[username]?.has_honor_badge);

    return {
      username,
      rank: 0,
      isTop10: false,
      isOwnerGranted,
      totalLikes: userLikes,
      totalDislikes: userDislikes,
      reviewsCount: userReviews,
      postsCount: userPosts.length,
      approvalRate,
      reputationScore,
    };
  })
  .filter(s => s.postsCount > 0 || s.totalLikes > 0 || s.reputationScore > 0 || s.isOwnerGranted)
  .sort((a, b) => b.reputationScore - a.reputationScore || b.totalLikes - a.totalLikes);
}

/**
 * Calculates Student Honor Board rankings based on:
 * - Current calendar month posts/reviews/comments only (monthly reset).
 * - Activity created before the latest 4:00 PM Baghdad cutoff (24h update cycle).
 * - Top 10 students receive the Honor badge.
 * - Previous month Top 10 winners retain their Honor badge through the new month.
 * - Merges owner-granted honor badges from database profiles.
 */
export function computeStudentHonorBoard(
  allUsernames: string[],
  posts: any[],
  profiles: Record<string, any>,
  cycleInfo: BaghdadCycleInfo
): {
  rankedStudents: HonorStudentData[];
  badgeMap: Record<string, HonorBadgeInfo>;
} {
  const monthStartMs = cycleInfo.monthStartUTC.getTime();
  const cutoffMs = cycleInfo.effectiveCutoffUTC.getTime();
  const prevMonthStartMs = cycleInfo.prevMonthStartUTC.getTime();

  // 1. Current active month posts up to 4:00 PM Baghdad cutoff (points added/reduced every 24h)
  const currentCyclePosts = posts.filter(p => {
    const postTime = new Date(p.created_at).getTime();
    return postTime >= monthStartMs && postTime <= cutoffMs;
  });

  const rankedStudents = calculateStudentStats(allUsernames, currentCyclePosts, profiles);

  // 2. Assign ranks for current active cycle leaderboard
  rankedStudents.forEach((student, index) => {
    const rank = index + 1;
    student.rank = rank;
    student.isTop10 = rank <= 10;
  });

  const badgeMap: Record<string, HonorBadgeInfo> = {};

  // 3. Honor previous completed month Top 10 winners (they earned the monthly badge)
  const prevMonthPosts = posts.filter(p => {
    const postTime = new Date(p.created_at).getTime();
    return postTime >= prevMonthStartMs && postTime < monthStartMs;
  });

  if (prevMonthPosts.length > 0) {
    const prevMonthRanked = calculateStudentStats(allUsernames, prevMonthPosts, profiles);
    prevMonthRanked.slice(0, 10).forEach((student, index) => {
      badgeMap[student.username] = {
        isTop10: true,
        isOwnerGranted: Boolean(profiles[student.username]?.has_honor_badge),
        rank: index + 1,
      };
    });
  }

  // 4. Merge users who were explicitly granted the Honor badge by the owner
  Object.keys(profiles).forEach(uname => {
    if (profiles[uname]?.has_honor_badge) {
      if (badgeMap[uname]) {
        badgeMap[uname].isOwnerGranted = true;
      } else {
        badgeMap[uname] = {
          isTop10: false,
          isOwnerGranted: true,
        };
      }
    }
  });

  return { rankedStudents, badgeMap };
}
