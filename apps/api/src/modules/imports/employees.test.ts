import { describe, expect, it } from 'vitest';

import type { ClientTrainingFacts } from '../trainings/client-facts';
import { hiringPlans } from '../trainings/proposal';
import { peopleCounts, personStates, themesFromFacts } from './employees';

const positionId = 'b0000000-0000-4000-8000-000000000001';

const facts: ClientTrainingFacts = {
  positions: new Map([[positionId, { name: 'Vânzător', staffCategory: 'execution' }]]),
  themes: {
    ssm: {
      id: 'd0000000-0000-4000-8000-000000000001',
      snapshot: {
        themes: {
          positions: [
            {
              name: 'VÂNZĂTOR',
              sessions: [
                { month: 'MAI', content: 'Riscurile la casa de marcat', duration: '90 min' },
              ],
            },
          ],
        },
      },
    },
    psi: null,
  },
  people: {
    specialist: { name: 'Ana Popescu', jobTitle: 'Inspector SSM', employeeId: null },
    workplaceManager: { name: 'Elena Marin', jobTitle: 'Șef magazin', employeeId: null },
    legalRepresentative: { name: 'Vasile Georgescu', jobTitle: 'Administrator', employeeId: null },
    fireSafetyTechnician: { name: 'Ion Stan', jobTitle: 'Cadru tehnic PSI', employeeId: null },
  },
  periodicMinutes: { ssm: 60, psi: 120 },
};

describe('themesFromFacts', () => {
  const themes = themesFromFacts(facts, '2026-10-31');

  it("proposes the post's session of the row's month, by the trainer the themes name", () => {
    expect(
      themes({ domain: 'ssm', phase: 'periodic', heldOn: '2025-05-12', jobPositionId: positionId })
    ).toEqual({
      trainerName: 'Elena Marin',
      trainerJobTitle: 'Șef magazin',
      material: 'Riscurile la casa de marcat',
      durationMinutes: 90,
    });
  });

  it('proposes no periodic material for a row with no date, whose month is unknown', () => {
    expect(
      themes({ domain: 'ssm', phase: 'periodic', heldOn: null, jobPositionId: positionId })
    ).toMatchObject({ trainerName: 'Elena Marin', material: null, durationMinutes: 90 });
  });

  it('proposes the hiring plans and the external trainers, as for a training typed by hand', () => {
    expect(
      themes({ domain: 'psi', phase: 'introductory_general', heldOn: null, jobPositionId: null })
    ).toEqual({
      trainerName: 'Ion Stan',
      trainerJobTitle: 'Cadru tehnic PSI',
      material: hiringPlans.psi.introductoryGeneral,
      durationMinutes: 480,
    });
    expect(
      themes({ domain: 'psi', phase: 'periodic', heldOn: '2025-05-12', jobPositionId: null })
    ).toMatchObject({ material: null, durationMinutes: 120 });
  });
});

describe('personStates', () => {
  it('reads every person as still to check unless the member checked or set them aside', () => {
    const states = personStates(
      { people: [{ id: 'person-1' }, { id: 'person-2' }, { id: 'person-3' }] },
      {
        people: {
          'person-1': { state: 'checked' },
          'person-3': { state: 'set_aside' },
          'person-9': { state: 'checked' },
        },
        jobTitles: {},
        workplaces: {},
        rows: {},
        pages: {},
      }
    );

    expect(states).toEqual({
      'person-1': 'checked',
      'person-2': 'to_check',
      'person-3': 'set_aside',
    });
    expect(peopleCounts(states)).toEqual({ total: 3, toCheck: 1, checked: 1, setAside: 1 });
  });
});
