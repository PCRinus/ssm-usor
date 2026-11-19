import { countOf } from '@ssm-usor/contracts';

import { CellEmpty, CellNote } from './cell-note';

const clientsNote = (count: number) =>
  count === 1 ? 'la un client' : `la ${countOf(count, 'client', 'clienți')}`;

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
      {countOf(count, ...noun)}
      <CellNote>{clientsNote(clientCount)}</CellNote>
    </span>
  );
}
