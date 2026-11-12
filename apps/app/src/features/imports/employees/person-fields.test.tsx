import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { employeeProposal } from '@/test/employee-import-fixture';

import { emptyChanges, type Proposal, statesOf } from './employee-review-model';
import { dialogRowsFor } from './person-dialog-rows';
import { PersonData } from './person-fields';

const proposal = employeeProposal() as unknown as Proposal;
const person = proposal.people.find((each) => each.id === 'pop')!;

function Data() {
  const [current, setCurrent] = useState(emptyChanges);
  return (
    <>
      <PersonData
        context={{
          proposal,
          changes: current,
          states: statesOf(proposal, current),
          workplaceCount: 2,
          today: '2026-11-12',
        }}
        person={person}
        decisions={[]}
        onChange={(mutate) => setCurrent(mutate)}
      />
      <output data-testid="fields">{JSON.stringify(current.people.pop?.fields ?? null)}</output>
    </>
  );
}

const written = () => JSON.parse(screen.getByTestId('fields').textContent!) as unknown;

const dialog = () => screen.getByTestId('person-fields-dialog');

const rows = () =>
  [...dialog().querySelector('[data-slot=dialog-body]')!.children].map((row) =>
    [...row.querySelectorAll('label')].map((label) => label.htmlFor.replace('person-field-', ''))
  );

async function open(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('button', { name: label }));
}

describe('the rows of a dialog with only some of the fields', () => {
  it('keeps the canonical order, halves a pair that lost its partner and puts the unknown last', () => {
    expect(dialogRowsFor(['workplace', 'hiredAt', 'homeAddress', 'firstName'])).toEqual([
      { half: 'firstName' },
      { full: 'homeAddress' },
      { half: 'hiredAt' },
      { full: 'workplace' },
    ]);
    expect(dialogRowsFor(['rhFactor', 'bloodGroup'])).toEqual([
      { pair: ['bloodGroup', 'rhFactor'], onPhone: 'paired' },
    ]);
  });
});

