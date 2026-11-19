import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { createDataTableColumns } from './columns';
import { DataTable, type DataTableExpansion, type DataTableSelection } from './data-table';

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
  selection,
  data = rows,
}: {
  expansion?: Omit<DataTableExpansion<Row>, 'isOpen' | 'onToggle'>;
  selection?: DataTableSelection<Row>;
  data?: Row[];
}) {
  const [open, setOpen] = useState<string[]>([]);
  return (
    <DataTable
      columns={columns}
      data={data}
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
      selection={selection}
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

  it('holds a failure to the visible width of a table that scrolls sideways', () => {
    render(
      <DataTable
        columns={columns}
        data={undefined}
        rowKey={(row) => row.id}
        status="error"
        label="Rânduri"
        error={<p>Nu am putut încărca rândurile.</p>}
        empty={null}
      />
    );
    const held = screen.getByText('Nu am putut încărca rândurile.').parentElement!;
    expect(held.className).toContain('sticky');
    expect(held.className).toContain('max-w-[100cqw]');
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

  it('opens only the rows that can open, keeping the column for the others', () => {
    render(
      <Table
        expansion={{
          canExpand: (row) => row.id === 'b',
          label: (row) => `Detaliile pentru ${row.name}`,
          render: () => null,
          testId: 'open',
        }}
      />
    );
    expect(
      screen.getAllByTestId('open').map((button) => button.getAttribute('aria-label'))
    ).toEqual(['Detaliile pentru Beta']);
    expect(
      screen.getAllByTestId('row').map((row) => (row as HTMLTableRowElement).cells.length)
    ).toEqual([2, 2]);
  });

  it('keeps a list without a sort in its own order, without sort buttons, rows found by id', () => {
    render(
      <DataTable
        columns={helper.columns([
          helper.display({ id: 'name', header: 'Nume', cell: ({ row }) => row.original.name }),
        ])}
        data={[rows[1]!, rows[0]!]}
        rowKey={(row) => row.id}
        rowElementId={(row) => `row-${row.id}`}
        status="success"
        label="Rânduri"
        empty={null}
        rowTestId="row"
      />
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('columnheader').hasAttribute('aria-sort')).toBe(false);
    expect(screen.getAllByTestId('row').map((row) => row.id)).toEqual(['row-b', 'row-a']);
  });
});

describe('DataTable row selection', () => {
  function Selectable({
    initial = {},
    data = rows,
  }: {
    initial?: Record<string, boolean | 'indeterminate'>;
    data?: Row[];
  }) {
    const [chosen, setChosen] = useState(initial);
    return (
      <>
        <Table
          data={data}
          selection={{
            state: (row) => chosen[row.id] ?? false,
            onChange: (changed, selected) =>
              setChosen((current) => ({
                ...current,
                ...Object.fromEntries(changed.map((row) => [row.id, selected])),
              })),
            label: (row) => `Alege ${row.name}`,
            pageLabel: 'Alege toate rândurile din pagină',
            testId: 'select',
          }}
        />
        <output data-testid="chosen">
          {Object.entries(chosen)
            .filter(([, state]) => state)
            .map(([id, state]) => `${id}:${String(state)}`)
            .join(',')}
        </output>
      </>
    );
  }

  it('puts a named checkbox before every row and one for the page in the header', () => {
    render(<Selectable />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    expect(screen.getAllByTestId('select').map((box) => box.getAttribute('aria-label'))).toEqual([
      'Alege Alfa',
      'Alege Beta',
    ]);
    expect(screen.getByRole('checkbox', { name: 'Alege toate rândurile din pagină' })).toBeTruthy();
  });

  it('chooses a row, marks it selected, and reflects it in the page checkbox', async () => {
    render(<Selectable />);
    const user = userEvent.setup();
    const page = screen.getByTestId('select-page');
    expect(page.getAttribute('aria-checked')).toBe('false');

    await user.click(screen.getAllByTestId('select')[0]!);
    expect(screen.getByTestId('chosen').textContent).toBe('a:true');
    expect(screen.getAllByTestId('row')[0]!.dataset.state).toBe('selected');
    expect(page.getAttribute('aria-checked')).toBe('mixed');

    await user.click(screen.getAllByTestId('select')[1]!);
    expect(page.getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getAllByTestId('select')[0]!);
    expect(screen.getByTestId('chosen').textContent).toBe('b:true');
  });

  it('chooses every row of the page, or none once all are chosen', async () => {
    render(<Selectable />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('select-page'));
    expect(screen.getByTestId('chosen').textContent).toBe('a:true,b:true');
    await user.click(screen.getByTestId('select-page'));
    expect(screen.getByTestId('chosen').textContent).toBe('');
  });

  it('shows a row chosen in part as mixed, and completes it on a click', async () => {
    render(<Selectable initial={{ a: 'indeterminate' }} />);
    const user = userEvent.setup();
    const [alfa] = screen.getAllByTestId('select');
    expect(alfa!.getAttribute('aria-checked')).toBe('mixed');
    expect(screen.getAllByTestId('row')[0]!.dataset.state).toBeUndefined();
    expect(screen.getByTestId('select-page').getAttribute('aria-checked')).toBe('mixed');
    await user.click(alfa!);
    expect(screen.getByTestId('chosen').textContent).toBe('a:true');
  });

  it('keeps a choice made on another page out of this page’s checkbox', () => {
    render(<Selectable initial={{ z: true }} data={rows} />);
    expect(screen.getByTestId('select-page').getAttribute('aria-checked')).toBe('false');
  });

  it('leaves the other tables as they were', () => {
    render(<Table />);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
