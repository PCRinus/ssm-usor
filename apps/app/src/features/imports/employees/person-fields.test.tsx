import { commuteMeansKey } from '@ssm-usor/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { employeeProposal } from '@/test/employee-import-fixture';
import { replayedInput, replayedText } from '@/test/replay';

import {
  decisionsOf,
  emptyChanges,
  isExisting,
  type Person,
  type Proposal,
  statesOf,
} from './employee-review-model';
import { dialogRowsFor } from './person-dialog-rows';
import { DataPending, ExistingComparison, PersonData } from './person-fields';

const proposal = employeeProposal() as unknown as Proposal;
const person = proposal.people.find((each) => each.id === 'pop')!;

function Data({ who = person }: { who?: Person }) {
  const [current, setCurrent] = useState(emptyChanges);
  const people = proposal.people.map((each) => (each.id === who.id ? who : each));
  const context = {
    proposal: { ...proposal, people },
    changes: current,
    states: statesOf(proposal, current),
    workplaceCount: 2,
    today: '2026-11-12',
  };
  const decisions = decisionsOf(context, who);
  const Card = isExisting(context, who) ? ExistingComparison : PersonData;
  return (
    <>
      <DataPending context={context} person={who} decisions={decisions} />
      <Card
        context={context}
        person={who}
        decisions={decisions}
        onChange={(mutate) => setCurrent(mutate)}
      />
      <output data-testid="fields">{JSON.stringify(current.people[who.id]?.fields ?? null)}</output>
    </>
  );
}

