import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { RiskSheetCard } from './risk-sheet-card';
import {
  factorChangeFrom,
  type FactorState,
  placedPlanRows,
  type PlanRow,
  type ProposedFactor,
  type RiskSheet,
  type SheetChange,
  sheetState,
  withField,
  withIncluded,
} from './risks-model';

const ownFactor: ProposedFactor = {
  key: 'reception.1',
  row: 'R12',
  source: { file: 'Dosar/Evaluare.docx', start: 0, end: 10 },
  component: 'work_environment',
  writtenComponent: 'MEDIUL DE MUNCĂ',
  group: 'Factori de risc fizic',
  description: 'Iluminat insuficient la recepție',
  code: 'F1',
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
};

const planFactor: ProposedFactor = {
  ...ownFactor,
  key: 'plan-R22',
  row: 'R22',
  source: { file: 'Dosar/Plan.docx', start: 0, end: 10 },
  component: null,
  writtenComponent: '',
  group: '',
  description:
    'Neutilizarea echipamentului individual de protecţie şi a celorlalte mijloace de protecţie din dotare.',
  code: null,
  consequence: '',
  gravityClass: null,
  probabilityClass: null,
  printedLevel: null,
  measures: [{ kind: 'organizational', description: 'Instruirea personalului;' }],
  measuresFrom: 'plan',
  actions: 'Alocarea fondurilor materiale necesare',
  deadline: 'Periodic',
  responsiblePerson: 'Cond. loc munca; Serv extern',
  included: false,
  level: null,
};

const reception: RiskSheet = {
  key: 'reception',
  file: 'Dosar/Evaluare.docx',
  heading: 'Fișa de evaluare: Recepționer',
  kind: 'job_position',
  name: 'Recepționer',
  rows: { first: 'R10', last: 'R14' },
  meansOfProduction: 'Calculator',
  workEnvironment: 'Recepție',
  exposure: '8 h / schimb',
  flags: [],
  posts: [{ name: 'Recepționer', existingFactors: 0, choice: null }],
  undecided: false,
  existing: null,
  libraryName: 'Recepționer',
  status: 'new',
  match: null,
  choice: 'add',
  sameAs: [],
  copyOf: null,
  factors: [ownFactor],
};

const rows: PlanRow[] = [
  {
    row: 'R22',
    file: 'Dosar/Plan.docx',
    text: '| 22 | RECEPTIONER HOTEL | Neutilizarea echipamentului |',
    post: 'RECEPTIONER HOTEL',
    risk: 'Neutilizarea echipamentului',
    sheet: 'reception',
    factor: planFactor,
  },
];

const dialogValues = {
  component: 'executant' as const,
  group: 'Omisiuni',
  gravityClass: 3,
  probabilityClass: 4,
};

function Harness({
  readOnly = false,
  initial = {},
  onEdit = () => {},
}: {
  readOnly?: boolean;
  initial?: SheetChange;
  onEdit?: (factor: FactorState) => void;
}) {
  const [change, setChange] = useState<SheetChange>(initial);
  const state = sheetState(reception, change, {
    postReferences: { Recepționer: 'position-1' },
    postsById: new Map([
      ['position-1', { id: 'position-1', name: 'Recepționer', jobPositionId: null }],
    ]),
    existingByReference: new Map(),
    existingFactors: null,
    planFactors: placedPlanRows(rows, [reception]),
  });
  const setFactor = (key: string, update: (current: SheetChange['factors']) => object) =>
    setChange((current) => ({
      ...current,
      factors: { ...current.factors, [key]: update(current.factors) },
    }));
  return (
    <RiskSheetCard
      state={state}
      original={null}
      readOnly={readOnly}
      nameTaken={false}
      refused={new Set()}
      libraryNames={[]}
      packNames={[]}
      onSheet={(update) => setChange(update)}
      onSetIncluded={(factors, included) =>
        setChange((current) => withIncluded(current, factors, included))
      }
      onToggleFactor={(factor, included) =>
        setFactor(factor.factor.key, (factors) =>
          withField(
            factors?.[factor.factor.key] ?? {},
            'included',
            included === factor.factor.included ? undefined : included
          )
        )
      }
      onEditFactor={(factor) => {
        onEdit(factor);
        setFactor(factor.factor.key, () =>
          factorChangeFrom(factor.factor, {
            ...dialogValues,
            description: factor.description,
            measures: factor.measures,
            actions: factor.actions,
            deadline: factor.deadline,
            responsiblePerson: factor.responsiblePerson,
            observations: factor.observations,
          })
        );
      }}
      onPickPosts={() => {}}
      onSource={() => {}}
    />
  );
}

