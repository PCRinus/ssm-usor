import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { RiskConfirmBar } from './risk-confirm-bar';
import { RiskSheetCard } from './risk-sheet-card';
import {
  confirmSentence,
  type LibraryName,
  type ProposedFactor,
  type RiskSheet,
  riskSummary,
  type SheetChange,
  sheetState,
  withIncluded,
} from './risks-model';

const factor = (key: string, description: string, group: string): ProposedFactor => ({
  key,
  row: `R${key}`,
  source: { file: 'Dosar/Evaluare.docx', start: 0, end: 10 },
  component: 'means_of_production',
  writtenComponent: 'MIJLOACE DE PRODUCȚIE',
  group,
  description,
  code: null,
  consequence: 'ITM 3-45 zile',
  gravityClass: 2,
  probabilityClass: 3,
  printedLevel: 2,
  measures: [],
  measuresFrom: null,
  actions: null,
  deadline: null,
  responsiblePerson: null,
  observations: null,
  flags: [],
  included: true,
  level: 2,
});

const analyst: RiskSheet = {
  key: 'analyst',
  file: 'Dosar/Evaluare.docx',
  heading: 'Fișa de evaluare: Analist programator',
  kind: 'job_position',
  name: 'Analist programator',
  rows: { first: 'R1', last: 'R4' },
  meansOfProduction: 'Calculator',
  workEnvironment: 'Birou',
  exposure: '8 h / schimb',
  flags: [],
  posts: [{ name: 'Analist programator', existingFactors: 0, choice: null }],
  undecided: false,
  existing: null,
  libraryName: 'Analist programator',
  nameFrom: 'post',
  takenName: null,
  status: 'new',
  match: null,
  choice: 'add',
  sameAs: [],
  copyOf: null,
  factors: [
    factor('a.1', 'Accident rutier la deplasarea cu autoturismul', 'Mijloace de transport'),
    factor('a.2', 'Conducere auto în stare de oboseală', 'Acțiuni greșite'),
    factor('a.3', 'Curenți de aer în birou', 'Microclimat'),
    factor('a.4', 'Poziție de lucru șezând prelungită', 'Efort fizic'),
    factor('a.5', 'Lovire de colțurile mobilierului', 'Riscuri mecanice'),
    factor('a.6', 'Iluminat insuficient la postul de lucru', 'Iluminat'),
  ],
};

const libraryNames: LibraryName[] = [{ id: 'p1', name: 'Birou', archived: false }];

function Harness({ sheet = analyst }: { sheet?: RiskSheet }) {
  const [change, setChange] = useState<SheetChange>({});
  const state = sheetState(sheet, change, {
    postReferences: { 'Analist programator': 'position-1' },
    postsById: new Map([
      ['position-1', { id: 'position-1', name: 'Analist programator', jobPositionId: null }],
    ]),
    existingByReference: new Map(),
    existingFactors: null,
  });
  return (
    <>
      <RiskSheetCard
        state={state}
        original={null}
        readOnly={false}
        nameTaken={false}
        refused={new Set()}
        libraryNames={libraryNames}
        packNames={[]}
        onSheet={(update) => setChange(update)}
        onToggleFactor={(each, included) =>
          setChange((current) => withIncluded(current, [each], included))
        }
        onSetIncluded={(factors, included) =>
          setChange((current) => withIncluded(current, factors, included))
        }
        onEditFactor={() => {}}
        onPickPosts={() => {}}
        onSource={() => {}}
      />
      <RiskConfirmBar
        summary={confirmSentence(riskSummary([state]))}
        note="Poți confirma până pe 20 noiembrie."
        error={null}
      >
        <button type="button">Confirmă evaluările</button>
      </RiskConfirmBar>
      <output data-testid="changes">{JSON.stringify(change)}</output>
    </>
  );
}

const summary = () => screen.getByTestId('library-confirm-summary').textContent;
const row = (description: string) =>
  screen
    .getAllByTestId('risk-import-factor')
    .find((each) => each.textContent?.includes(description))!;

