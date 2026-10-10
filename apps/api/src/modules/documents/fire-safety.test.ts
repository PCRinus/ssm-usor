import { describe, expect, it } from 'vitest';

import { type DocumentFacts, missingDocumentData } from './context';
import { facts, officeId, workshopId } from './context.fixture';
import {
  buildFireSafetyContext,
  buildPartialFireSafetyContext,
  fireSafetyGapConcerns,
  missingFireSafetyData,
} from './fire-safety';
import { setOfGroup, setRules } from './sets';

const card = facts.fireSafety.card!;
const withCard = (changes: Partial<typeof card> | null): DocumentFacts => ({
  ...facts,
  fireSafety: { ...facts.fireSafety, card: changes && { ...card, ...changes } },
});

describe('what the fire-safety set is missing', () => {
  it('is nothing for complete facts', () => {
    expect(missingFireSafetyData(facts)).toEqual([]);
  });

  it('is only what its documents print, in the order of the form', () => {
    const lacking: DocumentFacts = {
      ...facts,
      organization: {
        legalName: ' ',
        representativeName: null,
        representativeRole: null,
        fireSafetyTechnicianName: null,
      },
      specialist: null,
      client: { ...facts.client, representativeName: null, representativeRole: '', caenCode: null },
      responsiblePersons: [],
      jobPositions: [],
      riskEvaluations: [],
      workplaces: [],
      fireSafety: { card: null, equipment: [], installations: [] },
    };
    expect(missingFireSafetyData(lacking)).toEqual([
      'provider.legalName',
      'provider.fireSafetyTechnician',
      'client.representativeName',
      'client.representativeRole',
      'fire.trainingSchedule',
      'fire.waste',
      'responsible.workplace_manager',
      'responsible.fire_safety_coordinator',
      'responsible.fire_intervention_leader',
      'positions.any',
      'fire.workplaces',
    ]);
  });

  it('asks for the whole training schedule and at least one kind of waste', () => {
    for (const gap of [
      'periodicTrainingHours',
      'administrativeTrainingIntervalMonths',
      'workerTrainingIntervalMonths',
      'trainingFirstMonth',
      'trainingDayFrom',
      'trainingDayTo',
    ] as const) {
      expect(missingFireSafetyData(withCard({ [gap]: null }))).toEqual(['fire.trainingSchedule']);
    }
    expect(missingFireSafetyData(withCard({ wasteKinds: [] }))).toEqual(['fire.waste']);
    expect(missingFireSafetyData(withCard({ wasteKinds: ['  '] }))).toEqual(['fire.waste']);
    expect(missingFireSafetyData(withCard({ wasteContractor: null }))).toEqual([]);
    expect(missingFireSafetyData(withCard(null))).toEqual(['fire.trainingSchedule', 'fire.waste']);
  });

  it('asks every active workplace for its seven facts, the specific measures not among them', () => {
    const lacking = (changes: Partial<DocumentFacts['workplaces'][number]>) =>
      missingFireSafetyData({
        ...facts,
        workplaces: [facts.workplaces[0]!, { ...facts.workplaces[1]!, ...changes }],
      });
    expect(lacking({ specificMeasures: null })).toEqual([]);
    for (const gap of [
      { activity: ' ' },
      { floorAreaM2: null },
      { extinguisherNorm: null },
      { assemblyPoint: null },
      { combustibleMaterials: null },
      { ignitionSources: '' },
      { fireRiskEquipment: null },
    ]) {
      expect(lacking(gap)).toEqual(['fire.workplaces']);
    }
  });

  it('asks every active workplace for an extinguisher, which no other unit stands for', () => {
    const equipment = facts.fireSafety.equipment.filter(
      (unit) => unit.workplaceId !== officeId || unit.kind !== 'extinguisher'
    );
    expect(
      missingFireSafetyData({ ...facts, fireSafety: { ...facts.fireSafety, equipment } })
    ).toEqual(['fire.equipment']);
    expect(
      missingFireSafetyData({
        ...facts,
        workplaces: [facts.workplaces[0]!],
        fireSafety: { ...facts.fireSafety, equipment },
      })
    ).toEqual([]);
  });

  it('never holds back the occupational safety set, nor is held back by it', () => {
    const withoutTechnician = {
      ...facts,
      organization: { ...facts.organization, fireSafetyTechnicianName: '  ' },
    };
    expect(missingDocumentData(withoutTechnician)).toEqual([]);
    const occupationalGaps: DocumentFacts = {
      ...facts,
      client: { ...facts.client, periodicTrainingMinutes: null },
      jobPositions: facts.jobPositions.map((position) => ({
        ...position,
        needsProtectiveEquipment: null,
      })),
      riskEvaluations: [],
    };
    expect(missingDocumentData(occupationalGaps)).not.toEqual([]);
    expect(missingFireSafetyData(occupationalGaps)).toEqual([]);
  });
});

