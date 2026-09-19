interface Post {
  id: string;
  grade_level: string; // e.g., "السادس إعدادي", "الثالث متوسط", or "General"
  content: string;
  score: number; // engagement score (likes + comments)
}

/**
 * Section 8: The 70/30 Weighted Feed Algorithm
 * 
 * Mixes the user's 2 preferred grades (~70%) with other grades (~30%),
 * while always including "General" posts (0% penalty).
 */
export function buildPersonalizedFeed(allPosts: Post[], preferredGrades: string[]): Post[] {
  // 1. Separate into buckets
  const generalPosts = allPosts.filter(p => p.grade_level === "General");
  const preferredPosts = allPosts.filter(p => preferredGrades.includes(p.grade_level));
  const otherPosts = allPosts.filter(p => p.grade_level !== "General" && !preferredGrades.includes(p.grade_level));

  // 2. Sort by engagement score within their buckets
  preferredPosts.sort((a, b) => b.score - a.score);
  otherPosts.sort((a, b) => b.score - a.score);
  generalPosts.sort((a, b) => b.score - a.score);

  const feed: Post[] = [];
  
  // 3. Interleave logic to achieve roughly 70/30 ratio + General
  // For every 10 posts: ~7 preferred, ~3 other, and General scattered naturally.
  
  let pIdx = 0;
  let oIdx = 0;
  let gIdx = 0;

  while (pIdx < preferredPosts.length || oIdx < otherPosts.length || gIdx < generalPosts.length) {
    // Every cycle inserts up to 10 posts
    
    // Insert up to 7 preferred
    for (let i = 0; i < 7 && pIdx < preferredPosts.length; i++) {
      feed.push(preferredPosts[pIdx++]);
    }

    // Insert up to 3 others
    for (let i = 0; i < 3 && oIdx < otherPosts.length; i++) {
      feed.push(otherPosts[oIdx++]);
    }

    // Insert 1 or 2 general posts per cycle so they remain highly visible but don't overwhelm
    for (let i = 0; i < 2 && gIdx < generalPosts.length; i++) {
      feed.push(generalPosts[gIdx++]);
    }
  }

  return feed;
}
