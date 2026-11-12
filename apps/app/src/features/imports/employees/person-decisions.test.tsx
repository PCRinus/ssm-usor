import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { employeeProposal } from '@/test/employee-import-fixture';

import { emptyChanges, type FieldName, type Proposal, statesOf } from './employee-review-model';
import { FieldChoice } from './person-decisions';

const disagreeing = {
  hiredAt: {
    options: [
      { value: '2023-05-02', pageIds: ['p1'] },
      { value: '2023-06-02', pageIds: ['p5'] },
    ],
  },
  cnp: {
    options: [
      { value: '2900517320141', pageIds: ['p1'] },
      { value: '2900517320142', pageIds: ['p2'] },
    ],
  },
};

const fixture = employeeProposal();
const proposal = {
  ...fixture,
  pages: fixture.pages.map((page) => (page.id === 'p5' ? { ...page, personId: 'toma' } : page)),
  people: fixture.people.map((person) =>
    person.id === 'toma' ? { ...person, fields: { ...person.fields, ...disagreeing } } : person
  ),
} as unknown as Proposal;
const person = proposal.people.find((each) => each.id === 'toma')!;

function Choice({ name }: { name: FieldName }) {
  const [current, setCurrent] = useState(emptyChanges);
  return (
    <>
      <FieldChoice
        context={{
          proposal,
          changes: current,
          states: statesOf(proposal, current),
          workplaceCount: 2,
          today: '2026-11-10',
        }}
        person={person}
        name={name}
        onChange={setCurrent}
      />
      <output data-testid="fields">{JSON.stringify(current.people.toma?.fields ?? null)}</output>
    </>
  );
}

const choice = () => JSON.parse(screen.getByTestId('fields').textContent!) as unknown;

describe('a value the sheets disagree on', () => {
  it('numbers each value by the photograph it was read from, as the photographs beside are', () => {
    render(<Choice name="hiredAt" />);
    expect(
      screen.getAllByTestId('person-page-button').map((button) => button.getAttribute('aria-label'))
    ).toEqual([
      'Fotografia 1, Data angajării: 02.05.2023',
      'Fotografia 3, Data angajării: 02.06.2023',
    ]);
  });

  it('takes a date of its own, and moves between it and a value read', async () => {
    const user = userEvent.setup();
    render(<Choice name="hiredAt" />);
    const card = screen.getByTestId('person-decide-choice-hiredAt');
    const group = within(card).getByRole('radiogroup', { name: 'Data angajării' });
    const [first, second, other] = within(group).getAllByRole<HTMLInputElement>('radio');
    expect(first!.labels?.[0]?.textContent).toBe('02.05.2023');

    await user.click(first!);
    expect(choice()).toEqual({ hiredAt: { option: 0 } });

    await user.click(other!);
    expect(first!.checked).toBe(false);
    await user.click(within(card).getByTestId('person-choice-other-use'));
    expect(card.textContent).toContain('Scrie data, de exemplu 01.03.2024.');
    expect(choice()).toEqual({ hiredAt: { option: 0 } });

    await user.type(
      within(card).getByLabelText('Data angajării', { selector: 'input' }),
      '15.05.2023'
    );
    await user.click(within(card).getByTestId('person-choice-other-use'));
    expect(choice()).toEqual({ hiredAt: { value: '2023-05-15' } });
    expect(other!.checked).toBe(true);

    await user.click(second!);
    expect(choice()).toEqual({ hiredAt: { option: 1 } });
    expect(other!.checked).toBe(false);
    expect(within(card).queryByLabelText('Data angajării', { selector: 'input' })).toBeNull();
  });

  it('changes the value with the arrow keys, as a group of radio buttons', async () => {
    const user = userEvent.setup();
    render(<Choice name="hiredAt" />);
    const [first] = within(screen.getByRole('radiogroup')).getAllByRole('radio');
    await user.click(first!);
    await user.keyboard('{ArrowDown}');
    expect(choice()).toEqual({ hiredAt: { option: 1 } });
  });

  it('keeps the photo numbers of a choice out of the radio labels, and only the chosen in tab order', async () => {
    const user = userEvent.setup();
    render(<Choice name="hiredAt" />);
    const [first] = within(screen.getByRole('radiogroup')).getAllByRole<HTMLInputElement>('radio');
    const numbers = screen.getAllByTestId('person-page-button');
    for (const number of numbers) expect(number.closest('label')).toBeNull();
    expect(numbers.map((number) => number.tabIndex)).toEqual([0, 0]);
    await user.click(first!);
    expect(numbers.map((number) => number.tabIndex)).toEqual([0, -1]);
  });

  it('refuses a CNP of its own that is not valid, and takes a valid one', async () => {
    const user = userEvent.setup();
    render(<Choice name="cnp" />);
    const card = screen.getByTestId('person-decide-choice-cnp');
    await user.click(within(card).getByTestId('person-choice-other'));
    const input = within(card).getByLabelText('CNP');

    await user.type(input, '1900517320142');
    await user.click(within(card).getByTestId('person-choice-other-use'));
    expect(card.textContent).toContain('CNP-ul nu e valid. Verifică cele 13 cifre.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(choice()).toBeNull();

    await user.clear(input);
    await user.type(input, '1900517320141');
    await user.click(within(card).getByTestId('person-choice-other-use'));
    expect(choice()).toEqual({ cnp: { value: '1900517320141' } });
  });
});
