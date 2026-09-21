export function getRelativeTime(dateString: string, lang: "ar" | "en" = "ar"): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return lang === "en" ? "Just now" : "هسة";
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    if (lang === "en") {
      return diffInMinutes === 1 ? "1 min ago" : `${diffInMinutes} mins ago`;
    }
    if (diffInMinutes === 1) return "قبل دقيقة";
    if (diffInMinutes === 2) return "قبل دقيقتين";
    if (diffInMinutes <= 10) return `قبل ${diffInMinutes} دقائق`;
    return `قبل ${diffInMinutes} دقيقة`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    if (lang === "en") {
      return diffInHours === 1 ? "1 hour ago" : `${diffInHours} hours ago`;
    }
    if (diffInHours === 1) return "قبل ساعة";
    if (diffInHours === 2) return "قبل ساعتين";
    if (diffInHours <= 10) return `قبل ${diffInHours} ساعات`;
    return `قبل ${diffInHours} ساعة`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays <= 7) {
    if (lang === "en") {
      return diffInDays === 1 ? "1 day ago" : `${diffInDays} days ago`;
    }
    if (diffInDays === 1) return "قبل يوم";
    if (diffInDays === 2) return "قبل يومين";
    return `قبل ${diffInDays} أيام`;
  }

  // After 7 days, show actual date format DD/MM/YYYY
  return date.toLocaleDateString(lang === "en" ? "en-US" : "ar-IQ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// 5-minute edit window checker
export function isWithinEditWindow(dateString: string): boolean {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = (now.getTime() - date.getTime()) / (1000 * 60);
  return diffInMinutes <= 5;
}
