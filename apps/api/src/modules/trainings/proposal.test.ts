import { describe, expect, it } from 'vitest';

import { buildDocumentContext } from '../documents/context';
import { facts } from '../documents/context.fixture';
import { buildFireSafetyContext } from '../documents/fire-safety';
import {
  fireSafetyTechnicianJobTitle,
  hiringPlans,
  type ProposalFacts,
  sessionHeldIn,
  trainingProposal,
} from './proposal';

const ssmThemes = {
  id: 'd1d1d1d1-0000-4000-8000-000000000001',
  snapshot: buildDocumentContext(facts),
};
const fireThemes = {
  id: 'd2d2d2d2-0000-4000-8000-000000000002',
  snapshot: buildFireSafetyContext({
    ...facts,
    issueDate: '2026-01-19',
    period: 2026,
    firstDecisionNumber: 5,
    branding: true,
  }),
};

const specialist = { name: 'Dan MARIN', jobTitle: 'Inspector SSM' };
const manager = { name: 'Ion POP', jobTitle: 'Șef atelier' };
const representative = { name: 'Maria IONESCU', jobTitle: 'Administrator' };
const technician = { name: 'Radu STAN', jobTitle: fireSafetyTechnicianJobTitle };

const welder = { name: 'Sudor', staffCategory: 'execution' as const };
const accountant = { name: 'Contabil', staffCategory: 'technical_administrative' as const };

const base: ProposalFacts = {
  domain: 'ssm',
  phase: 'periodic',
  heldOn: '2026-04-14',
  position: welder,
  themes: ssmThemes,
  people: {
    specialist,
    workplaceManager: manager,
    legalRepresentative: representative,
    fireSafetyTechnician: technician,
  },
  periodicMinutes: 90,
};

