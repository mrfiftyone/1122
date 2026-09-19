export function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return "الآن"; // Just now
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    if (diffInMinutes === 1) return "منذ دقيقة";
    if (diffInMinutes === 2) return "منذ دقيقتين";
    if (diffInMinutes <= 10) return `منذ ${diffInMinutes} دقائق`;
    return `منذ ${diffInMinutes} دقيقة`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    if (diffInHours === 1) return "منذ ساعة";
    if (diffInHours === 2) return "منذ ساعتين";
    if (diffInHours <= 10) return `منذ ${diffInHours} ساعات`;
    return `منذ ${diffInHours} ساعة`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays <= 7) {
    if (diffInDays === 1) return "منذ يوم";
    if (diffInDays === 2) return "منذ يومين";
    if (diffInDays <= 7) return `منذ ${diffInDays} أيام`;
  }

  // After 7 days, show actual date format DD/MM/YYYY
  return date.toLocaleDateString("ar-IQ", {
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
