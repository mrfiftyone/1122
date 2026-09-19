// A small subset of words for demonstration purposes. 
// In a real production app, this would be a comprehensive list.
const BLOCKED_WORDS = [
  "كلب",
  "حمار",
  "غبي",
  "زباله",
  "زبالة", // normalized later anyway, but safe to include
];

/**
 * Layer 1: The Profanity Pre-Processor
 * Strips all spaces, dots, dashes, and English characters from the string.
 * Then checks against the strictly defined array of insults.
 */
export function containsProfanity(text: string): boolean {
  if (!text) return false;

  // 1. Strip spaces, dots, dashes, and English characters/numbers
  // \s = spaces, \. = dots, \- = dashes, a-zA-Z0-9 = English alphanumeric
  // We want to keep only Arabic characters to prevent bypassing (e.g. "ك . ل - ب")
  const strippedText = text.replace(/[\s\.\-a-zA-Z0-9]/g, "");

  // 2. Check if the heavily stripped string contains any of the blocked words
  for (const word of BLOCKED_WORDS) {
    if (strippedText.includes(word)) {
      return true;
    }
  }

  return false;
}