describe('trainingProposal', () => {
  it("proposes the position's session of the month from the occupational safety themes", () => {
    expect(trainingProposal(base)).toEqual({
      durationMinutes: 120,
      material:
        'I.P.S.S.M. Art. 45 – 56; I.P.S.S.M. Activități de birou, Art. 1 – 12; I.P.S.S.M. Sudură oxiacetilenică, Art. 1 – 31',
      trainer: manager,
      verifier: specialist,
      admittedBy: null,
      themesRevisionId: ssmThemes.id,
    });
  });

  it('takes the last session before the month when none falls in it', () => {
    expect(trainingProposal({ ...base, heldOn: '2026-05-30' }).material).toMatch(
      /^I\.P\.S\.S\.M\. Art\. 45 – 56;/
    );
    expect(trainingProposal({ ...base, heldOn: '2026-01-05' }).material).toMatch(
      /^I\.P\.S\.S\.M\. Art\. 236 – 290;/
    );
  });

  it('has the specialist train the technical-administrative staff', () => {
    expect(trainingProposal({ ...base, position: accountant, heldOn: '2026-08-01' })).toMatchObject(
      {
        durationMinutes: 120,
        material: expect.stringMatching(/^I\.P\.S\.S\.M\. Art\. 96 – 290;/),
        trainer: specialist,
        verifier: specialist,
      }
    );
  });

  it('proposes no material without a themes revision, and the schedule duration', () => {
    expect(trainingProposal({ ...base, themes: null })).toEqual({
      durationMinutes: 90,
      material: null,
      trainer: manager,
      verifier: specialist,
      admittedBy: null,
      themesRevisionId: null,
    });
  });

  it('proposes no material for a position the themes do not hold', () => {
    expect(
      trainingProposal({ ...base, position: { name: 'Stivuitorist', staffCategory: 'execution' } })
    ).toMatchObject({ material: null, themesRevisionId: null });
  });

  it("proposes the category's session from the fire-safety themes, with no verifier", () => {
    expect(
      trainingProposal({ ...base, domain: 'psi', themes: fireThemes, heldOn: '2026-05-02' })
    ).toEqual({
      durationMinutes: 120,
      material:
        'IPSU art. 77–130; I.P.S.U. Lucrul cu foc deschis, art. 1–7; instrucțiunile afișate la locul de muncă (Decizia nr. 10 PSI); organizarea apărării împotriva incendiilor la locul de muncă',
      trainer: manager,
      verifier: null,
      admittedBy: null,
      themesRevisionId: fireThemes.id,
    });
  });

  it('has the fire-safety technician train the technical-administrative staff', () => {
    expect(
      trainingProposal({ ...base, domain: 'psi', themes: fireThemes, position: accountant }).trainer
    ).toEqual(technician);
  });

  it('proposes the introductory general plans with the specialist or the technician', () => {
    expect(trainingProposal({ ...base, phase: 'introductory_general' })).toEqual({
      durationMinutes: 240,
      material: hiringPlans.ssm.introductoryGeneral,
      trainer: specialist,
      verifier: specialist,
      admittedBy: null,
      themesRevisionId: null,
    });
    expect(trainingProposal({ ...base, domain: 'psi', phase: 'introductory_general' })).toEqual({
      durationMinutes: 480,
      material: hiringPlans.psi.introductoryGeneral,
      trainer: technician,
      verifier: null,
      admittedBy: null,
      themesRevisionId: null,
    });
  });

  it("cites the position's modules in the occupational safety workplace plan, and admits to work", () => {
    expect(trainingProposal({ ...base, phase: 'workplace' })).toEqual({
      durationMinutes: 240,
      material:
        'H.G. 1051/2006, H.G. 1028/2006, H.G. 1146/2006, H.G. 493/2006, H.G. 259/2022; I.P.S.S.M. Art. 1 – 290; I.P.S.S.M. Activități de birou, Art. 1 – 12; I.P.S.S.M. Sudură oxiacetilenică, Art. 1 – 31; Demonstrații practice privind activitățile desfășurate, echipamentele de muncă utilizate, utilizarea echipamentului individual de protecție, a mijloacelor de alarmare, intervenție, evacuare și de prim ajutor.',
      trainer: manager,
      verifier: specialist,
      admittedBy: manager,
      themesRevisionId: ssmThemes.id,
    });
  });

  it('leaves the modules out of the workplace plan without a themes revision', () => {
    expect(trainingProposal({ ...base, phase: 'workplace', themes: null })).toMatchObject({
      material: `${hiringPlans.ssm.workplaceOpening}${hiringPlans.ssm.workplaceClosing}`,
      themesRevisionId: null,
    });
  });

  it('names the instructions decision in the fire-safety workplace plan', () => {
    expect(
      trainingProposal({ ...base, domain: 'psi', phase: 'workplace', themes: fireThemes })
    ).toMatchObject({
      durationMinutes: 480,
      material: expect.stringContaining(
        'instrucțiunile afișate la locul de muncă (Decizia nr. 10 PSI); organizarea'
      ),
      trainer: manager,
      verifier: null,
      admittedBy: manager,
      themesRevisionId: fireThemes.id,
    });
  });

  it('has the legal representative admit to work where the client names no manager', () => {
    expect(
      trainingProposal({
        ...base,
        phase: 'workplace',
        people: { ...base.people, workplaceManager: null },
      })
    ).toMatchObject({ trainer: representative, admittedBy: representative });
  });

  it('never has the trainee train themself: the representative steps in, then the specialist or the technician', () => {
    const head = { ...manager, employeeId: 'e-head' };
    const trainees = [{ employeeId: 'e-head', fullName: 'Ion POP' }];
    const selfTaught = { ...base, people: { ...base.people, workplaceManager: head }, trainees };
    expect(trainingProposal(selfTaught)).toMatchObject({
      trainer: representative,
      verifier: specialist,
    });
    expect(
      trainingProposal({
        ...selfTaught,
        people: {
          ...selfTaught.people,
          legalRepresentative: { ...representative, employeeId: 'e-head' },
        },
      })
    ).toMatchObject({ trainer: specialist, verifier: specialist });
    expect(
      trainingProposal({
        ...selfTaught,
        domain: 'psi',
        themes: fireThemes,
        people: {
          ...selfTaught.people,
          legalRepresentative: { ...representative, employeeId: 'e-head' },
        },
      })
    ).toMatchObject({ trainer: technician, verifier: null });
    expect(
      trainingProposal({
        ...selfTaught,
        phase: 'workplace',
        trainees: [...trainees, { employeeId: 'e-other', fullName: 'Dan RUS' }],
      })
    ).toMatchObject({ trainer: manager, admittedBy: manager });
  });

  it('proposes an hour and no material for a supplementary training', () => {
    expect(trainingProposal({ ...base, phase: 'supplementary' })).toEqual({
      durationMinutes: 60,
      material: null,
      trainer: manager,
      verifier: specialist,
      admittedBy: null,
      themesRevisionId: null,
    });
  });
});

describe('sessionHeldIn', () => {
  const sessions = [
    { month: 'MAI', content: 'b', duration: '120 min' },
    { month: 'FEBRUARIE', content: 'a', duration: '120 min' },
  ];

  it('finds none in an empty schedule', () => {
    expect(sessionHeldIn([], '2026-03-01')).toBeNull();
  });

  it('takes the session of the month, else the one before, else the last of the year', () => {
    expect(sessionHeldIn(sessions, '2026-05-01')?.content).toBe('b');
    expect(sessionHeldIn(sessions, '2026-03-31')?.content).toBe('a');
    expect(sessionHeldIn(sessions, '2026-01-31')?.content).toBe('b');
  });
});
