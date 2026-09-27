import { type InstructionModuleGroup, instructionModuleGroups } from '@ssm-usor/contracts';
import { z } from 'zod';

import type {
  InstructionModuleListResponse,
  PositionInstructionsResponse,
} from '../api/generated/api';
import type { JobPosition } from '../job-positions/job-position-schema';

export type InstructionModule = InstructionModuleListResponse['items'][number];
export type AppliedInstruction = PositionInstructionsResponse['items'][number];

export const groupLabels: Record<InstructionModuleGroup, string> = {
  work_activity: 'Activități',
  work_equipment: 'Echipamente de muncă',
  protective_equipment: 'Echipament de protecție',
};

export const groupHints: Record<InstructionModuleGroup, string> = {
  work_activity: 'Munca de birou, curățenia, servirea, conducerea autovehiculelor.',
  work_equipment: 'O scară, un aparat de sudură, un polizor, o mașină de găurit.',
  protective_equipment: 'Purtarea unei căști, a mănușilor, a ochelarilor de protecție.',
};

/** "Nicio instrucțiune", "O instrucțiune", "3 instrucțiuni", "20 de instrucțiuni". */
export function moduleCountLabel(count: number) {
  if (count === 0) return 'Nicio instrucțiune';
  if (count === 1) return 'O instrucțiune';
  const tens = count % 100;
  return tens === 0 || tens >= 20 ? `${count} de instrucțiuni` : `${count} instrucțiuni`;
}

/** "un post", "3 posturi", "20 de posturi". */
export function positionCountLabel(count: number) {
  if (count === 0) return 'Niciun post';
  if (count === 1) return 'Un post';
  const tens = count % 100;
  return tens === 0 || tens >= 20 ? `${count} de posturi` : `${count} posturi`;
}

/** "12 articole", counted from the file's numbered list. */
export function articleCountLabel(count: number) {
  if (count === 0) return 'Fără articole numerotate';
  if (count === 1) return 'Un articol';
  const tens = count % 100;
  return tens === 0 || tens >= 20 ? `${count} de articole` : `${count} articole`;
}

export function instructionStateLabel(
  position: Pick<JobPosition, 'needsInstructions' | 'instructionCount'>
) {
  if (position.needsInstructions === null) return 'Nedecis';
  if (position.needsInstructions === false) return 'Nu necesită';
  return moduleCountLabel(position.instructionCount).toLowerCase().replace(/^o /, '1 ');
}

export const moduleFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'Introdu titlul instrucțiunii (cel puțin 2 caractere).')
    .max(200, 'Titlul are cel mult 200 de caractere.'),
  group: z.enum(instructionModuleGroups),
});

export type ModuleFormValues = z.infer<typeof moduleFormSchema>;

export function byGroup<T extends { group: InstructionModuleGroup }>(items: T[]) {
  return instructionModuleGroups
    .map((group) => ({ group, items: items.filter((item) => item.group === group) }))
    .filter(({ items: grouped }) => grouped.length > 0);
}

export async function invalidateLibrary(queryClient: {
  invalidateQueries: (filters: {
    predicate: (query: { queryKey: readonly unknown[] }) => boolean;
  }) => Promise<void>;
}) {
  await queryClient.invalidateQueries({
    predicate: ({ queryKey }) => String(queryKey[0]).startsWith('/instruction-modules'),
  });
}
