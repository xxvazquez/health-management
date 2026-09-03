/** Starting specialty list shown until the user has their own
 * `doctor_specialties` rows — same "built-in defaults until a real row
 * exists" relationship categories have to `CATEGORIES_BY_TYPE`. Editable
 * and extendable from the Manage page; a new one typed while logging an
 * appointment is saved for reuse. */
export const DEFAULT_DOCTOR_SPECIALTIES = [
  "Allergist",
  "Cardiologist",
  "Dentist",
  "Dermatologist",
  "Endocrinologist",
  "Endodontist",
  "ENT (Laryngologist)",
  "Gastroenterologist",
  "Gynecologist",
  "Internist (GP)",
  "Neurologist",
  "Ophthalmologist",
  "Orthodontist",
  "Orthopedist",
  "Physiotherapist",
  "Psychiatrist",
  "Pulmonologist",
  "Radiologist",
  "Rheumatologist",
  "Urologist",
] as const;

export const DOCTOR_LANGUAGES = ["Polish", "English", "Spanish"] as const;
export type DoctorLanguage = (typeof DOCTOR_LANGUAGES)[number];

export const DOCTOR_RATINGS = [1, 2, 3] as const;

/** Rating 1 marks a doctor to avoid — their name renders in the critical
 * red everywhere it's shown or offered for selection. */
export function isBadDoctor(rating: number | null): boolean {
  return rating === 1;
}

/** Case-insensitive de-dupe + A–Z sort for a specialty picker built from
 * several sources (saved rows, defaults, specialties already on
 * appointments). */
function mergeSpecialtyNames(...groups: string[][]): string[] {
  const seen = new Map<string, string>();
  for (const group of groups) {
    for (const raw of group) {
      const name = raw.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!seen.has(key)) seen.set(key, name);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** The specialty names to offer: the user's own non-archived rows once they
 * have any (so a hidden or removed built-in stays gone), otherwise the
 * built-in defaults. `extra` names — e.g. specialties frozen onto old
 * appointments — are always folded in so nothing in the history is
 * unreachable. Same "rows win once they exist" rule item categories use. */
export function resolveSpecialtyNames(rows: { name: string; isArchived: boolean }[], ...extra: string[][]): string[] {
  const base = rows.length > 0 ? rows.filter((r) => !r.isArchived).map((r) => r.name) : [...DEFAULT_DOCTOR_SPECIALTIES];
  return mergeSpecialtyNames(base, ...extra);
}