describe('the fire-safety context', () => {
  it('holds the client, the provider, the technician, the date and the branding switch', () => {
    expect(buildFireSafetyContext(facts)).toMatchObject({
      branding: true,
      issueDate: '19.01.2026',
      client: {
        legalName: 'S.C. PIPETECH S.R.L.',
        representativeName: 'Florin Cristian TALOȘ',
        representativeRole: 'Administrator',
      },
      provider: {
        legalName: 'S.C. SERVICIU EXTERN DEMO S.R.L.',
        representativeName: 'Ana IONESCU',
        representativeRole: 'Administrator',
      },
      fireSafetyTechnician: { name: 'Radu STAN' },
    });
  });

  it('keeps the shape of the provider without its representative, which no document prints', () => {
    const context = buildFireSafetyContext({
      ...facts,
      branding: false,
      organization: {
        ...facts.organization,
        representativeName: null,
        representativeRole: null,
        fireSafetyTechnicianName: '  Radu STAN ',
      },
    });
    expect(context.provider).toEqual({
      legalName: 'S.C. SERVICIU EXTERN DEMO S.R.L.',
      representativeName: '',
      representativeRole: '',
    });
    expect(context.fireSafetyTechnician).toEqual({ name: 'Radu STAN' });
    expect(context.branding).toBe(false);
  });

  it('numbers each decision by its place in the binder, from the first number', () => {
    expect(buildFireSafetyContext(facts).fire.decisionNumbers).toEqual({
      organization: '5 PSI',
      training: '6 PSI',
      openFire: '7 PSI',
      seasons: '9 PSI',
      waste: '12 PSI',
    });
    expect(
      buildFireSafetyContext({ ...facts, firstDecisionNumber: 1 }).fire.decisionNumbers
    ).toEqual({
      organization: '1 PSI',
      training: '2 PSI',
      openFire: '3 PSI',
      seasons: '5 PSI',
      waste: '8 PSI',
    });
  });

  it('words the training schedule as the decisions print it', () => {
    expect(buildFireSafetyContext(facts).fire.schedule).toEqual({
      periodicHours: 2,
      periodicLabel: '2 ore',
      administrativeIntervalMonths: 6,
      administrativeIntervalLabel: '6 LUNI',
      administrativeMonths: 'lunile februarie și august',
      workerIntervalMonths: 3,
      workerIntervalLabel: '3 LUNI',
      workerMonths: 'lunile februarie, mai, august și noiembrie',
      firstMonth: 2,
      firstMonthLabel: 'februarie',
      dayFrom: 2,
      dayTo: 7,
    });
    const monthly = buildFireSafetyContext(
      withCard({
        periodicTrainingHours: 1,
        workerTrainingIntervalMonths: 1,
        trainingFirstMonth: 12,
      })
    ).fire.schedule;
    expect(monthly.periodicLabel).toBe('1 oră');
    expect(monthly.workerIntervalLabel).toBe('1 LUNĂ');
    expect(monthly.administrativeMonths).toBe('lunile iunie și decembrie');
  });

  it('names the posts by staff category, and nothing else of them', () => {
    expect(buildFireSafetyContext(facts).fire.staff).toEqual({
      administrative: ['Contabil'],
      execution: ['Sudor'],
      administrativeText: 'Contabil',
      executionText: 'Sudor',
    });
    const staff = buildFireSafetyContext({
      ...facts,
      jobPositions: facts.jobPositions.map((position) => ({
        ...position,
        staffCategory: 'execution' as const,
      })),
    }).fire.staff;
    expect(staff.administrativeText).toBeNull();
    expect(staff.executionText).toBe('Contabil, Sudor');
  });

  it('names the coordinator, the leader and the workplace managers, each once', () => {
    const fire = buildFireSafetyContext(facts).fire;
    expect(fire.coordinator).toEqual({ name: 'Florin Cristian TALOȘ', jobTitle: 'Administrator' });
    expect(fire.interventionLeader).toEqual({ name: 'Ioana PETRE', jobTitle: 'Șef de echipă' });
    expect(fire.workplaceManagers).toEqual([
      { name: 'Florin Cristian TALOȘ', jobTitle: 'Administrator', workplaceName: null },
      { name: 'Ioana PETRE', jobTitle: 'Șef de echipă', workplaceName: 'Atelier Ghiroda' },
    ]);
    expect(fire.designated).toEqual([
      { name: 'Florin Cristian TALOȘ', jobTitle: 'Administrator' },
      { name: 'Ioana PETRE', jobTitle: 'Șef de echipă' },
    ]);
  });

  it('counts the extinguishers of a workplace by agent, capacity and wheels', () => {
    const [workshop, office] = buildFireSafetyContext(facts).fire.workplaces;
    expect(workshop!.extinguishers).toEqual([
      { code: 'P6', agentLabel: 'Pulbere', capacityLabel: '6 kg', wheeled: false, count: 2 },
      { code: 'P50', agentLabel: 'Pulbere', capacityLabel: '50 kg', wheeled: true, count: 1 },
      {
        code: 'G5',
        agentLabel: 'Dioxid de carbon (CO₂)',
        capacityLabel: '5 kg',
        wheeled: false,
        count: 1,
      },
    ]);
    expect(workshop!.extinguisherCount).toBe(4);
    expect(workshop!.otherEquipment).toEqual([{ kindLabel: 'Ladă cu nisip', count: 1 }]);
    expect(office!.extinguishers).toEqual([
      {
        code: 'SM9',
        agentLabel: 'Spumă mecanică',
        capacityLabel: '9 l',
        wheeled: false,
        count: 1,
      },
    ]);
    expect(office!.otherEquipment).toEqual([{ kindLabel: 'Pătură antifoc', count: 1 }]);
  });

  it('prints each workplace with its facts, its installations and its people', () => {
    const fire = buildFireSafetyContext(facts).fire;
    const [workshop, office] = fire.workplaces;
    expect(workshop).toMatchObject({
      first: true,
      name: 'Atelier Ghiroda',
      activity: 'Atelier de sudură',
      address: 'Ghiroda, județul Timiș, Str. Industriilor 4',
      floorAreaM2: 420,
      normLabel: 'Alte amenajări (1 buc./150 m²)',
      assemblyPoint: 'Parcarea din fața atelierului',
      specificMeasures: 'Sudura numai cu permis de lucru cu foc.',
      installations: [{ kindLabel: 'Hidranți exteriori', description: 'Doi hidranți în curte' }],
      hasInstallations: true,
      hasExteriorHydrants: true,
      hasInteriorHydrants: false,
      manager: { name: 'Florin Cristian TALOȘ', jobTitle: 'Administrator' },
      firstIntervention: [
        {
          name: 'Ioana PETRE',
          jobTitle: 'Șef de echipă',
          roleLabel: 'șef echipă de primă intervenție',
        },
        {
          name: 'Florin Cristian TALOȘ',
          jobTitle: 'Administrator',
          roleLabel: 'coordonator privind apărarea împotriva incendiilor',
        },
      ],
      firstInterventionNames: 'Ioana PETRE și Florin Cristian TALOȘ',
      interventionLeaderName: 'Ioana PETRE',
    });
    expect(office).toMatchObject({
      first: false,
      specificMeasures: '',
      hasExteriorHydrants: false,
      hasInteriorHydrants: true,
      manager: { name: 'Florin Cristian TALOȘ', jobTitle: 'Administrator' },
      firstInterventionNames: 'Florin Cristian TALOȘ',
      interventionLeaderName: 'Ioana PETRE',
    });
    expect(office!.installations[0]).toEqual({
      kindLabel: 'Instalație de detectare, semnalizare și avertizare la incendiu',
      description: '',
    });
    expect(fire.hasExteriorHydrants).toBe(true);
    expect(fire.waste).toEqual({
      kinds: ['deșeuri de carton, hârtie, plastic', 'deșeuri menajere'],
      contractor: 'S.C. ECO COLECT S.R.L.',
    });
  });

  it('leaves a workplace without a manager of its own to the template', () => {
    const fire = buildFireSafetyContext({
      ...facts,
      responsiblePersons: facts.responsiblePersons.map((person) => ({
        ...person,
        workplaceId: person.roles.includes('workplace_manager') ? workshopId : person.workplaceId,
      })),
    }).fire;
    expect(fire.workplaces[1]!.manager).toBeNull();
    expect(fire.workplaces[0]!.manager?.name).toBe('Florin Cristian TALOȘ');
  });

  it('refuses to be built with something missing', () => {
    expect(() =>
      buildFireSafetyContext({
        ...facts,
        organization: { ...facts.organization, fireSafetyTechnicianName: null },
      })
    ).toThrow(/provider\.fireSafetyTechnician/);
    expect(() => buildFireSafetyContext(withCard({ wasteKinds: [] }))).toThrow(/fire\.waste/);
  });

  it('is what a fire-safety template is merged with, whatever the type or number', () => {
    expect(setRules.fire_safety.data(facts, 'fire_registers', 4)).toEqual(
      buildFireSafetyContext(facts)
    );
  });
});

