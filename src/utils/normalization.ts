export function normalizeTeacherName(name: string): string {
  if (!name) return "";

  let normalized = name.trim();

  // 1. Remove Iraqi honorifics
  // Using word boundaries to ensure we don't accidentally remove parts of names (e.g. "أستاذ" vs "أستاذنا")
  // Note: Arabic word boundaries in Regex can be tricky, so we explicitly handle spaces.
  const honorifics = ["أستاذ", "استاذ", "ست", "دكتور", "د.", "أ.", "م."];
  
  // We remove honorifics typically found at the beginning of the string
  for (const honorific of honorifics) {
    if (normalized.startsWith(honorific + " ")) {
      normalized = normalized.replace(honorific + " ", "");
    } else if (normalized.startsWith(honorific)) {
      normalized = normalized.replace(honorific, "");
    }
  }

  // 2. Convert all variations of Alef (أ, إ, آ) to a bare Alef (ا)
  normalized = normalized.replace(/[أإآ]/g, "ا");

  // 3. Convert Taa Marbouta (ة) to Haa (ه)
  normalized = normalized.replace(/ة/g, "ه");

  // 4. Convert Alef Maksoura (ى) to Yaa (ي)
  normalized = normalized.replace(/ى/g, "ي");

  // 5. Remove all double spaces
  normalized = normalized.replace(/\s+/g, " ");

  return normalized.trim();
}

/**
 * Mocks the Section 4 Composite Unique Check that would run on the server.
 * In production, this checks the DB: SELECT id FROM teachers WHERE normalized_name = X AND subject = Y AND governorate = Z
 */
export function checkIsDuplicate(
  newName: string, 
  newSubject: string, 
  newGov: string, 
  existingDbRecords: Array<{normalizedName: string, subject: string, gov: string}>
): boolean {
  const incomingNormalizedName = normalizeTeacherName(newName);
  
  return existingDbRecords.some(record => 
    record.normalizedName === incomingNormalizedName && 
    record.subject === newSubject && 
    record.gov === newGov
  );
}