describe('the dialogs that correct the data read from the sheets', () => {
  it('lays each group out in its own rows, pairing the short fields', async () => {
    const user = userEvent.setup();
    render(<Data />);

    await open(user, 'Modifică datele personale');
    expect(rows()).toEqual([
      ['lastName', 'firstName'],
      ['cnp', 'birthDate'],
      ['birthPlace'],
      ['homeAddress'],
      ['education'],
      ['qualification'],
    ]);
    await user.click(screen.getByRole('button', { name: 'Renunță' }));

    await open(user, 'Modifică datele de angajare');
    expect(rows()).toEqual([['jobTitle'], ['hiredAt', 'leftOn'], ['employeeNumber']]);
    await user.click(screen.getByRole('button', { name: 'Renunță' }));

    await open(user, 'Modifică datele medicale și celelalte');
    expect(rows()).toEqual([['bloodGroup', 'rhFactor'], ['commuteRoute'], ['commuteMinutes']]);
    expect(dialog().textContent).toContain('Ce scrii aici înlocuiește valoarea citită de pe fișă.');
  });

  it('keeps the fields of a pair on shared rows, the blood group beside Rh even on a phone', async () => {
    const user = userEvent.setup();
    render(<Data />);
    const fieldOf = (name: string) =>
      dialog().querySelector(`label[for="person-field-${name}"]`)!.closest('.grid')!;

    await open(user, 'Modifică datele medicale și celelalte');
    for (const name of ['bloodGroup', 'rhFactor']) {
      expect(fieldOf(name).className.split(' ')).toContain('grid-rows-subgrid');
    }
    await user.click(screen.getByRole('button', { name: 'Renunță' }));

    await open(user, 'Modifică datele personale');
    for (const name of ['lastName', 'firstName', 'cnp', 'birthDate']) {
      expect(fieldOf(name).className.split(' ')).toContain('sm:grid-rows-subgrid');
    }
    expect(fieldOf('homeAddress').className).not.toContain('subgrid');
  });

  it('writes the address, the job title and the route in fields that wrap, the rest on one line', async () => {
    const user = userEvent.setup();
    render(<Data />);

    await open(user, 'Modifică datele personale');
    expect(screen.getByLabelText(/^Domiciliul/).tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText(/^Locul nașterii/).tagName).toBe('INPUT');
    await user.click(screen.getByRole('button', { name: 'Renunță' }));

    await open(user, 'Modifică datele de angajare');
    expect(screen.getByLabelText(/^Funcția pe fișă/).tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText(/^Număr de marcă/).tagName).toBe('INPUT');
    await user.click(screen.getByRole('button', { name: 'Renunță' }));

    await open(user, 'Modifică datele medicale și celelalte');
    expect(screen.getByLabelText(/^Traseul spre locul de muncă/).tagName).toBe('TEXTAREA');
    const minutes = screen.getByLabelText(/^Durata drumului/);
    expect(minutes.tagName).toBe('INPUT');
    expect(minutes.parentElement!.textContent).toBe('min');
  });

  it('turns a pasted line break into a space and saves with Enter', async () => {
    const user = userEvent.setup();
    render(<Data />);
    await open(user, 'Modifică datele personale');
    const address = screen.getByLabelText<HTMLTextAreaElement>(/^Domiciliul/);

    await user.click(address);
    await user.paste('Mun. Timișoara, jud. Timiș,\n  str. Ardealului, nr. 81');
    expect(address.value).toBe('Mun. Timișoara, jud. Timiș, str. Ardealului, nr. 81');

    await user.keyboard('{Enter}');
    expect(screen.queryByTestId('person-fields-dialog')).toBeNull();
    expect(written()).toEqual({
      homeAddress: { value: 'Mun. Timișoara, jud. Timiș, str. Ardealului, nr. 81' },
    });
  });

  it('does not save with Enter while a value is refused, and shows why under it', async () => {
    const user = userEvent.setup();
    render(<Data />);
    await open(user, 'Modifică datele medicale și celelalte');
    const minutes = screen.getByLabelText(/^Durata drumului/);

    await user.type(minutes, '900');
    await user.click(screen.getByLabelText(/^Traseul spre locul de muncă/));
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('person-fields-dialog')).toBeTruthy();
    expect(within(dialog()).getByRole('alert').textContent).toBe(
      'Scrie un număr de minute între 1 și 600.'
    );
    expect(written()).toBeNull();

    await user.clear(minutes);
    await user.type(minutes, '45');
    await user.click(screen.getByLabelText(/^Traseul spre locul de muncă/));
    await user.keyboard('{Enter}');
    expect(screen.queryByTestId('person-fields-dialog')).toBeNull();
    expect(written()).toEqual({ commuteMinutes: { value: 45 } });
  });

  it('keeps the caret where a pasted text ends when its line breaks become spaces', async () => {
    const user = userEvent.setup();
    render(<Data />);
    await open(user, 'Modifică datele personale');
    const address = screen.getByLabelText<HTMLTextAreaElement>(/^Domiciliul/);

    await user.type(address, 'Timișoara, nr. 81');
    address.setSelectionRange(10, 10);
    await user.paste('\n str. Ardealului,\n');
    expect(address.value).toBe('Timișoara, str. Ardealului, nr. 81');
    expect(address.selectionStart).toBe('Timișoara, str. Ardealului, '.length);
    expect(address.selectionEnd).toBe('Timișoara, str. Ardealului, '.length);
  });

  it('sizes the wrapping fields to their text where the browser cannot', async () => {
    vi.stubGlobal('CSS', { supports: () => false });
    const scrollHeight = vi
      .spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get')
      .mockImplementation(function (this: HTMLTextAreaElement) {
        return this.value.length > 30 ? 62 : 42;
      });
    try {
      const user = userEvent.setup();
      render(<Data />);
      await open(user, 'Modifică datele personale');
      const address = screen.getByLabelText<HTMLTextAreaElement>(/^Domiciliul/);
      expect(address.rows).toBe(1);
      expect(address.style.height).toBe('42px');

      await user.type(address, 'Mun. Timișoara, jud. Timiș, str. Ardealului, nr. 81');
      expect(address.style.height).toBe('62px');
    } finally {
      scrollHeight.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('names the minutes unit with the travel time, beside its error when there is one', async () => {
    const user = userEvent.setup();
    render(<Data />);
    await open(user, 'Modifică datele medicale și celelalte');
    const minutes = screen.getByLabelText(/^Durata drumului/);
    const described = () =>
      minutes
        .getAttribute('aria-describedby')!
        .split(' ')
        .map((id) => document.getElementById(id)!.textContent);

    expect(described()).toEqual(['min']);
    await user.type(minutes, '900');
    expect(described()).toEqual(['min', 'Scrie un număr de minute între 1 și 600.']);
  });

  it('opens on the field whose row was clicked', async () => {
    const user = userEvent.setup();
    render(<Data />);
    const row = within(screen.getByTestId('person-fields-employment'))
      .getAllByTestId('person-field')
      .find((each) => each.id === 'field-jobTitle')!;

    await user.click(row);
    expect(document.activeElement).toBe(screen.getByLabelText(/^Funcția pe fișă/));
  });
});
