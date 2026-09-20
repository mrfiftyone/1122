/**
 * Security utilities for password hashing, input sanitization, and URL validation.
 *
 * Uses the Web Crypto API (available in all modern browsers and Node 18+)
 * so no additional npm dependencies are needed.
 */

// ─── Password Hashing (Phase 2) ────────────────────────────────────

/**
 * Generate a cryptographically random salt (hex string).
 */
export function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hash a password with a salt using SHA-256.
 * Returns a hex digest string.
 *
 * NOTE: SHA-256 is not as slow as bcrypt/scrypt, but it is adequate for
 * a client-side localStorage auth model. The salt prevents rainbow-table
 * attacks. For production auth, migrate to Supabase Auth (see Phase 3).
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify a password against a stored hash and salt.
 */
export async function verifyPassword(
  password: string,
  salt: string,
  storedHash: string
): Promise<boolean> {
  const hash = await hashPassword(password, salt);
  return hash === storedHash;
}

// ─── Input Sanitization (Phase 5) ───────────────────────────────────

/**
 * Strip HTML tags from user input to prevent stored XSS.
 * Preserves plain text content.
 */
export function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Sanitize user-submitted text (post titles, comments, reviews).
 * - Strips HTML/script tags
 * - Removes null bytes
 * - Trims excessive whitespace
 * - Limits length
 */
export function sanitizeText(input: string, maxLength: number = 5000): string {
  let clean = input;
  // Remove null bytes
  clean = clean.replace(/\0/g, "");
  // Strip HTML tags
  clean = stripHtml(clean);
  // Collapse excessive whitespace (but keep single newlines)
  clean = clean.replace(/[ \t]+/g, " ");
  clean = clean.replace(/\n{3,}/g, "\n\n");
  // Trim and enforce max length
  clean = clean.trim();
  if (clean.length > maxLength) {
    clean = clean.substring(0, maxLength);
  }
  return clean;
}

/**
 * Sanitize a username.
 * Only allows alphanumeric, underscores, hyphens, and dots.
 */
export function sanitizeUsername(input: string): string {
  return input
    .trim()
    .replace(/[^a-zA-Z0-9_\-.\u0600-\u06FF\u0750-\u077F]/g, "")
    .substring(0, 30);
}

// ─── URL Scheme Whitelisting (Phase 5) ──────────────────────────────

const ALLOWED_YOUTUBE_PATTERNS = [
  /^https?:\/\/(www\.)?youtube\.com\/(watch\?v=|shorts\/|embed\/|playlist\?list=|@)[\w\-?&=%]+/i,
  /^https?:\/\/youtu\.be\/[\w\-?&=%]+/i,
];

const ALLOWED_TELEGRAM_PATTERNS = [
  /^https?:\/\/(t\.me|telegram\.me)\/[\w\-+/]+/i,
];

/**
 * Validate that a URL is a legitimate YouTube URL.
 * Returns true if empty (optional field) or matches allowed patterns.
 */
export function isAllowedYoutubeUrl(url: string): boolean {
  if (!url || !url.trim()) return true; // optional field
  const trimmed = url.trim();
  // Block javascript: and data: schemes
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return false;
  return ALLOWED_YOUTUBE_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * Validate that a URL is a legitimate Telegram URL.
 * Returns true if empty (optional field) or matches allowed patterns.
 */
export function isAllowedTelegramUrl(url: string): boolean {
  if (!url || !url.trim()) return true; // optional field
  const trimmed = url.trim();
  // Block javascript: and data: schemes
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return false;
  return ALLOWED_TELEGRAM_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * Validate any URL against dangerous schemes (javascript:, data:, vbscript:).
 */
export function isSafeUrl(url: string): boolean {
  if (!url || !url.trim()) return true;
  const trimmed = url.trim().toLowerCase();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return false;
  // Must start with http:// or https://
  return /^https?:\/\//i.test(trimmed);
}

// ─── Role Verification (Phase 3 - Client-Side Guard) ────────────────

/**
 * Verify that a session's role matches a stored role in the users list.
 * This prevents DevTools role spoofing by cross-checking localStorage.
 *
 * For truly tamper-proof role verification, admin actions should also
 * be validated server-side (see the admin-verify API route).
 */
export function verifySessionRole(
  sessionUser: { username: string; role: string } | null,
  storedUsers: { username: string; role: string }[]
): { username: string; role: string } | null {
  if (!sessionUser) return null;
  const match = storedUsers.find((u) => u.username === sessionUser.username);
  if (!match) return null;
  // Return the role from the stored users list, NOT from the session
  return { username: match.username, role: match.role };
}
