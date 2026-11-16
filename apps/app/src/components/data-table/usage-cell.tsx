import { roCount } from '@/features/employees/employee-format';

import { CellEmpty, CellNote } from './cell-note';

const clientsNote = (count: number) =>
  count === 1 ? 'la un client' : `la ${roCount(count, 'client', 'clienți')}`;

export function UsageCell({
  count,
  noun,
  clientCount,
  testId,
}: {
  count: number;
  noun: readonly [one: string, many: string];
  clientCount: number;
  testId: string;
}) {
  if (count === 0) return <CellEmpty data-testid={testId} />;
  return (
    <span data-testid={testId} className="tabular-nums">
      {roCount(count, ...noun)}
      <CellNote>{clientsNote(clientCount)}</CellNote>
    </span>
  );
}