describe('a fire-safety document generated again', () => {
  const stageTwoGaps: DocumentFacts = {
    ...facts,
    responsiblePersons: [],
    jobPositions: [],
    workplaces: facts.workplaces.map((workplace) => ({ ...workplace, assemblyPoint: null })),
    fireSafety: { card: null, equipment: [], installations: [] },
  };

  it('is built without the fire object while any of its data is missing, and with the rest', () => {
    expect(missingFireSafetyData(stageTwoGaps)).toEqual([
      'fire.trainingSchedule',
      'fire.waste',
      'responsible.workplace_manager',
      'responsible.fire_safety_coordinator',
      'responsible.fire_intervention_leader',
      'positions.any',
      'fire.workplaces',
      'fire.equipment',
    ]);
    const context = buildPartialFireSafetyContext(stageTwoGaps);
    expect(Object.keys(context).sort()).toEqual([
      'branding',
      'client',
      'fireSafetyTechnician',
      'issueDate',
      'provider',
    ]);
    expect(buildFireSafetyContext(facts)).toMatchObject(context);
  });

  it('leaves out the name of the provider, the technician or the client that a gap is in', () => {
    const context = buildPartialFireSafetyContext({
      ...facts,
      organization: { ...facts.organization, legalName: null, fireSafetyTechnicianName: ' ' },
      client: { ...facts.client, representativeRole: null },
    });
    expect(Object.keys(context).sort()).toEqual(['branding', 'fire', 'issueDate']);
  });

  it('is equal to the whole context when nothing is missing', () => {
    expect(buildPartialFireSafetyContext(facts)).toEqual(buildFireSafetyContext(facts));
  });
});

