import { z } from 'zod';

export const commuteMeans = [
  'on_foot',
  'bicycle',
  'personal_car',
  'employer_transport',
  'public_transport',
] as const;

export const commuteMeanSchema = z.enum(commuteMeans);
export type CommuteMean = z.infer<typeof commuteMeanSchema>;

export const commuteMeanLabels: Record<CommuteMean, string> = {
  on_foot: 'Pe jos',
  bicycle: 'Bicicletă sau trotinetă',
  personal_car: 'Mașina personală',
  employer_transport: 'Transport asigurat de angajator',
  public_transport: 'Transport public',
};

export const commuteMeansOtherMaxLength = 120;

export interface CommuteMeansValue {
  means: CommuteMean[];
  // The one means the specialist typed because the list has none for it; null when none.
  other: string | null;
}

/** In the list's order, which is the order a sheet prints them in. */
export function orderedCommuteMeans(means: readonly string[]): CommuteMean[] {
  return commuteMeans.filter((mean) => means.includes(mean));
}

export function commuteMeansLabels({ means, other }: CommuteMeansValue) {
  const labels = orderedCommuteMeans(means).map((mean) => commuteMeanLabels[mean]);
  return other?.trim() ? [...labels, other.trim()] : labels;
}

const storedValueSchema = z.object({
  means: z.array(commuteMeanSchema),
  other: z.string().trim().min(1).max(commuteMeansOtherMaxLength).nullable(),
});

/**
 * The means as one text, for the employee import, whose reviewed values are texts or numbers;
 * null when none is chosen.
 */
export function commuteMeansKey(value: CommuteMeansValue): string | null {
  const means = orderedCommuteMeans(value.means);
  const other = value.other?.trim() || null;
  if (means.length === 0 && other === null) return null;
  return JSON.stringify({ means, other });
}

export function parseCommuteMeansKey(key: string): CommuteMeansValue | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(key);
  } catch {
    return null;
  }
  const value = storedValueSchema.safeParse(parsed);
  if (!value.success) return null;
  return { means: orderedCommuteMeans(value.data.means), other: value.data.other };
}