describe('a sheet card with the confirm bar', () => {
  it('goes to the library under its name, with nothing to choose', () => {
    render(<Harness />);

    const library = screen.getByTestId('risk-import-library');
    expect(library.textContent).toContain('Intră ca evaluare nouă, cu numele Analist programator.');
    expect(library.textContent).toContain('E numele postului din document.');
    expect(within(library).queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByText('Nu adăuga')).toBeNull();
  });

  it('counts one factor fewer in the bar once one is unticked, and puts it back', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByTestId('risk-import-show-factors'));
    expect(summary()).toContain(
      'Când confirmi, adăugăm „Analist programator” în bibliotecă, cu 6 factori, și îi scriem pe fișa postului „Analist programator”.'
    );

    await userEvent.click(within(row('Curenți de aer')).getByTestId('risk-import-factor-included'));

    expect(summary()).toContain('cu 5 factori');
    const removed = screen.getByTestId('risk-import-removed');
    expect(removed.textContent).toContain('Scoși de tine');
    expect(within(removed).getByTestId('risk-import-factor').textContent).toContain(
      'Curenți de aer în birou'
    );
    expect(screen.getByTestId('risk-import-factors-summary').textContent).toBe(
      '5 preluați, 1 scos de tine'
    );

    await userEvent.click(within(removed).getByTestId('risk-import-factor-restore'));

    expect(screen.queryByTestId('risk-import-removed')).toBeNull();
    expect(summary()).toContain('cu 6 factori');
    expect(screen.getByTestId('changes').textContent).toBe('{"factors":{"a.3":{}}}');
  });

  it('finds factors by a word, ignoring diacritics, and takes out those found at once', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByTestId('risk-import-factor-search'), 'auto');

    expect(screen.getByTestId('risk-import-factor-search-count').textContent).toBe(
      '2 din 6 factori conțin „auto”.'
    );
    expect(screen.getAllByTestId('risk-import-factor')).toHaveLength(2);
    await userEvent.click(screen.getByTestId('risk-import-factor-search-remove'));

    expect(summary()).toContain('cu 4 factori');
    expect(screen.getByTestId('risk-import-factor-search')).toHaveProperty('value', '');
    const removed = screen.getByTestId('risk-import-removed');
    expect(within(removed).getAllByTestId('risk-import-factor')).toHaveLength(2);

    await userEvent.type(screen.getByTestId('risk-import-factor-search'), 'sezand');
    expect(screen.getByTestId('risk-import-factor-search-count').textContent).toBe(
      '1 din 4 factori conține „sezand”.'
    );
    await userEvent.click(screen.getByTestId('risk-import-factor-search-cancel'));
    expect(screen.queryByTestId('risk-import-factor-search-count')).toBeNull();
  });

  it('says every factor is out and puts them all back at once', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByTestId('risk-import-factor-search'), 'r');
    await userEvent.click(screen.getByTestId('risk-import-factor-search-remove'));

    expect(screen.getByTestId('risk-import-factors-summary').textContent).toBe(
      'Ai scos toți cei 6 factori.'
    );
    expect(screen.getByTestId('risk-import-library').textContent).toContain(
      'Fără factori, nu intră în bibliotecă și nu ajunge pe fișa postului.'
    );
    await userEvent.click(screen.getByTestId('risk-import-restore-all'));
    expect(summary()).toContain('cu 6 factori');
  });

  it('refuses a name the library has when it is saved', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByTestId('risk-import-sheet-rename'));
    const input = screen.getByTestId('risk-import-sheet-name-input');
    await userEvent.clear(input);
    await userEvent.type(input, 'birou');
    await userEvent.click(screen.getByTestId('risk-import-sheet-name-save'));

    expect(screen.getByTestId('risk-import-sheet-name-error').textContent).toBe(
      'Biblioteca are deja o evaluare cu acest nume. Alege alt nume.'
    );
    await userEvent.clear(input);
    await userEvent.type(input, 'Activități de birou');
    await userEvent.click(screen.getByTestId('risk-import-sheet-name-save'));
    expect(summary()).toContain('adăugăm „Activități de birou” în bibliotecă');
    expect(screen.getByTestId('risk-import-library').textContent).toContain(
      'Numele l-ai ales tu; propunerea era „Analist programator”.'
    );
  });

  it('asks a similar sheet to choose, then shows the name only when it goes in separately', async () => {
    render(
      <Harness
        sheet={{
          ...analyst,
          status: 'similar',
          choice: 'add_new',
          libraryName: 'Analist programator (Atelier Mobilă Verde)',
          takenName: 'Analist programator',
          match: {
            evaluationId: 'p2',
            name: 'Analist programator',
            share: 0.75,
            pairs: ['a.1', 'a.2', 'a.3'].map((key, index) => ({
              factor: key,
              libraryFactor: `lf${index}`,
              similarity: 1,
              otherClasses: false,
              otherMeasures: false,
            })),
            onlyInPack: ['a.4'],
            onlyInLibrary: ['lf9', 'lf10'],
          },
        }}
      />
    );

    expect(screen.getByTestId('risk-import-similar-counts').textContent).toBe(
      '3 factori la fel, 1 doar în pachet și 2 doar în evaluarea ta.'
    );
    expect(screen.getByTestId('risk-import-library-outcome').textContent).toBe(
      'Alege dacă folosești evaluarea ta sau o adaugi pe aceasta separat.'
    );
    await userEvent.click(screen.getByTestId('risk-import-library-add_new'));
    const library = screen.getByTestId('risk-import-library');
    expect(library.textContent).toContain(
      'Intră separat, cu numele Analist programator (Atelier Mobilă Verde).'
    );
    expect(library.textContent).toContain(
      'Numele „Analist programator” e al evaluării tale asemănătoare, așa că am adăugat numele clientului.'
    );
    await userEvent.click(screen.getByTestId('risk-import-library-use_existing'));
    expect(screen.queryByTestId('risk-import-sheet-rename')).toBeNull();
    expect(screen.getByTestId('risk-import-library-outcome').textContent).toBe(
      'Evaluarea ta rămâne cum e; fișa postului primește factorii din pachet, legați de ea.'
    );
  });
});
