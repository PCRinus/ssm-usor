import { riskLevel } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildDocumentContext,
  documentApplies,
  documentData,
  type DocumentFacts,
  missingDocumentData,
  quantityLabel,
  undecidedJobPositions,
  workersRepresentativeClash,
} from './context';
import { facts } from './context.fixture';

describe('what is missing', () => {
  it('is nothing for complete facts', () => {
    expect(missingDocumentData(facts)).toEqual([]);
  });

  it('names every gap, in the order of the form', () => {
    expect(
      missingDocumentData({
        ...facts,
        organization: {
          legalName: '  ',
          representativeName: null,
          representativeRole: 'Administrator',
        },
        specialist: null,
        client: { ...facts.client, representativeRole: null, trainingDayTo: null },
        responsiblePersons: [
          { fullName: 'A B', jobTitle: 'C', roles: ['first_aid'], currentEmployee: true },
        ],
      })
    ).toEqual([
      'provider.legalName',
      'provider.representativeName',
      'specialist.name',
      'specialist.professionalTitle',
      'client.representativeRole',
      'client.trainingSchedule',
      'responsible.workplace_manager',
      'responsible.risk_evaluation_team',
      'responsible.imminent_danger',
    ]);
  });

  it('needs a position, and a decision on the equipment and the instructions of every position', () => {
    expect(missingDocumentData({ ...facts, jobPositions: [] })).toEqual(['positions.any']);
    const undecided = {
      ...facts,
      jobPositions: [
        { ...facts.jobPositions[0]!, needsProtectiveEquipment: null },
        { ...facts.jobPositions[1]!, needsInstructions: null },
      ],
    };
    expect(missingDocumentData(undecided)).toEqual([
      'positions.equipment',
      'positions.instructions',
    ]);
    expect(undecidedJobPositions(undecided)).toEqual([
      { id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f', name: 'Contabil', undecided: ['equipment'] },
      { id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', name: 'Sudor', undecided: ['instructions'] },
    ]);
    expect(
      undecidedJobPositions(undecided, 'instructions').map((position) => position.name)
    ).toEqual(['Sudor']);
    expect(
      undecidedJobPositions({
        jobPositions: [
          { ...facts.jobPositions[0]!, needsProtectiveEquipment: null, needsInstructions: null },
        ],
      })[0]!.undecided
    ).toEqual(['equipment', 'instructions']);
  });

  it('stops the context from being built', () => {
    expect(() => buildDocumentContext({ ...facts, specialist: null })).toThrow(
      'Missing document data: specialist.name, specialist.professionalTitle'
    );
  });

  it('requires an explicit decision for both categories and at least one interval', () => {
    const withChoices = (
      administrative: number | null,
      worker: number | null,
      administrativeExcluded: boolean,
      workerExcluded: boolean
    ) =>
      missingDocumentData({
        ...facts,
        staffCategoriesInUse: [],
        client: {
          ...facts.client,
          administrativeTrainingIntervalMonths: administrative,
          workerTrainingIntervalMonths: worker,
          administrativeTrainingNotApplicable: administrativeExcluded,
          workerTrainingNotApplicable: workerExcluded,
        },
      });
    expect(withChoices(6, null, false, true)).toEqual([]);
    expect(withChoices(null, 3, true, false)).toEqual([]);
    expect(withChoices(6, null, false, false)).toContain('client.trainingSchedule');
    expect(withChoices(null, null, true, true)).toContain('client.trainingSchedule');
  });

  describe("workers' representatives", () => {
    const representative = (fullName: string, currentEmployee = true) => ({
      fullName,
      jobTitle: 'Vânzător',
      roles: ['workers_representative' as const],
      currentEmployee,
    });
    const missing = (currentEmployeeCount: number, ...representatives: string[]) =>
      missingDocumentData({
        ...facts,
        currentEmployeeCount,
        responsiblePersons: [
          ...facts.responsiblePersons,
          ...representatives.map((name) => representative(name)),
        ],
      });

    it('are not asked for under 10 current employees', () => {
      expect(missing(9)).toEqual([]);
      expect(missing(9, 'Florin Cristian TALOȘ')).toEqual([]);
    });

    it('need one from 10 current employees and two from 50', () => {
      expect(missing(10)).toEqual(['responsible.workers_representative']);
      expect(missing(10, 'Ioana PETRE')).toEqual([]);
      expect(missing(50, 'Ioana PETRE')).toEqual(['responsible.workers_representatives_two']);
      expect(missing(50, 'Ioana PETRE', 'Mihai DOBRE')).toEqual([]);
    });

    it('do not count once their employee has left', () => {
      expect(
        missingDocumentData({
          ...facts,
          currentEmployeeCount: 12,
          responsiblePersons: [...facts.responsiblePersons, representative('Ioana PETRE', false)],
        })
      ).toEqual(['responsible.workers_representative']);
    });

    it('cannot include the legal representative, however the name is typed', () => {
      expect(missing(12, 'Talos Florin-Cristian')).toEqual([
        'responsible.workers_representative_is_legal_representative',
      ]);
    });

    it('names the two people who clash', () => {
      const withClash = {
        ...facts,
        responsiblePersons: [...facts.responsiblePersons, representative('Talos Florin-Cristian ')],
      };
      expect(workersRepresentativeClash(withClash)).toEqual({
        representativeName: 'Talos Florin-Cristian',
        legalRepresentativeName: 'Florin Cristian TALOȘ',
      });
      expect(workersRepresentativeClash(facts)).toBeNull();
    });

    it('are still needed to generate a 1.5 again under 10 employees', () => {
      const again = (...representatives: string[]) =>
        missingDocumentData(
          {
            ...facts,
            currentEmployeeCount: 6,
            responsiblePersons: [
              ...facts.responsiblePersons,
              ...representatives.map((name) => representative(name)),
            ],
          },
          'decision_workers_representative'
        );
      expect(again()).toEqual(['responsible.workers_representative']);
      expect(again('Talos Florin-Cristian')).toEqual([
        'responsible.workers_representative_is_legal_representative',
      ]);
      expect(again('Ioana PETRE')).toEqual([]);
      expect(
        missingDocumentData({ ...facts, currentEmployeeCount: 6 }, 'decision_training')
      ).toEqual([]);
    });
  });

  it('blocks a category with active employees from being excluded', () => {
    expect(
      missingDocumentData({
        ...facts,
        client: {
          ...facts.client,
          workerTrainingIntervalMonths: null,
          workerTrainingNotApplicable: true,
        },
      })
    ).toContain('client.trainingSchedule');
  });

  it('needs every position and the sensitive groups evaluated, with measures and their plan', () => {
    const [groups, sudor, contabil] = facts.riskEvaluations;
    expect(
      missingDocumentData({ ...facts, riskEvaluations: [groups!, { ...sudor!, factors: [] }] })
    ).toEqual(['positions.risk_evaluation']);
    expect(missingDocumentData({ ...facts, riskEvaluations: [sudor!, contabil!] })).toEqual([
      'risk_evaluations.sensitive_groups',
    ]);
    const unmeasured = {
      ...groups!,
      factors: groups!.factors.map((factor) => ({ ...factor, measures: [] })),
    };
    expect(
      missingDocumentData({ ...facts, riskEvaluations: [unmeasured, sudor!, contabil!] })
    ).toEqual(['risk_evaluations.measures']);
    const unplanned = {
      ...contabil!,
      factors: contabil!.factors.map((factor) => ({ ...factor, deadline: null })),
    };
    expect(
      missingDocumentData({ ...facts, riskEvaluations: [groups!, sudor!, unplanned] })
    ).toEqual(['risk_evaluations.plan']);
  });
});

describe('the merge context', () => {
  const context = buildDocumentContext(facts);

  it('prints dates, years and trimmed names', () => {
    expect(context.issueDate).toBe('19.01.2026');
    expect(context.issueYear).toBe('2026');
    expect(context.followingYear).toBe('2027');
    expect(context.client.legalName).toBe('S.C. PIPETECH S.R.L.');
    expect(context.specialist).toEqual({
      name: 'Dan MARIN',
      professionalTitle: 'Evaluator de risc SSM',
    });
  });

  it('puts people under the roles they hold', () => {
    expect(context.workplaceManagers).toEqual([
      { name: 'Florin Cristian TALOȘ', jobTitle: 'Administrator' },
      { name: 'Ioana PETRE', jobTitle: 'Șef de echipă' },
    ]);
    expect(context.evaluationTeam).toHaveLength(1);
    expect(context).not.toHaveProperty('workplaceManager');
  });

  it('names every holder of a role in a sentence that reads for one person or several', () => {
    expect(context.workplaceManagersText).toBe(
      'Florin Cristian TALOȘ, având funcția de Administrator, și Ioana PETRE, având funcția de Șef de echipă'
    );
    expect(context.workplaceManagersList).toBe(
      'Florin Cristian TALOȘ, Administrator; Ioana PETRE, Șef de echipă'
    );
    expect(context.firstAiderNames).toBe('Florin Cristian TALOȘ și Ioana PETRE');
    expect(context.imminentDangerText).toBe(
      'Florin Cristian TALOȘ, având funcția de Administrator, și Ioana PETRE, având funcția de Șef de echipă'
    );

    const third: DocumentFacts['responsiblePersons'][number] = {
      fullName: 'Dan RUS',
      jobTitle: 'Magaziner',
      roles: ['workplace_manager', 'first_aid', 'imminent_danger'],
      currentEmployee: true,
    };
    const three = buildDocumentContext({
      ...facts,
      responsiblePersons: [...facts.responsiblePersons, third],
    });
    expect(three.firstAiderNames).toBe('Florin Cristian TALOȘ, Ioana PETRE și Dan RUS');
    expect(three.imminentDangerText).toBe(
      'Florin Cristian TALOȘ, având funcția de Administrator, Ioana PETRE, având funcția de Șef de echipă, și Dan RUS, având funcția de Magaziner'
    );
    expect(three.workplaceManagersList).toBe(
      'Florin Cristian TALOȘ, Administrator; Ioana PETRE, Șef de echipă; Dan RUS, Magaziner'
    );

    const one = buildDocumentContext({
      ...facts,
      responsiblePersons: facts.responsiblePersons.slice(0, 1),
    });
    expect(one.workplaceManagersText).toBe('Florin Cristian TALOȘ, având funcția de Administrator');
    expect(one.workplaceManagersList).toBe('Florin Cristian TALOȘ, Administrator');
    expect(one.firstAiderNames).toBe('Florin Cristian TALOȘ');
  });

  it('chooses how the workplace managers act in imminent danger', () => {
    const wording = (...roles: DocumentFacts['responsiblePersons'][number]['roles'][]) => {
      const built = buildDocumentContext({
        ...facts,
        responsiblePersons: roles.map((personRoles, index) => ({
          fullName: `Persoana ${index + 1}`,
          jobTitle: 'Administrator',
          roles: [...personRoles, 'first_aid', 'risk_evaluation_team'],
          currentEmployee: true,
        })),
      });
      const chosen = [
        built.workplaceManagersAssumeImminentDanger && 'assume',
        built.workplaceManagersAssumeAndDesignateImminentDanger && 'assume and designate',
        built.workplaceManagersDesignateImminentDanger && 'designate',
      ].filter(Boolean);
      expect(chosen).toHaveLength(1);
      return [chosen[0], built.imminentDangerOthersText];
    };
    const both = ['workplace_manager', 'imminent_danger'] as const;

    expect(context.workplaceManagersAssumeImminentDanger).toBe(true);
    expect(wording([...both])).toEqual(['assume', null]);
    expect(wording([...both], [...both])).toEqual(['assume', null]);
    expect(wording([...both], ['imminent_danger'])).toEqual([
      'assume and designate',
      'Persoana 2, având funcția de Administrator',
    ]);
    expect(wording([...both], [...both], ['imminent_danger'], ['imminent_danger'])).toEqual([
      'assume and designate',
      'Persoana 3, având funcția de Administrator, și Persoana 4, având funcția de Administrator',
    ]);
    expect(wording(['workplace_manager'], ['imminent_danger'])).toEqual(['designate', null]);
    expect(wording([...both], ['workplace_manager'])).toEqual(['designate', null]);
    expect(wording([...both], ['workplace_manager'], ['imminent_danger'])).toEqual([
      'designate',
      null,
    ]);
  });

  it('words the training schedule', () => {
    expect(context.training).toEqual({
      periodicDuration: '2\u00a0ore',
      intervalPhrase: 'următoarele intervale de timp',
      administrative: true,
      worker: true,
      administrativeFrequency: 'SEMESTRIAL',
      administrativeMonths: 'lunile februarie și august',
      workerFrequency: 'TRIMESTRIAL',
      workerMonths: 'lunile februarie, mai, august și noiembrie',
      dayFrom: 2,
      dayTo: 7,
    });
    const other = buildDocumentContext({
      ...facts,
      client: {
        ...facts.client,
        periodicTrainingMinutes: 60,
        administrativeTrainingIntervalMonths: 12,
        workerTrainingIntervalMonths: 2,
        trainingFirstMonth: 9,
      },
    });
    expect(other.training.periodicDuration).toBe('1\u00a0oră');
    expect(
      buildDocumentContext({ ...facts, client: { ...facts.client, periodicTrainingMinutes: 90 } })
        .training.periodicDuration
    ).toBe('1\u00a0oră și 30\u00a0de\u00a0minute');
    expect(other.training.administrativeFrequency).toBe('ANUAL');
    expect(other.training.administrativeMonths).toBe('luna septembrie');
    expect(other.training.workerFrequency).toBe('LA 2 LUNI');
    expect(other.training.workerMonths).toBe(
      'lunile ianuarie, martie, mai, iulie, septembrie și noiembrie'
    );

    const late = buildDocumentContext({
      ...facts,
      client: { ...facts.client, workerTrainingIntervalMonths: 6, trainingFirstMonth: 11 },
    });
    expect(late.training.workerFrequency).toBe('SEMESTRIAL');
    expect(late.training.workerMonths).toBe('lunile mai și noiembrie');
    expect(late.training.administrativeMonths).toBe('lunile mai și noiembrie');
  });

  it('builds only the applicable category context', () => {
    const administrativeOnly = buildDocumentContext({
      ...facts,
      staffCategoriesInUse: ['technical_administrative'],
      client: {
        ...facts.client,
        workerTrainingIntervalMonths: null,
        workerTrainingNotApplicable: true,
      },
    });
    expect(administrativeOnly.training.worker).toBe(false);
    expect(administrativeOnly.training.intervalPhrase).toBe('următorul interval de timp');
    expect(administrativeOnly.training).not.toHaveProperty('workerFrequency');

    const workerOnly = buildDocumentContext({
      ...facts,
      staffCategoriesInUse: ['execution'],
      client: {
        ...facts.client,
        administrativeTrainingIntervalMonths: null,
        administrativeTrainingNotApplicable: true,
      },
    });
    expect(workerOnly.training.administrative).toBe(false);
    expect(workerOnly.training).not.toHaveProperty('administrativeFrequency');
  });

  it('numbers the decisions from the first number, and only the decisions', () => {
    expect(documentData(context, 'decision_training')).toMatchObject({ decisionNumber: 5 });
    expect(documentData(context, 'decision_imminent_danger')).toMatchObject({ decisionNumber: 8 });
    expect(documentData(context, 'control_regulation')).not.toHaveProperty('decisionNumber');
    expect(documentData(context, 'decision_training')).not.toHaveProperty('decisionNumbers');
  });

  it('lists every position for the table of posts, and the equipped ones with their entries', () => {
    expect(context.positions).toEqual([
      {
        name: 'Contabil',
        activities: '—',
        staffCategory: 'Tehnico-administrativ',
        workZone: 'Birou',
        workZoneLine: true,
        workZoneOrDash: 'Birou',
        intervalLabel: 'la 6 luni',
        trainingDuration: '2\u00a0ore',
      },
      {
        name: 'Sudor',
        activities: 'Sudură electrică și autogenă.',
        staffCategory: 'Execuție',
        workZone: '',
        workZoneLine: false,
        workZoneOrDash: '—',
        intervalLabel: 'la 2 luni',
        trainingDuration: '2\u00a0ore',
      },
    ]);
    expect(context.equippedPositions).toEqual([
      {
        ...context.positions[1],
        equipment: [
          {
            risk: 'Radiații, împroșcare (față, ochi)',
            item: 'Mască de sudură',
            quantityLabel: '1 buc. / 24 de luni',
            allocationLabel: 'Inventar de secție',
          },
          {
            risk: 'Căldură, foc (mâini)',
            item: 'Mănuși de sudor',
            quantityLabel: '2 buc. / 1 lună',
            allocationLabel: 'Inventar personal',
          },
          {
            risk: 'Pulberi',
            item: 'Mască de unică folosință',
            quantityLabel: '50 buc.',
            allocationLabel: 'Consum',
          },
        ],
      },
    ]);
  });

  it('names the positions without equipment only beside equipped ones', () => {
    expect(context.unequippedPositionsText).toBe('postul de lucru Contabil');
    const [contabil, sudor] = facts.jobPositions;
    const withPositions = (jobPositions: (typeof facts)['jobPositions']) =>
      buildDocumentContext({ ...facts, jobPositions }).unequippedPositionsText;
    expect(withPositions([contabil!, { ...contabil!, name: 'Șofer' }, sudor!])).toBe(
      'posturile de lucru Contabil și Șofer'
    );
    expect(withPositions([sudor!])).toBeNull();
    expect(withPositions([contabil!])).toBeNull();
  });

  it('counts the months of an equipment entry as Romanian counts them', () => {
    expect(
      [1, 2, 19, 20, 21, 101, 120].map((durationMonths) =>
        quantityLabel({ quantity: 2, durationMonths })
      )
    ).toEqual([
      '2 buc. / 1 lună',
      '2 buc. / 2 luni',
      '2 buc. / 19 luni',
      '2 buc. / 20 de luni',
      '2 buc. / 21 de luni',
      '2 buc. / 101 luni',
      '2 buc. / 120 de luni',
    ]);
    expect(quantityLabel({ quantity: 20, durationMonths: null })).toBe('20 buc.');
  });

  it('annexes the modules the positions apply, each once, by group and title, with their versions', () => {
    expect(context.annexes).toEqual([
      {
        number: 1,
        title: 'Activități de birou',
        versionId: 'b0b0b0b0-0000-4000-8000-000000000002',
        versionDate: '26.09.2026',
      },
      {
        number: 2,
        title: 'Sudură oxiacetilenică',
        versionId: 'b0b0b0b0-0000-4000-8000-000000000001',
        versionDate: '25.09.2026',
      },
    ]);
    expect(context.noAnnexes).toBe(false);
    const none = buildDocumentContext({
      ...facts,
      jobPositions: facts.jobPositions.map((position) => ({
        ...position,
        needsInstructions: false,
        instructions: [],
      })),
    });
    expect([none.annexes, none.noAnnexes]).toEqual([[], true]);
  });

  it('switches the branding line', () => {
    expect(context.branding).toBe(true);
    expect(buildDocumentContext({ ...facts, branding: false }).branding).toBe(false);
  });

  it("gives the training material the evaluations' unacceptable factors as the unit's risks", () => {
    expect(context.unitRisks).toHaveLength(8);
    expect(context.unitRisks[0]).toEqual({
      risk: 'Electrocutare prin atingere indirectă, la defectarea împământării unui echipament.',
      measure:
        '– Măsurarea anuală a rezistenței prizei de pământ (buletin PRAM).\n– Anunțarea imediată a conducătorului locului de muncă la orice defect electric.',
    });
    expect([context.hasUnitRisks, context.noUnitRisks]).toEqual([true, false]);
    const acceptable = buildDocumentContext({
      ...facts,
      riskEvaluations: facts.riskEvaluations.map((evaluation) => ({
        ...evaluation,
        factors: evaluation.factors.filter(
          (factor) => riskLevel(factor.gravityClass, factor.probabilityClass) <= 3
        ),
      })),
    });
    expect([acceptable.unitRisks, acceptable.hasUnitRisks, acceptable.noUnitRisks]).toEqual([
      [],
      false,
      true,
    ]);
  });

  it('presents the unit and its evaluations for the risk assessment and the prevention plan', () => {
    expect(context.riskAssessment.unit).toEqual({
      activity: '2562 – Fabricarea articolelor de feronerie',
      employeeCount: 6,
      workplaces: [
        { label: 'Sediu social', address: 'București, Sector 1, Calea Victoriei 122A' },
        {
          label: 'Punct de lucru „Atelier Ghiroda”',
          address: 'Ghiroda, județul Timiș, Str. Industriilor 4',
        },
      ],
      noWorkplaces: false,
    });
    expect(
      context.riskAssessment.evaluations.map((evaluation) => [evaluation.roman, evaluation.heading])
    ).toEqual([
      ['I', 'LOCUL DE MUNCĂ: BIROU, POSTUL DE LUCRU: CONTABIL'],
      ['II', 'POSTUL DE LUCRU: SUDOR'],
      [
        'III',
        'GRUPURI SENSIBILE LA RISCURI SPECIFICE (FEMEI GRAVIDE, LĂUZE SAU FEMEI CARE ALĂPTEAZĂ, TINERI, PERSOANE CU DIZABILITĂȚI)',
      ],
    ]);
    expect(context.riskAssessment.globalLevel).toBe('3,15');
  });
});

describe('the training themes', () => {
  const { themes } = buildDocumentContext(facts);

  it('cite the own instructions revision and the titles it annexes', () => {
    expect(themes!.ownInstructionsRevision).toEqual({
      id: 'd0d0d0d0-0000-4000-8000-000000000001',
      number: 2,
      versionIds: ['b0b0b0b0-0000-4000-8000-000000000002', 'b0b0b0b0-0000-4000-8000-000000000001'],
    });
    expect(themes!.annexTitles).toBe(
      'I.P.S.S.M. Activități de birou; I.P.S.S.M. Sudură oxiacetilenică'
    );
  });

  it('give every position its trainer, its modules, its interval and its sessions', () => {
    expect(
      themes!.positions.map(({ sessions, ...position }) => ({
        ...position,
        months: sessions.map((session) => session.month),
      }))
    ).toEqual([
      {
        name: 'CONTABIL',
        trainer: 'S.C. SERVICIU EXTERN DEMO S.R.L. – Dan MARIN',
        modules: [{ citation: 'I.P.S.S.M. Activități de birou, Art.\u00a01\u00a0–\u00a012' }],
        intervalLabel: '6 LUNI',
        months: ['FEBRUARIE', 'AUGUST'],
      },
      {
        name: 'SUDOR',
        trainer: 'Florin Cristian TALOȘ și Ioana PETRE – conducători loc\u00a0de\u00a0muncă',
        modules: [
          { citation: 'I.P.S.S.M. Activități de birou, Art.\u00a01\u00a0–\u00a012' },
          { citation: 'I.P.S.S.M. Sudură oxiacetilenică, Art.\u00a01\u00a0–\u00a031' },
        ],
        intervalLabel: '2 LUNI',
        months: ['FEBRUARIE', 'APRILIE', 'IUNIE', 'AUGUST', 'OCTOMBRIE', 'DECEMBRIE'],
      },
    ]);
    expect(themes!.positions[0]!.sessions).toEqual([
      {
        month: 'FEBRUARIE',
        content:
          'I.P.S.S.M. Art.\u00a01\u00a0–\u00a094; I.P.S.S.M. Activități de birou, Art.\u00a01\u00a0–\u00a012',
        duration: '120 min',
      },
      {
        month: 'AUGUST',
        content:
          'I.P.S.S.M. Art.\u00a095\u00a0–\u00a0287; I.P.S.S.M. Activități de birou, Art.\u00a01\u00a0–\u00a012; Testare.',
        duration: '120 min',
      },
    ]);
  });

  it('leave out a module the own instructions revision does not annex', () => {
    const behind = buildDocumentContext({
      ...facts,
      ownInstructions: {
        ...facts.ownInstructions!,
        annexes: facts.ownInstructions!.annexes.slice(0, 1),
      },
    }).themes!;
    expect(behind.annexTitles).toBe('I.P.S.S.M. Activități de birou');
    expect(behind.positions[1]!.modules).toEqual([
      { citation: 'I.P.S.S.M. Activități de birou, Art.\u00a01\u00a0–\u00a012' },
    ]);
  });

  it('are absent without an own instructions revision, and the themes alone then refuse', () => {
    const without = { ...facts, ownInstructions: null };
    expect(missingDocumentData(without)).toEqual([]);
    expect(missingDocumentData(without, 'own_instructions')).toEqual([]);
    expect(missingDocumentData(without, 'training_themes')).toEqual(['documents.own_instructions']);
    expect(missingDocumentData(facts, 'training_themes')).toEqual([]);
    const context = buildDocumentContext(without);
    expect(context).not.toHaveProperty('themes');
    expect(() => documentData(context, 'training_themes')).toThrow();
    expect(documentData(context, 'own_instructions')).not.toHaveProperty('themes');
  });
});

describe('decision 1.5', () => {
  const withRepresentatives = {
    ...facts,
    currentEmployeeCount: 12,
    responsiblePersons: [
      ...facts.responsiblePersons,
      {
        fullName: 'Mihai DOBRE ',
        jobTitle: 'Vânzător',
        roles: ['workers_representative' as const],
        currentEmployee: true,
      },
      {
        fullName: 'Radu ENE',
        jobTitle: 'Vânzător',
        roles: ['workers_representative' as const],
        currentEmployee: false,
      },
    ],
  };

  it('belongs in the set from 10 current employees', () => {
    expect(documentApplies({ currentEmployeeCount: 9 }, 'decision_workers_representative')).toBe(
      false
    );
    expect(documentApplies({ currentEmployeeCount: 10 }, 'decision_workers_representative')).toBe(
      true
    );
    expect(documentApplies({ currentEmployeeCount: 0 }, 'decision_training')).toBe(true);
  });

  it('names the representatives who are still employees, and the cover lists it', () => {
    const context = buildDocumentContext(withRepresentatives);
    expect(context.workersRepresentatives).toEqual([{ name: 'Mihai DOBRE', jobTitle: 'Vânzător' }]);
    expect(context.workersRepresentativesLead).toBe('următorul angajat');
    expect(context.workersRepresentativeDecision).toBe(true);
    expect(documentData(context, 'decision_workers_representative')).toMatchObject({
      decisionNumber: 9,
    });
  });

  it('is left off the cover under 10 current employees, unless it was generated', () => {
    expect(buildDocumentContext(facts).workersRepresentativeDecision).toBe(false);
    expect(
      buildDocumentContext({ ...facts, workersRepresentativeDecisionGenerated: true })
        .workersRepresentativeDecision
    ).toBe(true);
  });
});
