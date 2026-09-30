/** Name without emoji or pictographs: "👩🏽 Diana Boldizar" → "Diana Boldizar". */
export const plainName = (s: string) =>
  s
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Comparable form of a name or folder: no emoji, accents, case, "_", "-" or ".". */
export const foldName = (s: string) =>
  norm(plainName(s))
    .replace(/[_\-.·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Lowercase and strip accents, for accent-insensitive search. */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
