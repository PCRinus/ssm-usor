import type { StaffCategory } from '@ssm-usor/contracts';

import { Notice } from '@/components/notice';
import { staffCategoryLabels } from '@/features/job-positions/job-position-schema';
import { countOf } from '@/features/legislation/legislation-labels';

type HeldPosition = { name: string; staffCategory: StaffCategory; employeeCount: number };

const listedPositions = 5;

function joinWithAnd(items: string[]) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} și ${items.at(-1)}`;
}

function excludedCategorySentence(category: StaffCategory, positions: HeldPosition[]) {
  const held = positions
    .filter((position) => position.staffCategory === category && position.employeeCount > 0)
    .sort((a, b) => b.employeeCount - a.employeeCount);
  if (held.length === 0) return null;
  const total = held.reduce((sum, position) => sum + position.employeeCount, 0);
  const where =
    held.length === 1
      ? `pe postul ${held[0]!.name}`
      : `pe posturile ${joinWithAnd([
          ...held
            .slice(0, listedPositions)
            .map((position) => `${position.name} (${position.employeeCount})`),
          ...(held.length > listedPositions ? [`încă ${held.length - listedPositions}`] : []),
        ])}`;
  return `${countOf(total, 'angajat', 'angajați')} ${where} ${total === 1 ? 'este' : 'sunt'} în categoria „${staffCategoryLabels[category]}”, marcată „Nu se aplică”.`;
}

export function ExcludedCategoryWarning({
  excluded,
  positions,
  action,
}: {
  excluded: StaffCategory[];
  positions: HeldPosition[];
  action: (categories: number) => string;
}) {
  const sentences = excluded.flatMap(
    (category) => excludedCategorySentence(category, positions) ?? []
  );
  if (sentences.length === 0) return null;
  return (
    <Notice variant="warning" data-testid="training-program-category-warning">
      {[...sentences, action(sentences.length)].join(' ')}
    </Notice>
  );
}
