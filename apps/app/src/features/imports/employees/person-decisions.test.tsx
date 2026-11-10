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
    ).toEqual(['Arată fotografia 1', 'Arată fotografia 3']);
  });

  it('takes a date of its own, and moves between it and a value read', async () => {
    const user = userEvent.setup();
    render(<Choice name="hiredAt" />);
    const card = screen.getByTestId('person-decide-choice-hiredAt');
    const [first, second] = within(card).getAllByRole('button', { pressed: false });

    await user.click(first!);
    expect(choice()).toEqual({ hiredAt: { option: 0 } });

    await user.click(within(card).getByTestId('person-choice-other'));
    expect(first!.getAttribute('aria-pressed')).toBe('false');
    await user.click(within(card).getByTestId('person-choice-other-use'));
    expect(card.textContent).toContain('Scrie data, de exemplu 01.03.2024.');
    expect(choice()).toEqual({ hiredAt: { option: 0 } });

    await user.type(within(card).getByLabelText('Data angajării'), '15.05.2023');
    await user.click(within(card).getByTestId('person-choice-other-use'));
    expect(choice()).toEqual({ hiredAt: { value: '2023-05-15' } });
    expect(within(card).getByTestId('person-choice-other').getAttribute('aria-pressed')).toBe(
      'true'
    );

    await user.click(second!);
    expect(choice()).toEqual({ hiredAt: { option: 1 } });
    expect(within(card).getByTestId('person-choice-other').getAttribute('aria-pressed')).toBe(
      'false'
    );
    expect(within(card).queryByLabelText('Data angajării')).toBeNull();
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
