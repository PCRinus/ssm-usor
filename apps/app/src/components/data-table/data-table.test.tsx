import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { createDataTableColumns } from './columns';
import { DataTable, type DataTableExpansion } from './data-table';

type Row = { id: string; name: string };

const rows: Row[] = [
  { id: 'a', name: 'Alfa' },
  { id: 'b', name: 'Beta' },
];

const helper = createDataTableColumns<Row>();
const columns = helper.columns([
  helper.accessor((row) => row.name, { id: 'name', header: 'Nume', enableSorting: true }),
]);

function Table({
  expansion,
}: {
  expansion?: Omit<DataTableExpansion<Row>, 'isOpen' | 'onToggle'>;
}) {
  const [open, setOpen] = useState<string[]>([]);
  return (
    <DataTable
      columns={columns}
      data={rows}
      rowKey={(row) => row.id}
      meta={{ page: 1, pageSize: 25, total: rows.length }}
      sort={{ sort: 'name', order: 'asc' }}
      onSortChange={() => undefined}
      onPageChange={() => undefined}
      status="success"
      noun={['rând', 'rânduri']}
      label="Rânduri"
      empty={null}
      rowTestId="row"
      expansion={
        expansion && {
          ...expansion,
          isOpen: (row) => open.includes(row.id),
          onToggle: (row) =>
            setOpen((current) =>
              current.includes(row.id)
                ? current.filter((id) => id !== row.id)
                : [...current, row.id]
            ),
        }
      }
    />
  );
}

describe('DataTable', () => {
  it('has no disclosure column without expansion', () => {
    render(<Table />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(1);
    expect(screen.queryByRole('button', { expanded: false })).toBeNull();
    expect(
      screen.getAllByTestId('row').map((row) => (row as HTMLTableRowElement).cells.length)
    ).toEqual([1, 1]);
  });

  it('opens a row under it, by click or keyboard, naming what it controls', async () => {
    render(
      <Table
        expansion={{
          label: (row) => `Detaliile pentru ${row.name}`,
          render: (row) => <p>Detalii {row.name}</p>,
          testId: 'open',
        }}
      />
    );
    const user = userEvent.setup();
    const [alfa, beta] = screen.getAllByTestId('open');
    expect(alfa!.getAttribute('aria-label')).toBe('Detaliile pentru Alfa');
    expect(alfa!.getAttribute('aria-expanded')).toBe('false');
    expect(alfa!.hasAttribute('aria-controls')).toBe(false);

    await user.click(alfa!);
    expect(alfa!.getAttribute('aria-expanded')).toBe('true');
    const details = document.getElementById(alfa!.getAttribute('aria-controls')!)!;
    expect(within(details).getByText('Detalii Alfa')).toBeTruthy();
    expect(details.querySelector('td')!.colSpan).toBe(2);

    beta!.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Detalii Beta')).toBeTruthy();
    await user.keyboard(' ');
    expect(screen.queryByText('Detalii Beta')).toBeNull();
    expect(screen.getByText('Detalii Alfa')).toBeTruthy();
  });
});
