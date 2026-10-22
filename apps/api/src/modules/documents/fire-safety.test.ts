import { describe, expect, it } from 'vitest';

import { buildDocumentContext, type DocumentFacts, missingDocumentData } from './context';
import { facts, officeId, workshopId } from './context.fixture';
import {
  buildFireSafetyContext,
  buildPartialFireSafetyContext,
  fireSafetyGapConcerns,
  missingFireSafetyData,
} from './fire-safety';
import { setOfGroup, setRules } from './sets';
import { dealChapters, fireOwnInstructionsChapters } from './themes';

const card = facts.fireSafety.card!;
const withSubstances = (
  substances: Partial<(typeof facts)['fireSafety']['substances']>
): DocumentFacts => ({
  ...facts,
  fireSafety: {
    ...facts.fireSafety,
    substances: { ...facts.fireSafety.substances, ...substances },
  },
});
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
        fireSafetyTechnicianCertificate: ' ',
        fireSafetyAuthorization: null,
        phone: null,
      },
      specialist: null,
      client: { ...facts.client, representativeName: null, representativeRole: '', caenCode: null },
      responsiblePersons: [],
      jobPositions: [],
      riskEvaluations: [],
      workplaces: [],
      fireSafety: {
        card: null,
        equipment: [],
        installations: [],
        maintenanceItems: [],
        buildings: [],
        generatedFromTenEmployees: [],
        documents: [],
        substances: { state: 'undecided', entries: [] },
      },
    };
    expect(missingFireSafetyData(lacking)).toEqual([
      'provider.legalName',
      'provider.fireSafetyTechnician',
      'provider.fireSafetyTechnicianCertificate',
      'client.representativeName',
      'client.representativeRole',
      'fire.trainingSchedule',
      'fire.smokingPolicy',
      'fire.waste',
      'responsible.workplace_manager',
      'responsible.fire_safety_coordinator',
      'responsible.fire_intervention_leader',
      'positions.any',
      'fire.workplaces',
      'fire.substances',
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
    expect(missingFireSafetyData(withCard({ wasteCollectors: null }))).toEqual([]);
    expect(missingFireSafetyData(withCard(null))).toEqual([
      'fire.trainingSchedule',
      'fire.smokingPolicy',
      'fire.waste',
    ]);
  });

  it('asks for the smoking rule, not where smoking is allowed', () => {
    expect(missingFireSafetyData(withCard({ smokingPolicy: null, smokingPlace: null }))).toEqual([
      'fire.smokingPolicy',
    ]);
    expect(missingFireSafetyData(withCard({ smokingPlace: null }))).toEqual([]);
    expect(
      missingFireSafetyData(withCard({ smokingPolicy: 'forbidden_everywhere', smokingPlace: null }))
    ).toEqual([]);
  });

  it("asks for the technician's certificate, not the provider's authorization", () => {
    const organization = (changes: Partial<DocumentFacts['organization']>) =>
      missingFireSafetyData({ ...facts, organization: { ...facts.organization, ...changes } });
    expect(organization({ fireSafetyTechnicianCertificate: '  ' })).toEqual([
      'provider.fireSafetyTechnicianCertificate',
    ]);
    expect(organization({ fireSafetyAuthorization: null })).toEqual([]);
    expect(
      organization({ fireSafetyTechnicianName: null, fireSafetyTechnicianCertificate: null })
    ).toEqual(['provider.fireSafetyTechnician', 'provider.fireSafetyTechnicianCertificate']);
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

  it('asks a mobile site for neither an area nor a norm, and a fixed space for a norm that may be none', () => {
    const lacking = (changes: Partial<DocumentFacts['workplaces'][number]>) =>
      missingFireSafetyData({
        ...facts,
        workplaces: [facts.workplaces[0]!, { ...facts.workplaces[1]!, ...changes }],
      });
    expect(lacking({ kind: 'mobile_site', floorAreaM2: null, extinguisherNorm: null })).toEqual([]);
    expect(lacking({ kind: 'mobile_site', extinguisherNorm: 'none' })).toEqual([]);
    expect(lacking({ kind: 'mobile_site', assemblyPoint: null })).toEqual(['fire.workplaces']);
    expect(lacking({ extinguisherNorm: 'none' })).toEqual([]);
    expect(lacking({ extinguisherNorm: 'none', floorAreaM2: null })).toEqual(['fire.workplaces']);
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

  it('asks whether the client uses dangerous substances, and one entry when it lists them', () => {
    expect(missingFireSafetyData(withSubstances({ state: 'undecided' }))).toEqual([
      'fire.substances',
    ]);
    expect(missingFireSafetyData(withSubstances({ state: 'listed', entries: [] }))).toEqual([
      'fire.substances',
    ]);
    expect(missingFireSafetyData(withSubstances({ state: 'none', entries: [] }))).toEqual([]);
  });

  it('never holds back the occupational safety set, nor is held back by it', () => {
    const withoutTechnician = {
      ...facts,
      organization: {
        ...facts.organization,
        fireSafetyTechnicianName: '  ',
        fireSafetyTechnicianCertificate: null,
      },
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
      fireSafetyTechnician: {
        name: 'Radu STAN',
        certificate: 'CT 1234/2024',
        authorization: 'nr. 12 din 15.09.2026, ISU Timiș',
      },
    });
  });

  it("prints the provider's authorization only where it is set", () => {
    const technician = (fireSafetyAuthorization: string | null) =>
      buildFireSafetyContext({
        ...facts,
        organization: { ...facts.organization, fireSafetyAuthorization },
      }).fireSafetyTechnician.authorization;
    expect(technician(' nr. 12 din 15.09.2026, ISU Cluj ')).toBe('nr. 12 din 15.09.2026, ISU Cluj');
    expect(technician('  ')).toBeNull();
    expect(technician(null)).toBeNull();
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
        fireSafetyTechnicianCertificate: ' Certificat nr. 7 ',
        fireSafetyAuthorization: null,
      },
    });
    expect(context.provider).toEqual({
      legalName: 'S.C. SERVICIU EXTERN DEMO S.R.L.',
      representativeName: '',
      representativeRole: '',
    });
    expect(context.fireSafetyTechnician).toEqual({
      name: 'Radu STAN',
      certificate: 'Certificat nr. 7',
      authorization: null,
    });
    expect(context.branding).toBe(false);
  });

  it('numbers each decision by its place in the binder, from the first number', () => {
    expect(buildFireSafetyContext(facts).fire.decisionNumbers).toEqual({
      organization: '5 PSI',
      training: '6 PSI',
      openFire: '7 PSI',
      smoking: '8 PSI',
      technician: '9 PSI',
      instructions: '10 PSI',
      waste: '11 PSI',
      seasons: '12 PSI',
      control: '13 PSI',
    });
    expect(
      buildFireSafetyContext({ ...facts, firstDecisionNumber: 1 }).fire.decisionNumbers
    ).toEqual({
      organization: '1 PSI',
      training: '2 PSI',
      openFire: '3 PSI',
      smoking: '4 PSI',
      technician: '5 PSI',
      instructions: '6 PSI',
      waste: '7 PSI',
      seasons: '8 PSI',
      control: '9 PSI',
    });
  });

  it('holds the documents required from ten employees only from ten, or once they exist', () => {
    const held = (currentEmployeeCount: number, generatedFromTenEmployees: string[] = []) => {
      const context = buildFireSafetyContext({
        ...facts,
        currentEmployeeCount,
        fireSafety: {
          ...facts.fireSafety,
          generatedFromTenEmployees: generatedFromTenEmployees as never[],
        },
      });
      return {
        seasons: context.seasonsDecision,
        control: context.controlDecision,
        register: context.installationRegister,
      };
    };
    expect(held(9)).toEqual({ seasons: false, control: false, register: false });
    expect(held(10)).toEqual({ seasons: true, control: true, register: true });
    expect(held(4, ['fire_decision_control'])).toEqual({
      seasons: false,
      control: true,
      register: false,
    });
  });

  it('words the training schedule as the decisions print it', () => {
    expect(buildFireSafetyContext(facts).fire.schedule).toEqual({
      periodicHours: 2,
      periodicLabel: '2 ore',
      administrativeIntervalMonths: 6,
      administrativeIntervalLabel: '6 luni',
      administrativeMonths: 'lunile februarie și august',
      workerIntervalMonths: 3,
      workerIntervalLabel: '3 luni',
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
    expect(monthly.workerIntervalLabel).toBe('1 lună');
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

  it("words the representative's role and the job titles as they read inside a sentence", () => {
    const fire = buildFireSafetyContext(facts).fire;
    expect(fire.representativeRoleRunOn).toBe('administrator');
    expect(fire.coordinator.jobTitleRunOn).toBe('administrator');
    expect(fire.designated).toEqual([
      { name: 'Florin Cristian TALOȘ', jobTitle: 'Administrator' },
      { name: 'Ioana PETRE', jobTitle: 'Șef de echipă' },
    ]);
  });

  it('names the coordinator, the leader and the workplace managers, each once', () => {
    const fire = buildFireSafetyContext(facts).fire;
    expect(fire.coordinator).toEqual({
      name: 'Florin Cristian TALOȘ',
      jobTitle: 'Administrator',
      jobTitleRunOn: 'administrator',
    });
    expect(fire.interventionLeader).toEqual({
      name: 'Ioana PETRE',
      jobTitle: 'Șef de echipă',
      jobTitleRunOn: 'șef de echipă',
    });
    expect(fire.workplaceManagers).toEqual([
      {
        name: 'Florin Cristian TALOȘ',
        jobTitle: 'Administrator',
        jobTitleRunOn: 'administrator',
        workplaceName: null,
      },
      {
        name: 'Ioana PETRE',
        jobTitle: 'Șef de echipă',
        jobTitleRunOn: 'șef de echipă',
        workplaceName: 'Atelier Ghiroda',
      },
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
      activityRunOn: 'atelier de sudură',
      address: 'Ghiroda, județul Timiș, Str. Industriilor 4',
      areaLabel: '420\u00a0m²',
      normLabel: 'Alte amenajări (1 buc./150 m²)',
      assemblyPoint: 'Parcarea din fața atelierului',
      specificMeasures: 'Sudura numai cu permis de lucru cu foc.',
      specificMeasuresRunOn: 'sudura numai cu permis de lucru cu foc.',
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
      interventionLeaderName: 'Florin Cristian TALOȘ',
    });
    expect(office!.installations[0]).toEqual({
      kindLabel: 'Instalație de detectare, semnalizare și avertizare la incendiu',
      description: '',
    });
    expect(fire.hasExteriorHydrants).toBe(true);
    expect(fire.waste).toEqual({
      kinds: ['deșeuri de carton, hârtie, plastic', 'deșeuri menajere'],
      contractor: 'S.C. ECO COLECT S.R.L.',
      collectors: 'muncitorii necalificați și șeful de șantier',
    });
  });

  it('prints a dash for the area and the norm of a mobile site, whatever it kept, and counts its means', () => {
    const fire = buildFireSafetyContext({
      ...facts,
      workplaces: [
        {
          ...facts.workplaces[0]!,
          kind: 'mobile_site',
          activity: 'Lucrări de construcții',
          floorAreaM2: 420,
          extinguisherNorm: 'other_150',
        },
        { ...facts.workplaces[1]!, extinguisherNorm: 'none' },
      ],
    }).fire;
    const [site, office] = fire.workplaces;
    expect(site).toMatchObject({
      activity: 'Lucrări de construcții',
      activityRunOn: 'lucrări de construcții',
      areaLabel: '—',
      normLabel: '—',
    });
    expect(site!.extinguisherCount).toBeGreaterThan(0);
    expect(office).toMatchObject({ areaLabel: '180\u00a0m²', normLabel: 'fără normă din anexa 6' });
  });

  it("has the intervention leader act where he is tied or tied to none, and the workplace's manager where he is tied elsewhere", () => {
    const [manager, leader] = facts.responsiblePersons;
    const sheetsWith = (persons: DocumentFacts['responsiblePersons']) =>
      buildFireSafetyContext({ ...facts, responsiblePersons: persons }).fire.workplaces.map(
        (workplace) => workplace.interventionLeaderName
      );
    expect(sheetsWith([manager!, leader!])).toEqual(['Ioana PETRE', 'Florin Cristian TALOȘ']);
    expect(sheetsWith([manager!, { ...leader!, workplaceId: null }])).toEqual([
      'Ioana PETRE',
      'Ioana PETRE',
    ]);
    expect(
      sheetsWith([
        { ...manager!, roles: manager!.roles.filter((role) => role !== 'workplace_manager') },
        leader!,
        { ...leader!, fullName: 'Dan ROTARU', roles: ['workplace_manager'] },
      ])
    ).toEqual(['Ioana PETRE', 'Ioana PETRE']);
  });

  it('sorts the installations of a workplace into those of alarm and those of extinguishing, the safety lighting apart', () => {
    const [workshop, office] = buildFireSafetyContext({
      ...facts,
      fireSafety: {
        ...facts.fireSafety,
        installations: [
          ...facts.fireSafety.installations,
          ...(['emergency_lighting', 'gas_detection', 'sprinklers'] as const).map((kind) => ({
            workplaceId: officeId,
            kind,
            description: null,
            maintainer: null,
            lastCheckOn: null,
            nextCheckOn: null,
          })),
        ],
      },
    }).fire.workplaces;
    expect(workshop).toMatchObject({
      alarmInstallations: [],
      extinguishingInstallations: [
        { kindLabel: 'Hidranți exteriori', description: 'Doi hidranți în curte' },
      ],
      hasEmergencyLighting: false,
    });
    expect(office!.alarmInstallations.map((each) => each.kindLabel)).toEqual([
      'Instalație de detectare, semnalizare și avertizare la incendiu',
      'Instalație de detectare a gazelor',
    ]);
    expect(office!.extinguishingInstallations.map((each) => each.kindLabel)).toEqual([
      'Hidranți interiori',
      'Instalație de stingere cu sprinklere',
    ]);
    expect(office!.hasEmergencyLighting).toBe(true);
    expect(office!.installations).toHaveLength(5);
  });

  it('prints an installation whose description names its kind by the description alone', () => {
    const [, office] = buildFireSafetyContext({
      ...facts,
      fireSafety: {
        ...facts.fireSafety,
        installations: [
          ...facts.fireSafety.installations,
          {
            workplaceId: officeId,
            kind: 'interior_hydrants',
            description: '2 hidranti interiori Dn 50',
            maintainer: null,
            lastCheckOn: null,
            nextCheckOn: null,
          },
          {
            workplaceId: officeId,
            kind: 'other',
            description: 'ușă rezistentă la foc',
            maintainer: null,
            lastCheckOn: null,
            nextCheckOn: null,
          },
        ],
      },
    }).fire.workplaces;
    expect(office!.installations.slice(-2)).toEqual([
      { kindLabel: '2 hidranti interiori Dn 50', description: '' },
      { kindLabel: 'Ușă rezistentă la foc', description: '' },
    ]);
  });

  it('prints each listed substance with its texts trimmed and the empty ones as the mark to fill in', () => {
    const { substances } = buildFireSafetyContext(facts).fire;
    expect(substances).toMatchObject({ state: 'listed', listed: true, none: false });
    expect(substances.entries).toHaveLength(2);
    expect(substances.entries[0]).toEqual({
      name: 'Propan',
      classification: 'Flam. Gas 1, H220; Press. Gas, H280',
      quantity: '2 butelii de 11 kg',
      physicalChemicalProperties: 'DE COMPLETAT',
      identificationCodes: 'CAS 74-98-6, UN 1978',
      healthEnvironmentRisks: 'DE COMPLETAT',
      protectionMeans: 'DE COMPLETAT',
      interventionMeasures: 'DE COMPLETAT',
      extinguishingAgents: 'Pulbere, CO₂; răcirea buteliilor cu apă pulverizată',
      storagePlace: 'Cușca metalică ventilată din curte',
      handling: 'DE COMPLETAT',
    });
    expect(substances.entries[1]!.name).toBe('Diluant pentru vopsele');
  });

  it('prints the declaration alone for a client that uses no dangerous substances', () => {
    expect(buildFireSafetyContext(withSubstances({ state: 'none' })).fire.substances).toEqual({
      state: 'none',
      none: true,
      listed: false,
      entries: [],
    });
  });

  it('says whether other firms work on the premises, for decision 9 to control them', () => {
    expect(buildFireSafetyContext(facts).fire.hasThirdParties).toBe(true);
    expect(buildFireSafetyContext(withCard({ hasThirdParties: false })).fire.hasThirdParties).toBe(
      false
    );
  });

  it('leaves who collects the waste null when it is blank, for decision 7 to name the workers on duty', () => {
    expect(buildFireSafetyContext(withCard({ wasteCollectors: '  ' })).fire.waste.collectors).toBe(
      null
    );
    expect(buildFireSafetyContext(withCard({ wasteCollectors: null })).fire.waste.collectors).toBe(
      null
    );
  });

  it('words the smoking rule with a flag for each policy, and the place only where smoking is allowed', () => {
    expect(buildFireSafetyContext(facts).fire.smoking).toEqual({
      policy: 'designated_places',
      forbiddenEverywhere: false,
      designatedPlaces: true,
      place: 'în curtea interioară, lângă poarta de acces auto',
    });
    expect(buildFireSafetyContext(withCard({ smokingPlace: '  ' })).fire.smoking.place).toBeNull();
    expect(
      buildFireSafetyContext(
        withCard({ smokingPolicy: 'forbidden_everywhere', smokingPlace: 'în curte' })
      ).fire.smoking
    ).toEqual({
      policy: 'forbidden_everywhere',
      forbiddenEverywhere: true,
      designatedPlaces: false,
      place: null,
    });
  });

  it('says whether an active workplace has an extinguisher that is weighed', () => {
    const withEquipment = (equipment: DocumentFacts['fireSafety']['equipment']) =>
      buildFireSafetyContext({ ...facts, fireSafety: { ...facts.fireSafety, equipment } }).fire
        .hasGasExtinguishers;
    const unit = {
      workplaceId: officeId,
      capacity: 6,
      wheeled: false,
      nextServiceOn: null,
      maintainer: null,
    };
    expect(buildFireSafetyContext(facts).fire.hasGasExtinguishers).toBe(true);
    expect(
      withEquipment([
        { ...unit, kind: 'extinguisher', agent: 'powder' },
        { ...unit, workplaceId: workshopId, kind: 'extinguisher', agent: 'foam' },
      ])
    ).toBe(false);
    expect(
      withEquipment([
        { ...unit, kind: 'extinguisher', agent: 'powder' },
        { ...unit, workplaceId: workshopId, kind: 'extinguisher', agent: 'clean_agent' },
      ])
    ).toBe(true);
    expect(
      withEquipment([
        { ...unit, kind: 'extinguisher', agent: 'powder' },
        { ...unit, workplaceId: workshopId, kind: 'extinguisher', agent: 'water' },
        { ...unit, workplaceId: 'archived-workplace', kind: 'extinguisher', agent: 'co2' },
      ])
    ).toBe(false);
  });

  it('schedules the checks of each workplace: its extinguishers, its installations, then its free rows', () => {
    const [workshop, office] = buildFireSafetyContext(facts).fire.schedules;
    const coordinator =
      'Florin Cristian TALOȘ, coordonatorul privind apărarea împotriva incendiilor, cu cadrul tehnic, după caz';
    expect(workshop).toEqual({
      name: 'Atelier Ghiroda',
      activity: 'Atelier de sudură',
      activityRunOn: 'atelier de sudură',
      hasRows: true,
      empty: false,
      rows: [
        {
          what: 'Controlul fiecărui stingător de incendiu (P6 – 2\u00a0buc., P50 carosabil – 1\u00a0buc., G5 – 1\u00a0buc.)',
          interval: 'lunar',
          who: coordinator,
          basis:
            'OMAI 135/2023 – art. 8; rezultatele se înscriu în registrul de evidență a controlului stingătoarelor',
        },
        {
          what: 'Verificarea prin cântărire a stingătoarelor cu CO₂ sau agent curat (G5 – 1\u00a0buc.)',
          interval: 'la cel mult 6 luni, în iunie și decembrie',
          who: coordinator,
          basis: 'OMAI 135/2023 – art. 8 alin. (3)',
        },
        {
          what: 'Verificarea stingătoarelor de către o firmă atestată (P6 – 2\u00a0buc.)',
          interval: 'anual',
          who: 'S.C. FOC STOP S.R.L.',
          basis: 'OMAI 135/2023 – art. 9; următorul service: 15.01.2027 și 12.03.2027',
        },
        {
          what: 'Verificarea stingătoarelor de către o firmă atestată (P50 carosabil – 1\u00a0buc.)',
          interval: 'anual',
          who: 'S.C. Foc Stop S.R.L.',
          basis: 'OMAI 135/2023 – art. 9; conform instrucțiunilor producătorului',
        },
        {
          what: 'Verificarea stingătoarelor de către o firmă atestată (G5 – 1\u00a0buc.)',
          interval: 'anual',
          who: 'firmă atestată',
          basis: 'OMAI 135/2023 – art. 9; conform instrucțiunilor producătorului',
        },
        {
          what: 'Reîncărcarea stingătoarelor (P6 – 2\u00a0buc., P50 carosabil – 1\u00a0buc., G5 – 1\u00a0buc.)',
          interval:
            'după fiecare utilizare și la cel mult 3 ani sau la termenul producătorului, dacă este mai scurt',
          who: 'S.C. FOC STOP S.R.L.',
          basis: 'OMAI 135/2023 – art. 12',
        },
        {
          what: 'Hidranți exteriori – Doi hidranți în curte',
          interval: 'conform instrucțiunilor producătorului',
          who: 'firmă atestată',
          basis: '—',
        },
      ],
    });
    expect(office!.rows.slice(-3)).toEqual([
      {
        what: 'Instalație de detectare, semnalizare și avertizare la incendiu',
        interval: 'la 6 luni',
        who: 'S.C. ALARM SERVICE S.R.L.',
        basis: 'următoarea verificare: 12.09.2026',
      },
      {
        what: 'Hidranți interiori – Câte unul pe nivel',
        interval: 'conform instrucțiunilor producătorului',
        who: 'firmă atestată',
        basis: 'următoarea verificare: 12.03.2027',
      },
      {
        what: 'Instalația de utilizare a gazelor naturale',
        interval: 'anual',
        who: 'Operatorul de distribuție',
        basis: '—',
      },
    ]);
    expect(office!.rows.map((row) => row.what)).not.toContainEqual(
      expect.stringContaining('cântărire')
    );
  });

  it('derives an installation interval from its last and next check, and invents none', () => {
    const intervalOf = (lastCheckOn: string | null, nextCheckOn: string | null) =>
      buildFireSafetyContext({
        ...facts,
        fireSafety: {
          ...facts.fireSafety,
          installations: [
            {
              workplaceId: officeId,
              kind: 'other',
              description: 'Instalație de stingere cu gaz inert',
              maintainer: null,
              lastCheckOn,
              nextCheckOn,
            },
          ],
        },
      }).fire.schedules[1]!.rows.find((row) => row.what === 'Instalație de stingere cu gaz inert')!
        .interval;
    expect(intervalOf('2026-03-12', '2027-03-10')).toBe('anual');
    expect(intervalOf('2026-01-01', '2026-02-01')).toBe('lunar');
    expect(intervalOf('2026-01-01', '2026-04-01')).toBe('la 3 luni');
    expect(intervalOf('2026-01-01', '2028-01-01')).toBe('la 2 ani');
    expect(intervalOf('2026-01-01', '2026-01-05')).toBe('conform instrucțiunilor producătorului');
    expect(intervalOf(null, '2027-01-01')).toBe('conform instrucțiunilor producătorului');
  });

  it('gives the training themes a block per staff category with posts, and a session per month of its schedule', () => {
    const ipsu = (sessions: number) =>
      dealChapters(fireOwnInstructionsChapters, sessions).map(
        ({ from, to }) => `IPSU art.\u00a0${from}–${to}`
      );
    const posted =
      'instrucțiunile afișate la locul de muncă (Decizia nr.\u00a010 PSI); organizarea apărării împotriva incendiilor la locul de muncă';
    const managers = 'Florin Cristian TALOȘ și Ioana PETRE – conducătorii locurilor de muncă';
    const administrative = ipsu(2);
    const execution = ipsu(4);
    const hotWork = 'I.P.S.U. Lucrul cu foc deschis, art.\u00a01–7';
    expect(buildFireSafetyContext(facts).fireThemes!.categories).toEqual([
      {
        staffCategory: 'technical_administrative',
        label: 'Personal administrativ',
        posts: ['Contabil'],
        postsText: 'Contabil',
        workplaceTrainers: { workplaceManagers: null, technician: true },
        periodicTrainers: { workplaceManagers: null, technician: true },
        intervalLabel: '6 LUNI',
        sessions: [
          { month: 'FEBRUARIE', content: `${administrative[0]}; ${posted}`, duration: '120 min' },
          {
            month: 'AUGUST',
            content: `${administrative[1]}; ${posted}; testare.`,
            duration: '120 min',
          },
        ],
      },
      {
        staffCategory: 'execution',
        label: 'Personal de execuție',
        posts: ['Sudor'],
        postsText: 'Sudor',
        workplaceTrainers: { workplaceManagers: managers, technician: false },
        periodicTrainers: { workplaceManagers: managers, technician: true },
        intervalLabel: '3 LUNI',
        sessions: ['FEBRUARIE', 'MAI', 'AUGUST', 'NOIEMBRIE'].map((month, index) => ({
          month,
          content: `${execution[index]}; ${hotWork}; ${posted}${index === 3 ? '; testare.' : ''}`,
          duration: '120 min',
        })),
      },
    ]);
  });

  it('has nobody train themself: the representative steps in for the heads, then the technician alone', () => {
    const owner = 'e1e1e1e1-0000-4000-8000-000000000009';
    const onePerson = {
      ...facts,
      jobPositions: facts.jobPositions.map((position) =>
        position.staffCategory === 'execution'
          ? { ...position, currentEmployees: [{ employeeId: owner, fullName: 'Ioana PETRE' }] }
          : position
      ),
      responsiblePersons: facts.responsiblePersons.flatMap((person) =>
        person.fullName === 'Florin Cristian TALOȘ'
          ? []
          : [
              {
                ...person,
                employeeId: owner,
                roles: [...person.roles, 'fire_safety_coordinator' as const],
              },
            ]
      ),
    };
    const execution = (built: ReturnType<typeof buildFireSafetyContext>) =>
      built.fireThemes!.categories.find((block) => block.staffCategory === 'execution')!;
    expect(execution(buildFireSafetyContext(onePerson))).toMatchObject({
      workplaceTrainers: {
        workplaceManagers: 'Florin Cristian TALOȘ – Administrator',
        technician: false,
      },
      periodicTrainers: {
        workplaceManagers: 'Florin Cristian TALOȘ – Administrator',
        technician: true,
      },
    });
    expect(
      execution(
        buildFireSafetyContext({
          ...onePerson,
          client: {
            ...facts.client,
            representativeName: 'Ioana Petre',
            representativeEmployeeId: owner,
          },
        })
      )
    ).toMatchObject({
      workplaceTrainers: { workplaceManagers: null, technician: true },
      periodicTrainers: { workplaceManagers: null, technician: true },
    });
  });

  it('leaves a staff category without posts out of the themes, and names a manager once', () => {
    const themes = buildFireSafetyContext({
      ...withCard({ periodicTrainingHours: 3, workerTrainingIntervalMonths: 1 }),
      jobPositions: facts.jobPositions.map((position) => ({
        ...position,
        staffCategory: 'execution' as const,
      })),
      responsiblePersons: [
        ...facts.responsiblePersons,
        {
          employeeId: null,
          fullName: 'florin cristian talos',
          jobTitle: 'Administrator',
          roles: ['workplace_manager'],
          currentEmployee: true,
          workplaceId: null,
        },
      ],
    }).fireThemes!.categories;
    expect(themes.map((block) => block.staffCategory)).toEqual(['execution']);
    expect(themes[0]).toMatchObject({
      posts: ['Contabil', 'Sudor'],
      postsText: 'Contabil, Sudor',
      workplaceTrainers: {
        workplaceManagers: 'Florin Cristian TALOȘ și Ioana PETRE – conducătorii locurilor de muncă',
        technician: false,
      },
      intervalLabel: '1 LUNĂ',
    });
    expect(themes[0]!.sessions).toHaveLength(12);
    expect(themes[0]!.sessions.every((session) => session.duration === '180 min')).toBe(true);
    expect(themes[0]!.sessions.filter((session) => session.content.endsWith('testare.'))).toEqual([
      themes[0]!.sessions[11],
    ]);
  });

  it('cites the fire-safety modules a category applies as the newest IPSU annexes them, each once', () => {
    const [accountant, welder] = facts.jobPositions;
    const storage = {
      moduleId: 'a0a0a0a0-0000-4000-8000-000000000004',
      domain: 'psi' as const,
      title: 'Depozitare',
      group: 'work_activity' as const,
      version: {
        id: 'b0b0b0b0-0000-4000-8000-000000000004',
        number: 1,
        createdAt: '2026-10-12T08:00:00+00:00',
      },
    };
    const context = buildFireSafetyContext({
      ...facts,
      jobPositions: [
        {
          ...accountant!,
          staffCategory: 'execution',
          instructions: [...welder!.instructions, storage],
        },
        welder!,
      ],
      fireOwnInstructions: {
        ...facts.fireOwnInstructions!,
        annexes: [
          ...facts.fireOwnInstructions!.annexes,
          {
            moduleId: 'a0a0a0a0-0000-4000-8000-000000000005',
            versionId: 'b0b0b0b0-0000-4000-8000-000000000005',
            title: 'Butelii de gaz',
            articleCount: 4,
          },
        ],
      },
    }).fireThemes!;
    expect(context.ownInstructionsRevision).toEqual({
      id: 'd0d0d0d0-0000-4000-8000-000000000002',
      number: 1,
      versionIds: ['b0b0b0b0-0000-4000-8000-000000000003', 'b0b0b0b0-0000-4000-8000-000000000005'],
    });
    const [execution] = context.categories;
    expect(execution!.posts).toEqual(['Contabil', 'Sudor']);
    expect(execution!.sessions[0]!.content.split('; ').slice(1, 3)).toEqual([
      'I.P.S.U. Lucrul cu foc deschis, art.\u00a01–7',
      'instrucțiunile afișate la locul de muncă (Decizia nr.\u00a010 PSI)',
    ]);
  });

  it('names the posts that apply a module when others in their category do not', () => {
    const [accountant, welder] = facts.jobPositions;
    const [execution] = buildFireSafetyContext({
      ...facts,
      jobPositions: [{ ...accountant!, staffCategory: 'execution' }, welder!],
    }).fireThemes!.categories;
    expect(execution!.sessions[0]!.content.split('; ')[1]).toBe(
      'I.P.S.U. Lucrul cu foc deschis, art.\u00a01–7 (Sudor)'
    );
  });

  it('names the workplaces of the themes, the registered office first', () => {
    expect(buildFireSafetyContext(facts).fireThemes!.workplaceNames).toBe(
      'Sediul social, Atelier Ghiroda'
    );
  });

  it('cites a module without numbered articles by its title alone', () => {
    const sessions = buildFireSafetyContext({
      ...facts,
      fireOwnInstructions: {
        ...facts.fireOwnInstructions!,
        annexes: [
          {
            ...facts.fireOwnInstructions!.annexes[0]!,
            title: ' Lucrul cu foc deschis ',
            articleCount: 0,
          },
        ],
      },
    }).fireThemes!.categories[1]!.sessions;
    expect(sessions[0]!.content).toContain('; I.P.S.U. Lucrul cu foc deschis; ');
  });

  it('leaves the themes out without a generated IPSU, which only generating them again asks for', () => {
    const withoutIpsu = { ...facts, fireOwnInstructions: null };
    expect(buildFireSafetyContext(withoutIpsu)).not.toHaveProperty('fireThemes');
    expect(missingFireSafetyData(withoutIpsu)).toEqual([]);
    expect(missingFireSafetyData(withoutIpsu, 'fire_decision_training')).toEqual([]);
    expect(missingFireSafetyData(withoutIpsu, 'fire_training_themes')).toEqual([
      'documents.fire_own_instructions',
    ]);
    expect(setRules.fire_safety.missing(withoutIpsu, 'fire_training_themes')).toEqual([
      'documents.fire_own_instructions',
    ]);
    expect(fireSafetyGapConcerns('documents.fire_own_instructions', ['fire', 'fireThemes'])).toBe(
      true
    );
    expect(fireSafetyGapConcerns('documents.fire_own_instructions', ['fire', 'annexes'])).toBe(
      false
    );
  });

  it('keeps the themes apart from `fire`, so a new IPSU dates no other document', () => {
    const context = buildFireSafetyContext(facts);
    const regenerated = buildFireSafetyContext({
      ...facts,
      fireOwnInstructions: { ...facts.fireOwnInstructions!, revisionNumber: 2 },
    });
    expect(regenerated.fire).toEqual(context.fire);
    expect(regenerated.fireThemes).not.toEqual(context.fireThemes);
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
    const context: Partial<ReturnType<typeof buildFireSafetyContext>> = {
      ...buildFireSafetyContext(facts),
    };
    delete context.knowledgeTests;
    expect(setRules.fire_safety.data(facts, 'fire_registers', 4)).toEqual(context);
  });

  it("gives each test its own questions, as the bank orders them, and no other document's", () => {
    const hiring = setRules.fire_safety.data(facts, 'fire_test_hiring', null);
    const annual = setRules.fire_safety.data(facts, 'fire_test_annual', null);
    expect(hiring.test).toEqual({
      code: 'TASU',
      title: 'Test de verificare a cunoștințelor la angajare (TASU)',
    });
    expect(hiring.questions).toHaveLength(12);
    expect(annual.test).toMatchObject({ code: 'TPSU' });
    expect(annual.questions).toHaveLength(10);
    expect(setRules.fire_safety.data(facts, 'fire_registers', null)).not.toHaveProperty(
      'questions'
    );
  });
});

describe('a fire-safety document generated again', () => {
  const stageTwoGaps: DocumentFacts = {
    ...facts,
    responsiblePersons: [],
    jobPositions: [],
    workplaces: facts.workplaces.map((workplace) => ({ ...workplace, assemblyPoint: null })),
    fireSafety: {
      card: null,
      equipment: [],
      installations: [],
      maintenanceItems: [],
      buildings: [],
      generatedFromTenEmployees: [],
      documents: [],
      substances: { state: 'undecided', entries: [] },
    },
  };

  it('is built without the fire object while any of its data is missing, and with the rest', () => {
    expect(missingFireSafetyData(stageTwoGaps)).toEqual([
      'fire.trainingSchedule',
      'fire.smokingPolicy',
      'fire.waste',
      'responsible.workplace_manager',
      'responsible.fire_safety_coordinator',
      'responsible.fire_intervention_leader',
      'positions.any',
      'fire.workplaces',
      'fire.equipment',
      'fire.substances',
    ]);
    const context = buildPartialFireSafetyContext(stageTwoGaps);
    expect(Object.keys(context).sort()).toEqual([
      'annexes',
      'branding',
      'client',
      'controlDecision',
      'fireSafetyTechnician',
      'installationRegister',
      'issueDate',
      'knowledgeTests',
      'noAnnexes',
      'provider',
      'seasonsDecision',
    ]);
    expect(context).toMatchObject({ annexes: [], noAnnexes: true });
    expect(buildFireSafetyContext(facts)).toMatchObject({
      ...context,
      annexes: expect.any(Array),
      noAnnexes: false,
    });
  });

  it('leaves out the name of the provider, the technician or the client that a gap is in', () => {
    const context = buildPartialFireSafetyContext({
      ...facts,
      organization: { ...facts.organization, fireSafetyTechnicianCertificate: ' ' },
      client: { ...facts.client, representativeRole: null },
    });
    expect(Object.keys(context).sort()).toEqual([
      'annexes',
      'branding',
      'controlDecision',
      'fire',
      'fireThemes',
      'installationRegister',
      'issueDate',
      'knowledgeTests',
      'noAnnexes',
      'provider',
      'seasonsDecision',
    ]);
  });

  it('keeps the fire object without the provider or its technician, which the template names as trainers', () => {
    const context = buildPartialFireSafetyContext({
      ...facts,
      organization: { ...facts.organization, legalName: null, fireSafetyTechnicianName: ' ' },
    });
    expect(Object.keys(context).sort()).toEqual([
      'annexes',
      'branding',
      'client',
      'controlDecision',
      'fire',
      'fireThemes',
      'installationRegister',
      'issueDate',
      'knowledgeTests',
      'noAnnexes',
      'seasonsDecision',
    ]);
  });

  it('leaves out the annexes while a position has not decided about the fire-safety modules', () => {
    const undecided = {
      ...facts,
      jobPositions: facts.jobPositions.map((position) => ({
        ...position,
        needsFireInstructions: position.instructions.some((module) => module.domain === 'psi')
          ? true
          : null,
      })),
    };
    expect(missingFireSafetyData(undecided)).toEqual(['fire.instructions']);
    const context = buildPartialFireSafetyContext(undecided);
    expect(context).not.toHaveProperty('annexes');
    expect(context).not.toHaveProperty('noAnnexes');
    expect(context).not.toHaveProperty('fireThemes');
    expect(context).toHaveProperty('fire');
    expect(fireSafetyGapConcerns('fire.instructions', ['annexes'])).toBe(true);
    expect(fireSafetyGapConcerns('fire.instructions', ['fire', 'client'])).toBe(false);
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

  it("in the technician's certificate concerns what prints the technician", () => {
    expect(
      fireSafetyGapConcerns('provider.fireSafetyTechnicianCertificate', ['fireSafetyTechnician'])
    ).toBe(true);
    expect(fireSafetyGapConcerns('provider.fireSafetyTechnicianCertificate', ['fire'])).toBe(false);
  });

  it('in the client data of the second stage concerns only what prints `fire`', () => {
    for (const code of [
      'fire.trainingSchedule',
      'fire.smokingPolicy',
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

describe('the annexes of the fire-safety own instructions', () => {
  const psi = (moduleId: string, title: string, group: 'work_activity' | 'work_equipment') => ({
    moduleId,
    domain: 'psi' as const,
    title,
    group,
    version: { id: `${moduleId.slice(0, -1)}9`, number: 1, createdAt: '2026-10-01T08:00:00+00:00' },
  });
  const cylinders = psi('a0a0a0a0-0000-4000-8000-000000000005', 'Butelii de gaz', 'work_equipment');
  const storage = psi('a0a0a0a0-0000-4000-8000-000000000004', 'Depozitare', 'work_activity');

  it('are the fire-safety modules the positions apply, each once, by group and title', () => {
    const [accountant, welder] = facts.jobPositions;
    const context = buildFireSafetyContext({
      ...facts,
      jobPositions: [
        { ...accountant!, instructions: [...accountant!.instructions, cylinders, storage] },
        { ...welder!, instructions: [cylinders, ...welder!.instructions] },
      ],
    });
    expect(context.annexes.map((annex) => [annex.number, annex.title, annex.versionDate])).toEqual([
      [1, 'Depozitare', '01.10.2026'],
      [2, 'Lucrul cu foc deschis', '11.10.2026'],
      [3, 'Butelii de gaz', '01.10.2026'],
    ]);
    expect(context.noAnnexes).toBe(false);
  });

  it('leave the occupational safety modules to the other set, which leaves these to this one', () => {
    expect(buildFireSafetyContext(facts).annexes).toEqual([
      {
        number: 1,
        title: 'Lucrul cu foc deschis',
        versionId: 'b0b0b0b0-0000-4000-8000-000000000003',
        versionDate: '11.10.2026',
      },
    ]);
    expect(buildDocumentContext(facts).annexes.map((annex) => annex.title)).toEqual([
      'Activități de birou',
      'Sudură oxiacetilenică',
    ]);
  });

  it('say there are none when no position applies a fire-safety module', () => {
    const context = buildFireSafetyContext({
      ...facts,
      jobPositions: facts.jobPositions.map((position) => ({
        ...position,
        needsFireInstructions: false,
        instructions: position.instructions.filter((module) => module.domain === 'ssm'),
      })),
    });
    expect(context.annexes).toEqual([]);
    expect(context.noAnnexes).toBe(true);
  });
});