const planRowsRow = () => screen.getByTestId('risk-import-plan-rows-row');

describe('the plan rows on a sheet card', () => {
  it('says a row is for the post and keeps it folded until asked', async () => {
    render(<Harness />);

    expect(planRowsRow().getAttribute('data-tone')).toBe('warning');
    expect(planRowsRow().textContent).toContain(
      'Un rând din documente e pentru acest post, dar nu l-am putut lega de niciun factor de pe fișă.'
    );
    expect(screen.queryByTestId('risk-import-plan-rows')).toBeNull();

    const toggle = screen.getByTestId('risk-import-plan-rows-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain('Arată rândul');
    await userEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toContain('Ascunde rândul');
    const row = screen.getByTestId('risk-import-plan-row');
    expect(row.textContent).toContain('Din planul de prevenire');
    expect(row.textContent).toContain(
      'Măsuri organizatorice: Instruirea personalului; · Acțiuni: Alocarea fondurilor materiale necesare · Termen: Periodic · Răspunde: Cond. loc munca; Serv extern'
    );
    expect(within(row).getByRole('button', { name: /Vezi în document/ })).toBeTruthy();
  });

  it('adds a row as a factor through the factor form, and takes it off again', async () => {
    const onEdit = vi.fn();
    render(<Harness onEdit={onEdit} />);
    await userEvent.click(screen.getByTestId('risk-import-plan-rows-toggle'));
    await userEvent.click(screen.getByTestId('risk-import-plan-row-add'));

    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ description: planFactor.description })
    );
    const row = screen.getByTestId('risk-import-plan-row');
    expect(row.getAttribute('data-added')).toBe('true');
    expect(row.textContent).toContain('gravitate 3, probabilitate 4');
    expect(row.textContent).toContain('Adăugat pe fișă ca factor.');
    expect(within(row).getByTestId('risk-level').textContent).toContain('3');
    expect(planRowsRow().getAttribute('data-tone')).toBe('done');
    expect(planRowsRow().textContent).toContain('L-ai adăugat ca factor.');

    expect(
      within(row)
        .getAllByRole('button')
        .map((button) => button.textContent)
    ).toEqual(['Modifică', 'Scoate de pe fișă', 'Vezi în document']);

    await userEvent.click(screen.getByTestId('risk-import-plan-row-remove'));

    expect(screen.getByTestId('risk-import-plan-row').hasAttribute('data-added')).toBe(false);
    expect(planRowsRow().getAttribute('data-tone')).toBe('warning');
  });

  it('shows the rows without buttons other than the document once read-only, added ones as added', async () => {
    render(
      <Harness
        readOnly
        initial={{ factors: { 'plan-R22': { ...dialogValues, included: true } } }}
      />
    );
    await userEvent.click(screen.getByTestId('risk-import-plan-rows-toggle'));

    const row = screen.getByTestId('risk-import-plan-row');
    expect(row.textContent).toContain('Adăugat pe fișă ca factor.');
    expect(
      within(row)
        .getAllByRole('button')
        .map((button) => button.textContent)
    ).toEqual(['Vezi în document']);
  });
});