describe('a gap in the fire-safety data', () => {
  it('concerns a document that printed the name it is in', () => {
    expect(fireSafetyGapConcerns('provider.fireSafetyTechnician', ['fireSafetyTechnician'])).toBe(
      true
    );
    expect(fireSafetyGapConcerns('provider.fireSafetyTechnician', ['client', 'branding'])).toBe(
      false
    );
    expect(fireSafetyGapConcerns('client.representativeRole', ['client'])).toBe(true);
    expect(fireSafetyGapConcerns('provider.legalName', ['branding'])).toBe(false);
  });

  it('in the client data of the second stage concerns only what prints `fire`', () => {
    for (const code of [
      'fire.trainingSchedule',
      'fire.waste',
      'fire.workplaces',
      'fire.equipment',
      'responsible.workplace_manager',
      'responsible.fire_safety_coordinator',
      'responsible.fire_intervention_leader',
      'positions.any',
    ]) {
      expect(fireSafetyGapConcerns(code, ['client', 'fire'])).toBe(true);
      expect(fireSafetyGapConcerns(code, ['client', 'provider', 'branding'])).toBe(false);
    }
  });
});

describe('setOfGroup', () => {
  it('names the set of a group, and none for other documents', () => {
    expect(setOfGroup('documentation_set')).toBe('occupational_safety');
    expect(setOfGroup('fire_safety_set')).toBe('fire_safety');
    expect(setOfGroup('other')).toBeNull();
  });
});