const withFields = (id: string, fields: Partial<Person['fields']>): Person => {
  const each = proposal.people.find((one) => one.id === id)!;
  return { ...each, fields: { ...each.fields, ...fields } };
};

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
      ['residenceAddress'],
      ['education'],
      ['qualification'],
    ]);
    await user.click(screen.getByRole('button', { name: 'Renunță' }));

    await open(user, 'Modifică datele de angajare');
    expect(rows()).toEqual([['jobTitle'], ['hiredAt', 'leftOn'], ['employeeNumber']]);
    await user.click(screen.getByRole('button', { name: 'Renunță' }));

    await open(user, 'Modifică datele medicale și celelalte');
    expect(rows()).toEqual([
      ['bloodGroup', 'rhFactor'],
      ['commuteRoute'],
      ['commuteMeans'],
      ['commuteMinutes'],
    ]);
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

  it('writes the addresses, the job title and the route in fields that wrap, the rest on one line', async () => {
    const user = userEvent.setup();
    render(<Data />);

    await open(user, 'Modifică datele personale');
    expect(screen.getByLabelText(/^Domiciliul/).tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText(/^Adresa unde locuiește/).tagName).toBe('TEXTAREA');
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

describe('the card of the data read from the sheets', () => {
  const row = (name: string) => document.getElementById(`field-${name}`)!;

  it('tags a value the member changed, without a pencil, and says what the sheet read', async () => {
    const user = userEvent.setup();
    render(<Data />);
    expect(within(row('lastName')).queryByTestId('edited-tag')).toBeNull();

    await open(user, 'Modifică datele personale');
    const lastName = screen.getByLabelText(/^Nume/);
    await user.clear(lastName);
    await user.type(lastName, 'Popescu');
    await user.click(screen.getByTestId('person-fields-save'));

    const tag = within(row('lastName')).getByTestId('edited-tag');
    expect(tag.textContent).toBe('Modificat de tine');
    expect(tag.querySelector('svg')).toBeNull();
    expect(within(row('lastName')).getByTestId('person-field-sheet').textContent).toBe(
      'De pe fișă: Pop'
    );
    expect(row('lastName').dataset.tone).toBe('done');
    expect(within(row('lastName')).getByRole('button', { name: /^Fotografia 1/ })).toBeTruthy();
  });

  it('asks for a required value missing from the sheets in place of the value', () => {
    render(<Data who={{ ...person, fields: { ...person.fields, hiredAt: { options: [] } } }} />);
    expect(row('hiredAt').dataset.tone).toBe('todo');
    expect(within(row('hiredAt')).getByTestId('person-field-missing').textContent).toBe(
      'Lipsește de pe fișe. E obligatoriu pentru crearea lucrătorului.'
    );
    expect(row('hiredAt').textContent).not.toContain('Completează');
  });

  it('keeps an empty optional field as a row that says it is not filled in', () => {
    render(<Data />);
    expect(row('birthPlace').dataset.tone).toBe('optional');
    expect(row('birthPlace').textContent).toContain('Necompletat');
    expect(within(row('birthPlace')).queryByTestId('person-field-missing')).toBeNull();
    expect(row('jobTitle').dataset.tone).toBe('done');
  });

  it('does not call the commute route optional in its dialog, which the SSM sheet needs', async () => {
    const user = userEvent.setup();
    render(<Data who={withFields('pop', { commuteRoute: { options: [] } })} />);

    await open(user, 'Modifică datele medicale și celelalte');
    const label = (name: string) =>
      dialog().querySelector(`label[for="person-field-${name}"]`)?.textContent;
    expect(label('commuteRoute')).toContain('Traseul spre locul de muncă');
    expect(label('commuteRoute')).not.toContain('(opțional)');
    expect(label('commuteMinutes')).toContain('(opțional)');
  });

  it('shows the means of transport by their names and corrects them in the same picker as the form', async () => {
    const user = userEvent.setup();
    render(
      <Data
        who={withFields('pop', {
          commuteMeans: {
            options: [
              {
                value: commuteMeansKey({ means: ['public_transport'], other: null })!,
                pageIds: ['p3'],
              },
            ],
          },
        })}
      />
    );
    expect(row('commuteMeans').textContent).toContain('Transport public');

    await open(user, 'Modifică datele medicale și celelalte');
    const picker = screen.getByLabelText(/^Mijloace de transport/);
    expect(picker.textContent).toBe('Transport public');
    await user.click(picker);
    await user.click(await screen.findByTestId('person-field-commuteMeans-on_foot'));
    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('person-fields-save'));

    expect(written()).toEqual({
      commuteMeans: {
        value: commuteMeansKey({ means: ['on_foot', 'public_transport'], other: null }),
      },
    });
  });

  it('opens the whole group from its Modifică button', async () => {
    const user = userEvent.setup();
    render(<Data />);
    const button = within(screen.getByTestId('person-fields-employment')).getByRole('button', {
      name: 'Modifică datele de angajare',
    });
    expect(button.textContent).toBe('Modifică');

    await user.click(button);
    expect(within(dialog()).getByRole('heading').textContent).toBe('Angajare');
    expect(rows()).toEqual([['jobTitle'], ['hiredAt', 'leftOn'], ['employeeNumber']]);
  });

  const pending = () => screen.getByTestId('person-data-pending').textContent;

  it('counts a field with two things to decide once', () => {
    render(
      <Data
        who={withFields('pop', {
          cnp: { options: [{ value: '2710212250545', pageIds: ['p3'] }] },
          birthDate: { options: [{ value: '12.03.1971', pageIds: ['p3'] }] },
        })}
      />
    );
    expect(row('birthDate').dataset.tone).toBe('todo');
    expect(row('birthDate').textContent).toContain('Corectează data nașterii');
    expect(row('birthDate').textContent).toContain('Data nașterii nu se potrivește cu CNP-ul');
    expect(pending()).toBe('1 de hotărât');
  });

  it('marks a field whose sheets disagree as a choice made above, and counts it', () => {
    render(
      <Data
        who={withFields('pop', {
          hiredAt: {
            options: [
              { value: '2023-05-02', pageIds: ['p3'] },
              { value: '2023-05-04', pageIds: ['p3'] },
            ],
          },
        })}
      />
    );
    expect(row('hiredAt').dataset.tone).toBe('todo');
    expect(row('hiredAt').textContent).toContain('De ales mai sus');
    expect(pending()).toBe('1 de hotărât');
  });

  it('points no photograph at a value the member wrote over sheets that disagree', async () => {
    const user = userEvent.setup();
    render(
      <Data
        who={withFields('toma', {
          lastName: {
            options: [
              { value: 'Toma', pageIds: ['p1'] },
              { value: 'Tomescu', pageIds: ['p2'] },
            ],
          },
        })}
      />
    );
    await open(user, 'Modifică datele personale');
    await user.type(screen.getByLabelText(/^Nume/), 'Tomșa');
    await user.click(screen.getByTestId('person-fields-save'));

    expect(within(row('lastName')).getByTestId('person-field-sheet').textContent).toBe(
      'De pe fișă: Toma; Tomescu'
    );
    expect(within(row('lastName')).queryByRole('button', { name: /^Fotografia/ })).toBeNull();
  });

  it('shows an existing worker a value that differs from the app, and takes the sheet on request', async () => {
    const user = userEvent.setup();
    render(<Data who={proposal.people.find((each) => each.id === 'lazar')!} />);
    const address = row('homeAddress');
    expect(address.dataset.tone).toBe('done');
    expect(address.textContent).toContain('Rămâne Str. Viitorului nr. 3, Sibiu');
    expect(address.textContent).toContain('Pe fișă: Str. Fabricii nr. 21, Sibiu');
    expect(within(address).getByRole('button', { name: /^Fotografia 1/ })).toBeTruthy();
    expect(pending()).toBe('Gata de confirmat');

    await user.click(within(address).getByTestId('person-existing-take-sheet'));
    expect(row('homeAddress').textContent).toContain('Devine Str. Fabricii nr. 21, Sibiu');
  });

  it('leaves out of the count an existing worker’s choice this card shows no row for', () => {
    render(
      <Data
        who={withFields('lazar', {
          hiredAt: {
            options: [
              { value: '2019-04-03', pageIds: ['p4'] },
              { value: '2019-05-03', pageIds: ['p4'] },
            ],
            app: null,
          },
        })}
      />
    );
    expect(document.getElementById('field-hiredAt')).toBeNull();
    expect(pending()).toBe('Gata de confirmat');
  });
});

describe('what a session replay of the data read from the sheets shows', () => {
  const row = (name: string) => document.getElementById(`field-${name}`)!;
  const value = (name: string) => row(name).querySelector('dd > div')!;

  it('masks the person, keeps the shape of an address and shows the job', () => {
    render(
      <Data
        who={withFields('pop', {
          cnp: { options: [{ value: '2900101400128', pageIds: ['p3'] }] },
          homeAddress: { options: [{ value: 'Str. Lungă nr. 4, Sibiu', pageIds: ['p3'] }] },
        })}
      />
    );

    expect(replayedText(value('lastName'))).toBe('***');
    expect(replayedText(value('cnp'))).not.toMatch(/\d/);
    expect(replayedText(value('homeAddress'))).toBe('Str. Xxxxx nr. 0, Xxxxx');
    expect(replayedText(value('jobTitle'))).toBe('Vânzător');
    const label = row('jobTitle').querySelector('dt')!;
    expect(replayedText(label)).toBe(label.textContent);
  });

  it('masks what is typed about the person in its dialog, and shows the job', async () => {
    const user = userEvent.setup();
    render(<Data />);

    await open(user, 'Modifică datele personale');
    expect(replayedInput(screen.getByLabelText<HTMLInputElement>(/^Nume/))).toBe('***');
    await user.click(screen.getByRole('button', { name: 'Renunță' }));
    await open(user, 'Modifică datele de angajare');
    expect(replayedInput(screen.getByLabelText<HTMLTextAreaElement>(/^Funcția/))).toBe('Vânzător');
  });
});
