import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { renderDocument, templatePlaceholders } from '../render';
import { documentText } from '../text';
import {
  bodyOf,
  documentTextOf,
  fireFiles,
  perEmployeeFiles,
  questionsOf,
  read,
  setEntries,
} from './read';

// ADR 016: a set of its own, in its own folder, merged with the shared facts, the technician
// and, from stage 2 (ADR 018), the `fire` object only. A name of the occupational safety set
// would mark these drafts as changed when it does.
describe('fire-safety set', () => {
  const manifest = { templates: setEntries('fire') };
  const stageOne = manifest.templates
    .filter((entry) => entry.stage === 1)
    .map((entry) => entry.path);
  // Stage 3 (ADR 019) merges the same names, the technician's certificate and authorization too.
  const stageTwo = manifest.templates
    .filter((entry) => entry.stage! >= 2)
    .map((entry) => entry.path);
  const allowed = [
    'branding',
    'client.legalName',
    'client.representativeName',
    'client.representativeRole',
    'fireSafetyTechnician.name',
    'provider.legalName',
    'installationRegister',
    'installationSheets',
    'extinguisherRegister.rows',
    'extinguisherRegister.blankRows',
  ];
  const data = {
    branding: true,
    client: {
      legalName: 'S.C. CLIENT DEMO S.R.L.',
      representativeName: 'Maria POPESCU',
      representativeRole: 'Administrator',
    },
    provider: { legalName: 'S.C. SERVICIU EXTERN S.R.L.' },
    fireSafetyTechnician: { name: 'Dan MARIN' },
    seasonsDecision: true,
    controlDecision: true,
    installationRegister: true,
    extinguisherRegister: {
      rows: [
        { type: 'P6 – Pulbere, 6\u00a0kg, nr. inventar 0012', place: 'Magazin – Laborator' },
        { type: 'G5 – Dioxid de carbon (CO₂), 5\u00a0kg', place: 'Depozit' },
      ],
      blankRows: [{}, {}, {}, {}, {}, {}, {}],
    },
    installationSheets: [
      {
        first: true,
        number: '1',
        name: 'Hidranți interiori – Unul pe nivel',
        place: 'Magazin',
        maintainer: 'S.C. HIDRANȚI DEMO S.R.L.',
      },
      {
        first: false,
        number: '2',
        name: 'Instalație de detectare, semnalizare și avertizare la incendiu',
        place: 'Depozit',
        maintainer: '',
      },
    ],
  };
  const technician = {
    name: 'Dan MARIN',
    certificate: 'seria A nr. 1234/2024',
    authorization: 'nr. 12 din 15.09.2026, ISU Timiș',
  };
  const person = { name: 'Ion VLAD', jobTitle: 'Șef magazin', jobTitleRunOn: 'șef magazin' };
  const workplace = {
    first: true,
    name: 'Magazin',
    activity: 'Gelaterie',
    activityRunOn: 'gelaterie',
    address: 'Timișoara, județul Timiș, Str. Lungă 5',
    areaLabel: '120\u00a0m²',
    normLabel: 'Clădiri comerciale (1 buc./200 m²)',
    assemblyPoint: 'Parcarea din spate',
    combustibleMaterials: 'Cartoane',
    ignitionSources: 'Instalația electrică',
    fireRiskEquipment: 'Vitrine frigorifice',
    specificMeasures: 'Vitrinele se opresc noaptea.',
    specificMeasuresRunOn: 'vitrinele se opresc noaptea.',
    extinguishers: [
      { code: 'P6', agentLabel: 'Pulbere', capacityLabel: '6 kg', wheeled: false, count: 2 },
      { code: 'P50', agentLabel: 'Pulbere', capacityLabel: '50 kg', wheeled: true, count: 1 },
    ],
    extinguisherCount: 3,
    otherEquipment: [{ kindLabel: 'Ladă cu nisip', count: 1 }],
    meansByPlace: [
      { place: 'Laborator', means: 'Stingător P6 – Pulbere, 6\u00a0kg', count: 2 },
      { place: 'Curte', means: 'Ladă cu nisip', count: 1 },
      { place: '—', means: 'Stingător P50 – Pulbere, 50\u00a0kg, carosabil', count: 1 },
    ],
    hasPlaces: true,
    installations: [{ kindLabel: 'Hidranți interiori', description: 'Unul pe nivel' }],
    alarmInstallations: [],
    extinguishingInstallations: [{ kindLabel: 'Hidranți interiori', description: 'Unul pe nivel' }],
    hasEmergencyLighting: false,
    hasInstallations: true,
    hasExteriorHydrants: true,
    hasInteriorHydrants: true,
    manager: person,
    firstIntervention: [{ ...person, roleLabel: 'șef echipă de primă intervenție' }],
    firstInterventionNames: 'Ion VLAD',
    interventionLeaderName: 'Ion VLAD',
  };
  const fire = {
    representativeRoleRunOn: 'administrator',
    decisionNumbers: {
      organization: '4 SU',
      training: '5 SU',
      openFire: '6 SU',
      smoking: '7 SU',
      technician: '8 SU',
      instructions: '9 SU',
      waste: '10 SU',
      seasons: '11 SU',
      control: '12 SU',
    },
    schedule: {
      periodicHours: 2,
      periodicLabel: '2 ore',
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
    },
    staff: {
      administrative: ['Manager magazin'],
      execution: ['Barman'],
      administrativeText: 'Manager magazin',
      executionText: 'Barman',
    },
    coordinator: person,
    interventionLeader: person,
    workplaceManagers: [{ ...person, workplaceName: null }],
    manyWorkplaceManagers: false,
    designated: [person],
    workplaces: [workplace, { ...workplace, first: false, name: 'Depozit' }],
    hasExteriorHydrants: true,
    hasGasExtinguishers: true,
    hasThirdParties: true,
    smoking: {
      policy: 'designated_places',
      forbiddenEverywhere: false,
      designatedPlaces: true,
      place: 'în curtea interioară',
    },
    waste: {
      kinds: ['deșeuri de carton'],
      contractor: 'S.C. ECO S.R.L.',
      collectors: 'muncitorii necalificați și șeful de șantier',
    },
    annualReport: {
      year: 2026,
      nextYear: 2027,
      decisions: [
        {
          title: 'Decizia privind organizarea apărării împotriva incendiilor',
          reference: 'nr.\u00a04\u00a0SU din 19.01.2026',
        },
        {
          title: 'Decizia privind instruirea în domeniul situațiilor de urgență',
          reference: 'nr.\u00a05\u00a0SU din 19.01.2026',
        },
      ],
      coordinator: 'Ion VLAD, Șef magazin',
      interventionLeader: 'Ion VLAD, Șef magazin',
      workplaceManagers: 'Ion VLAD',
      staff: [
        { label: 'Personal administrativ', posts: 'Contabil', headcount: '2 angajați' },
        { label: 'Personal de execuție', posts: 'Lucrător comercial', headcount: '10 angajați' },
      ],
      headcount: '12 angajați',
      workplaces: [
        {
          name: 'Magazin',
          place: 'Magazin, Timișoara, Str. Lungă 5',
          rows: [
            {
              what: 'Stingător P6 – pulbere, 6\u00a0kg',
              quantity: '2\u00a0buc.',
              next: '15.01.2027',
            },
            { what: 'Hidranți interiori', quantity: '1 instalație', next: '12.03.2027' },
          ],
        },
        {
          name: 'Depozit',
          place: 'Depozit, Timișoara, Str. Scurtă 2',
          rows: [
            {
              what: 'Stingător G5 – dioxid de carbon (CO₂), 5\u00a0kg',
              quantity: '1\u00a0buc.',
              next: '—',
            },
          ],
        },
      ],
      periodicLabel: '2\u00a0ore',
      training: [
        {
          label: 'Personal administrativ',
          posts: 'Contabil',
          interval: 'la 6 luni',
          months: 'februarie, august',
        },
      ],
      yearDecisions: [
        {
          text: 'Decizia privind organizarea apărării împotriva incendiilor, nr.\u00a04\u00a0SU din 19.01.2026',
        },
        {
          text: 'Decizia privind instruirea în domeniul situațiilor de urgență, nr.\u00a05\u00a0SU din 02.06.2026, revizia 2',
        },
      ],
      hasYearDecisions: true,
      noYearDecisions: false,
      trainingRecords: [
        {
          text: 'Potrivit evidenței instruirilor, în anul 2026 s-a efectuat: 1 instructaj periodic, în luna februarie, la care au participat 2 angajați.',
        },
        {
          text: 'În același an, potrivit rezultatelor consemnate, testul anual a fost promovat de 2 angajați.',
        },
      ],
      noTrainingRecords: false,
      controls: [
        {
          who: 'Șefii locurilor de muncă',
          interval: 'zilnic sau pe schimb',
          scope: 'locul de muncă condus',
        },
      ],
      hasControls: true,
      noControls: false,
      documents: [
        {
          title: 'Decizia privind organizarea apărării împotriva incendiilor',
          state: 'emis, rev.\u00a01 din 19.01.2026',
        },
        { title: 'Fișa obiectivului', state: 'negenerat' },
      ],
      missingCount: 1,
      allGenerated: false,
      documentsSummary: 'Documente neîntocmite încă: 1.',
    },
    siteSheet: {
      identity: [
        {
          title: 'Denumirea operatorului economic/instituției',
          value: 'S.C. CLIENT DEMO S.R.L.',
          hint: 'denumirea în clar',
        },
        {
          title: 'Administrator/Conducător – telefon domiciliu',
          value: null,
          hint: 'telefonul de domiciliu',
        },
        {
          title: 'Coordonatele filialelor/sucursalelor/punctelor de lucru (dacă este cazul)',
          value: '– Magazin: Timișoara, Str. Lungă 5\n– Depozit: Timișoara, Str. Scurtă 2',
          hint: 'adresa fiecărui punct de lucru',
        },
      ],
      general: [
        {
          title: 'Anul de construire (punere în funcțiune)',
          value: 'Clădirea 1 (Magazin): 1987\nClădirea 2 (Depozit): DE COMPLETAT',
          hint: 'anul punerii în funcțiune',
        },
        { title: 'Utilizarea clădirii', value: null, hint: 'prezența oamenilor în clădire' },
      ],
      buildings: [
        {
          name: 'Magazin',
          place: 'Magazin, Timișoara, Str. Lungă 5',
          constructive: [
            {
              title: 'Compartimente de incendiu',
              value: null,
              hint: 'numărul compartimentelor de incendiu, suprafața și înălțimea fiecăruia',
            },
          ],
          technical: [
            {
              title: 'Hidranți interiori/coloane uscate',
              value: 'există: Unul pe nivel',
              hint: 'dacă există',
            },
            { title: 'Sisteme de detectare a gazelor', value: 'nu există', hint: 'dacă există' },
          ],
        },
        {
          name: 'Depozit',
          place: 'Depozit',
          constructive: [{ title: 'Stabilitatea la foc', value: null, hint: 'din proiect' }],
          technical: [
            { title: 'Stingătoare', value: 'P6 – 2\u00a0buc.', hint: 'pe tipodimensiuni' },
          ],
        },
      ],
      noBuildings: false,
      substances: {
        none: false,
        listed: true,
        entries: [
          {
            name: 'Propan',
            rows: [
              {
                title: 'Cantitatea existentă în unitate',
                value: '2 butelii de 11 kg',
                hint: 'pentru fiecare substanță',
              },
              { title: 'Mod de operare', value: null, hint: 'modul de manipulare și de utilizare' },
            ],
          },
        ],
      },
      organization: [
        {
          title: 'Serviciu privat pentru situații de urgență',
          value: 'nu există; nu este cazul',
          hint: 'dacă există',
        },
        {
          title: 'Planuri/exerciții de evacuare din clădire',
          value: null,
          hint: 'când s-a executat ultima oară exercițiul de evacuare',
        },
      ],
    },
    schedules: [
      {
        name: 'Magazin',
        activity: 'Gelaterie',
        activityRunOn: 'gelaterie',
        hasRows: true,
        empty: false,
        rows: [
          {
            what: 'Controlul fiecărui stingător de incendiu (P6 – 2 buc., G3 – 1 buc.)',
            interval: 'lunar',
            who: 'Ion VLAD, coordonatorul privind apărarea împotriva incendiilor, cu cadrul tehnic, după caz',
            basis: 'OMAI 135/2023 – art. 8',
          },
          {
            what: 'Verificarea prin cântărire a stingătoarelor cu CO₂ sau agent curat (G3 – 1 buc.)',
            interval: 'la cel mult 6 luni, în iunie și decembrie',
            who: 'Ion VLAD, coordonatorul privind apărarea împotriva incendiilor, cu cadrul tehnic, după caz',
            basis: 'OMAI 135/2023 – art. 8 alin. (3)',
          },
          {
            what: 'Instalația de utilizare a gazelor naturale',
            interval: 'anual',
            who: 'Operatorul de distribuție',
            basis: '—',
          },
        ],
      },
      {
        name: 'Depozit',
        activity: 'Depozitare',
        activityRunOn: 'depozitare',
        hasRows: false,
        empty: true,
        rows: [],
      },
    ],
    substances: {
      state: 'listed',
      none: false,
      listed: true,
      entries: [
        {
          name: 'Propan',
          classification: 'Flam. Gas 1, H220; Press. Gas, H280',
          quantity: '2 butelii de 11 kg',
          physicalChemicalProperties: 'DE COMPLETAT',
          identificationCodes: 'CAS 74-98-6, UN 1978',
          healthEnvironmentRisks: 'DE COMPLETAT',
          protectionMeans: 'Mănuși de protecție',
          interventionMeasures: 'DE COMPLETAT',
          extinguishingAgents: 'Pulbere, CO₂',
          storagePlace: 'Cușca metalică din curte',
          handling: 'DE COMPLETAT',
        },
        {
          name: 'Diluant',
          classification: 'Flam. Liq. 2, H225',
          quantity: '5 l',
          physicalChemicalProperties: 'Lichid incolor',
          identificationCodes: 'DE COMPLETAT',
          healthEnvironmentRisks: 'Poate provoca somnolență',
          protectionMeans: 'Mănuși din nitril',
          interventionMeasures: 'Aerisirea încăperii',
          extinguishingAgents: 'Spumă, pulbere',
          storagePlace: 'Dulapul metalic',
          handling: 'Departe de surse de aprindere',
        },
      ],
    },
  };
  // Every condition the other way: no contractor, no manager at a workplace, nothing optional.
  const sparse = {
    ...fire,
    staff: { ...fire.staff, administrative: [], administrativeText: null },
    workplaces: [
      {
        ...workplace,
        specificMeasures: '',
        specificMeasuresRunOn: '',
        otherEquipment: [],
        meansByPlace: [],
        hasPlaces: false,
        installations: [],
        alarmInstallations: [],
        extinguishingInstallations: [],
        hasInstallations: false,
        schedules: [
          {
            name: 'Magazin',
            activity: 'Gelaterie',
            activityRunOn: 'gelaterie',
            hasRows: true,
            empty: false,
            rows: [
              {
                what: 'Controlul fiecărui stingător de incendiu (P6 – 1 buc.)',
                interval: 'lunar',
                who: 'Ion VLAD, coordonatorul privind apărarea împotriva incendiilor, cu cadrul tehnic, după caz',
                basis: 'OMAI 135/2023 – art. 8',
              },
            ],
          },
        ],
        hasExteriorHydrants: false,
        hasInteriorHydrants: false,
        manager: null,
        firstIntervention: [],
      },
    ],
    hasExteriorHydrants: false,
    hasGasExtinguishers: false,
    hasThirdParties: false,
    smoking: {
      policy: 'forbidden_everywhere',
      forbiddenEverywhere: true,
      designatedPlaces: false,
      place: null,
    },
    waste: { kinds: ['deșeuri menajere'], contractor: null, collectors: null },
    substances: { state: 'none', none: true, listed: false, entries: [] },
    annualReport: {
      ...fire.annualReport,
      decisions: [],
      yearDecisions: [],
      hasYearDecisions: false,
      noYearDecisions: true,
      trainingRecords: [],
      noTrainingRecords: true,
      staff: [],
      training: [],
      controls: [],
      hasControls: false,
      noControls: true,
      documents: [],
      missingCount: 0,
      allGenerated: true,
      documentsSummary: 'Toate documentele cerute operatorului sunt întocmite.',
    },
    siteSheet: {
      ...fire.siteSheet,
      buildings: [],
      noBuildings: true,
      substances: { none: true, listed: false, entries: [] },
    },
  };
  const fireThemes = {
    ownInstructionsRevision: { id: 'r-1', number: 1, versionIds: ['v-1', 'v-2'] },
    workplaceNames: 'Magazin, Depozit',
    categories: [
      {
        staffCategory: 'technical_administrative',
        label: 'Personal administrativ',
        posts: ['Manager magazin'],
        postsText: 'Manager magazin',
        workplaceTrainers: { workplaceManagers: null, technician: true },
        periodicTrainers: { workplaceManagers: null, technician: true },
        intervalLabel: '6 LUNI',
        sessions: [
          { month: 'FEBRUARIE', content: 'IPSU Art. 1 – 130; Afișate', duration: '120 min' },
          {
            month: 'AUGUST',
            content: 'IPSU Art. 131 – 257; Afișate; Testare.',
            duration: '120 min',
          },
        ],
      },
      {
        staffCategory: 'execution',
        label: 'Personal de execuție',
        posts: ['Barman'],
        postsText: 'Barman',
        workplaceTrainers: {
          workplaceManagers: 'Ion VLAD – conducătorul locului de muncă',
          technician: false,
        },
        periodicTrainers: {
          workplaceManagers: 'Ion VLAD – conducătorul locului de muncă',
          technician: true,
        },
        intervalLabel: '3 LUNI',
        sessions: [
          { month: 'FEBRUARIE', content: 'IPSU Art. 1 – 76; Afișate', duration: '120 min' },
          {
            month: 'NOIEMBRIE',
            content: 'IPSU Art. 236 – 257; Afișate; Testare.',
            duration: '120 min',
          },
        ],
      },
    ],
  };
  const sparseThemes = { ...fireThemes, categories: fireThemes.categories.slice(1) };
  const fireAnnexes = [
    { number: 1, title: 'Lucrul cu foc deschis', versionId: 'v-1', versionDate: '11.10.2026' },
    { number: 2, title: 'Depozitarea buteliilor', versionId: 'v-2', versionDate: '02.10.2026' },
  ];
  const stageTwoData = {
    ...data,
    issueDate: '19.01.2026',
    fireSafetyTechnician: technician,
    fire,
    annexes: fireAnnexes,
    noAnnexes: false,
    fireThemes,
    officeWithoutActivity: null,
  };

  it('are the files of their manifest, named after their numbers and their types', () => {
    expect(manifest.templates.map((entry) => entry.path).sort()).toEqual(
      fireFiles.filter((name) => !perEmployeeFiles.includes(name)).sort()
    );
    for (const entry of manifest.templates) {
      expect(entry.file).toBe(`${entry.number}_${entry.typeKey}.docx`);
      expect(entry.typeKey).toMatch(/^fire_[a-z0-9_]{1,54}$/);
      expect(entry.title).toBeTruthy();
      expect([1, 2, 3]).toContain(entry.stage);
    }
    expect(new Set(manifest.templates.map((entry) => entry.typeKey)).size).toBe(
      manifest.templates.length
    );
  });

  const inventoryItemNames = ['type', 'place', 'first', 'number', 'name', 'maintainer'];

  it.each(stageOne)(
    '%s asks only for the shared facts, the technician, the inventory and whether the set holds the installation register',
    (name) => {
      expect(
        templatePlaceholders(read(name)).filter(
          (placeholder) =>
            !allowed.includes(placeholder) && !inventoryItemNames.includes(placeholder)
        )
      ).toEqual([]);
      expect(documentText(renderDocument(read(name), data))).not.toContain('{{');
    }
  );

  // Inside a loop a name is the item's, so only the dotted ones are held to the list.
  it.each(stageTwo)(
    '%s asks for the shared facts, the `fire` object and the themes only',
    (name) => {
      expect(
        templatePlaceholders(read(name)).filter(
          (placeholder) =>
            placeholder.includes('.') &&
            placeholder !== '.' &&
            !allowed.includes(placeholder) &&
            !placeholder.startsWith('fire.') &&
            !placeholder.startsWith('fireSafetyTechnician.') &&
            !placeholder.startsWith('fireThemes.')
        )
      ).toEqual([]);
    }
  );

  it.each(
    stageTwo.flatMap((name) => [
      [name, 'every fact', fire] as const,
      [name, 'the fewest', sparse] as const,
    ])
  )('%s renders from %s with nothing missing', (name, _, variant) => {
    const text = documentText(
      renderDocument(read(name), {
        ...stageTwoData,
        ...questionsOf(name),
        fireSafetyTechnician:
          variant === sparse ? { ...technician, authorization: null } : technician,
        fire: variant,
        fireThemes: variant === sparse ? sparseThemes : fireThemes,
      })
    );
    expect(text).not.toContain('{{');
    expect(text).toContain('S.C. CLIENT DEMO S.R.L.');
  });

  it('numbers each decision as its place in the binder says', () => {
    const numbers = {
      'fire/1.1_fire_decision_organization.docx': '4 SU',
      'fire/1.2_fire_decision_training.docx': '5 SU',
      'fire/1.3_fire_decision_open_fire.docx': '6 SU',
      'fire/1.4_fire_decision_smoking.docx': '7 SU',
      'fire/1.5_fire_decision_technician.docx': '8 SU',
      'fire/1.6_fire_decision_instructions.docx': '9 SU',
      'fire/1.7_fire_decision_waste.docx': '10 SU',
      'fire/1.8_fire_decision_seasons.docx': '11 SU',
      'fire/1.9_fire_decision_control.docx': '12 SU',
    };
    for (const [name, number] of Object.entries(numbers)) {
      const text = documentText(renderDocument(read(name), stageTwoData));
      expect(text).toContain(`Nr. ${number} din 19.01.2026`);
      expect(text).toContain(`nr. ${number} din 19.01.2026.`);
    }
  });

  it('has decision 1 name the coordinator by the title, the administrator approve, and the managers by their count', () => {
    const decision = read('fire/1.1_fire_decision_organization.docx');
    const text = documentText(renderDocument(decision, stageTwoData));
    expect(text).toContain(
      'se numește coordonator privind apărarea împotriva incendiilor Ion VLAD, având funcția de șef magazin'
    );
    expect(text).toContain(
      'Pentru aprobarea actelor de autoritate emise în cadrul S.C. CLIENT DEMO S.R.L., se numește Maria POPESCU, având funcția de administrator în cadrul S.C. CLIENT DEMO S.R.L.;'
    );
    expect(text).toContain('se desemnează ca conducător al locului de muncă: Ion VLAD');
    expect(text).toContain('conform OMAI 163/2007 – art. 149–150, se desemnează:');
    expect(text).toContain('Legii 307/2006 – art. 19 alin. (1) lit. a) și ale OMAI 163/2007');
    expect(text).not.toContain('șef al locului de muncă');
    expect(text).not.toContain('decizie internă');
    expect(text).not.toMatch(/^Personalul aflat la program/m);
    expect(text).toMatch(/S\.R\.L\.\nPentru asigurarea funcționării/);
    expect(
      text.match(/reprezentant al S\.C\. SERVICIU EXTERN S\.R\.L\. \(după caz\)\.$/gm)
    ).toHaveLength(9);
    const many = documentText(
      renderDocument(decision, {
        ...stageTwoData,
        fire: { ...fire, manyWorkplaceManagers: true },
      })
    );
    expect(many).toContain('se desemnează ca conducători ai locurilor de muncă: Ion VLAD');
    const table = new PizZip(renderDocument(decision, stageTwoData))
      .file('word/document.xml')!
      .asText()
      .match(/<w:tbl>[\s\S]*?<\/w:tbl>/g)!
      .at(-1)!;
    expect(table.match(/<w:tr[ >]/g)).toHaveLength(4);
  });

  it('numbers the responsibilities under contracts as an item of decision 1 of its own', () => {
    const xml = new PizZip(read('fire/1.1_fire_decision_organization.docx'))
      .file('word/document.xml')!
      .asText();
    const numbering = (start: string) => {
      const paragraph = (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).find((each) =>
        documentTextOf(each).startsWith(start)
      )!;
      return /<w:ilvl w:val="(\d)"\/><w:numId w:val="(\d+)"\/>/.exec(paragraph)!.slice(1);
    };
    const contracts = numbering('Pentru stabilirea răspunderilor');
    expect(contracts[0]).toBe('0');
    expect(contracts).toEqual(numbering('Pentru analiza evenimentelor'));
  });

  it('prints the interval of a staff category in decision 2 only when it has posts', () => {
    const decision = 'fire/1.2_fire_decision_training.docx';
    const full = documentText(renderDocument(read(decision), stageTwoData));
    expect(full).toContain(
      'personalul administrativ (Manager magazin) va fi instruit o dată la 6 luni'
    );
    expect(full).toMatch(/^personalul administrativ .+ ale lunii;$/m);
    expect(full).toMatch(
      /^personalul de execuție \(Barman\) va fi instruit o dată la 3 luni, .+ ale lunii\.$/m
    );
    const sparseText = documentText(
      renderDocument(read(decision), { ...stageTwoData, fire: sparse })
    );
    expect(sparseText).not.toContain('personalul administrativ');
    expect(sparseText).toContain('personalul de execuție (Barman) va fi instruit o dată la 3 luni');
  });

  it('names who collects the waste and its contractor, or the workers on duty and the contracted firm', () => {
    const decision = 'fire/1.7_fire_decision_waste.docx';
    expect(documentText(renderDocument(read(decision), stageTwoData))).toContain(
      'De colectarea deșeurilor răspund muncitorii necalificați și șeful de șantier, iar de preluarea și neutralizarea lor, S.C. ECO S.R.L., firmă autorizată în acest domeniu.'
    );
    expect(documentText(renderDocument(read(decision), stageTwoData))).toMatch(
      /^deșeuri de carton\.$/m
    );
    expect(
      documentText(renderDocument(read(decision), { ...stageTwoData, fire: sparse }))
    ).toContain(
      'De colectarea deșeurilor răspund lucrătorii aflați la program din cadrul unității, iar de preluarea și neutralizarea lor, firma contractată, autorizată în acest domeniu.'
    );
  });

  it('prints the exterior-hydrant accessories only for a client with exterior hydrants', () => {
    const list = 'fire/5.1_fire_means_list.docx';
    const accessories = 'Lista dotării cu accesorii pentru trecerea apei';
    expect(documentText(renderDocument(read(list), stageTwoData))).toContain(accessories);
    expect(
      documentText(renderDocument(read(list), { ...stageTwoData, fire: sparse }))
    ).not.toContain(accessories);
  });

  it('prints a dash for the area and the norm of a mobile site, and its activity as its sector', () => {
    const site = {
      ...fire,
      workplaces: [
        {
          ...workplace,
          name: 'Șantier Dumbrăvița',
          activity: 'Lucrări de construcții',
          activityRunOn: 'lucrări de construcții',
          areaLabel: '—',
          normLabel: '—',
        },
      ],
    };
    const list = documentText(
      renderDocument(read('fire/5.1_fire_means_list.docx'), { ...stageTwoData, fire: site })
    );
    expect(list).toContain('Șantier Dumbrăvița (lucrări de construcții)');
    expect(list).toContain('Aria utilă\n—\nNorma de dotare (OMAI 163/2007, anexa 6)\n—\n');
    expect(list).toContain('Total stingătoare\nbuc.\n3');
    for (const file of ['5.2_fire_workplace_organization', '1.8_fire_decision_seasons']) {
      expect(
        documentText(renderDocument(read(`fire/${file}.docx`), { ...stageTwoData, fire: site }))
      ).toContain('Șantier Dumbrăvița (lucrări de construcții)');
    }
  });

  it('prints the smoking rule of decision 4 and of the posted sheet', () => {
    const decision = 'fire/1.4_fire_decision_smoking.docx';
    const sheet = 'fire/5.2_fire_workplace_organization.docx';
    const placeless = { ...fire, smoking: { ...fire.smoking, place: null } };
    const allowed = documentText(renderDocument(read(decision), stageTwoData));
    expect(allowed).toContain(
      'Fumatul este permis numai în locurile special amenajate în exteriorul clădirilor, în curtea interioară, marcate'
    );
    expect(allowed).toContain('40\u00a0m față de locurile în care există pericol de explozie');
    expect(allowed).toContain(
      '„LOC PENTRU FUMAT” (OMAI 163/2007 – art. 106 alin. (5)). Locurile pentru fumat sunt prevăzute cu scrumiere'
    );
    expect(allowed).not.toContain('atât în interiorul, cât și în exteriorul clădirilor');
    expect(
      documentText(renderDocument(read(decision), { ...stageTwoData, fire: placeless }))
    ).toContain(
      'Fumatul este permis numai în locurile special amenajate în exteriorul clădirilor, marcate'
    );
    const forbidden = documentText(
      renderDocument(read(decision), { ...stageTwoData, fire: sparse })
    );
    expect(forbidden).toContain(
      'Fumatul este interzis în toate spațiile și pe întreaga incintă a S.C. CLIENT DEMO S.R.L., atât în interiorul, cât și în exteriorul clădirilor.'
    );
    expect(forbidden).not.toContain('LOC PENTRU FUMAT');
    expect(documentText(renderDocument(read(sheet), stageTwoData))).toContain(
      '– fumatul este permis numai în exteriorul clădirilor, în locurile amenajate și marcate „LOC PENTRU FUMAT” (în curtea interioară), conform Deciziei nr. 7 SU;'
    );
    expect(documentText(renderDocument(read(sheet), { ...stageTwoData, fire: sparse }))).toContain(
      '– fumatul este interzis în toate spațiile și pe întreaga incintă a unității, conform Deciziei nr. 7 SU;'
    );
  });

  it('appoints the technician with the certificate, and the authorization only when it is set', () => {
    const decision = 'fire/1.5_fire_decision_technician.docx';
    const text = documentText(renderDocument(read(decision), stageTwoData));
    expect(text).toContain(
      'de Dan MARIN, cadru tehnic cu atribuții în domeniul apărării împotriva incendiilor, titular al certificatului seria A nr. 1234/2024'
    );
    expect(text).toContain(
      'prin autorizația nr. 12 din 15.09.2026, ISU Timiș, pentru îndeplinirea atribuțiilor'
    );
    expect(text).toContain('(Preluare din Legea 307/2006 – art. 27 alin. (1))');
    for (const letter of 'abcdefghijklm')
      expect(text).toMatch(new RegExp(`^${letter}\\) \\S`, 'm'));
    const unauthorized = documentText(
      renderDocument(read(decision), {
        ...stageTwoData,
        fireSafetyTechnician: { ...technician, authorization: null },
      })
    );
    expect(unauthorized).not.toContain('autorizația');
    expect(unauthorized).not.toContain('Art. 12²');
  });

  it('weighs the gas extinguishers in decision 9 only for a client that has some', () => {
    const decision = 'fire/1.9_fire_decision_control.docx';
    const weighing = 'Stingătoarele cu CO₂ sau agent curat, prin cântărire';
    const text = documentText(renderDocument(read(decision), stageTwoData));
    expect(text).toContain(weighing);
    expect(text).toContain('verificarea prin cântărire a stingătoarelor cu CO₂ sau agent curat');
    const without = documentText(renderDocument(read(decision), { ...stageTwoData, fire: sparse }));
    expect(without).not.toContain(weighing);
    expect(without).not.toContain('cântărire');
    for (const month of ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'])
      expect(without).toMatch(new RegExp(`^${month}$`, 'm'));
  });

  it('controls the firms working on the premises in decision 9 only for a client that has some, its letters running on', () => {
    const decision = 'fire/1.9_fire_decision_control.docx';
    const item =
      'b) coordonatorul privind apărarea împotriva incendiilor și cadrul tehnic – trimestrial, în lunile martie, iunie, septembrie și decembrie, la persoanele juridice care desfășoară activități în spațiile S.C. CLIENT DEMO S.R.L.;';
    const row =
      /^Coordonatorul privind apărarea împotriva incendiilor și cadrul tehnic\nTRIMESTRIAL\nLa persoanele juridice care desfășoară activități în perimetru\n–\n–\nX\n–\n–\nX\n–\n–\nX\n–\n–\nX$/m;
    const letters = (text: string) =>
      text
        .slice(
          text.indexOf('Periodicitatea planificării controalelor:'),
          text.indexOf('Controlul efectuat se finalizează')
        )
        .match(/^[a-z]\) /gm);
    const text = documentText(renderDocument(read(decision), stageTwoData));
    expect(text).toContain(item);
    expect(text).toMatch(row);
    expect(text).toMatch(
      /^c\) coordonatorul privind apărarea împotriva incendiilor, cu cadrul tehnic/m
    );
    expect(text).toMatch(/^f\) Maria POPESCU, în calitate de administrator/m);
    expect(letters(text)).toEqual(['a) ', 'b) ', 'c) ', 'd) ', 'e) ', 'f) ']);
    const without = documentText(renderDocument(read(decision), { ...stageTwoData, fire: sparse }));
    expect(without).not.toContain('persoanele juridice');
    expect(without).toMatch(
      /^b\) coordonatorul privind apărarea împotriva incendiilor, cu cadrul tehnic/m
    );
    expect(without).toMatch(/^e\) Maria POPESCU, în calitate de administrator/m);
    expect(letters(without)).toEqual(['a) ', 'b) ', 'c) ', 'd) ', 'e) ']);
  });

  it('posts the instructions of every workplace on pages of their own, its means said alike twice', () => {
    const decision = 'fire/1.6_fire_decision_instructions.docx';
    const merged = renderDocument(read(decision), stageTwoData);
    const xml = new PizZip(merged).file('word/document.xml')!.asText();
    expect(xml.match(/<w:br w:type="page"\/>/g)).toHaveLength(2);
    const text = documentText(merged);
    expect(text.match(/^INSTRUCȚIUNI DE APĂRARE ÎMPOTRIVA INCENDIILOR$/gm)).toHaveLength(2);
    expect(text).toContain('ANEXA\nla Decizia nr. 9 SU din 19.01.2026');
    expect(text).toMatch(
      /^Locul de muncă: Depozit \(gelaterie\)\nAdresa: Timișoara, județul Timiș, Str. Lungă 5$/m
    );
    expect(text).toContain('Stingător tip P50 – Pulbere, 50 kg, carosabil: 1 buc.;');
    expect(text).toMatch(/^P50\nPulbere\n50 kg, carosabil\n1$/m);
    expect(text).toMatch(/^Total\n3$/m);
    expect(text).toContain(
      'personalul de execuție la 3 luni, respectiv în lunile februarie, mai, august și noiembrie, conform Deciziei nr. 5 SU;'
    );
    expect(text).toContain('redate în Decizia nr. 8 SU.');
    expect(text).toContain('(Preluare din Legea 307/2006 – art. 19 alin. (1))');
    expect(text).toMatch(/^r¹⁶\)/m);
    expect(text).toContain(
      'Fumatul este permis numai în locurile amenajate în exteriorul clădirilor (în curtea interioară)'
    );
    expect(text.match(/^Conduita salvatorului cuprinde, în această ordine:$/gm)).toHaveLength(2);
    expect(text).not.toContain('50-60');
    const sparseText = documentText(
      renderDocument(read(decision), { ...stageTwoData, fire: sparse })
    );
    expect(sparseText).toContain(
      'Fumatul este interzis în toate spațiile și pe întreaga incintă a S.C. CLIENT DEMO S.R.L., conform Deciziei nr. 7 SU.'
    );
    expect(sparseText).not.toContain('LOC PENTRU FUMAT');
    expect(sparseText).not.toContain('Măsuri specifice locului de muncă');
  });

  it('says in one line that no activity takes place at the registered office, with its address', () => {
    const list = read('fire/5.1_fire_means_list.docx');
    const line =
      'La sediul social, Cluj-Napoca, județul Cluj, Str. Florilor 3, nu se desfășoară activitate.';
    const text = documentText(
      renderDocument(list, {
        ...stageTwoData,
        officeWithoutActivity: { address: 'Cluj-Napoca, județul Cluj, Str. Florilor 3' },
      })
    );
    expect(text).toMatch(new RegExp(`^${line}$`, 'm'));
    expect(text.indexOf(line)).toBeLessThan(text.indexOf('NUMĂR ORIENTATIV DE STINGĂTOARE'));
    expect(text.indexOf(line)).toBeGreaterThan(text.lastIndexOf('Total stingătoare'));
    const without = documentText(renderDocument(list, stageTwoData));
    expect(without).not.toContain('nu se desfășoară activitate');
    expect(without).not.toMatch(/\n\n\n/);
  });

  it('shows where the means of a workplace stand only where some unit says it', () => {
    for (const [file, lead, row] of [
      [
        'fire/5.1_fire_means_list.docx',
        'Amplasarea mijloacelor de primă intervenție:',
        /^Laborator\nStingător P6 – Pulbere, 6\u00a0kg\nbuc\.\n2$/m,
      ],
      [
        'fire/1.6_fire_decision_instructions.docx',
        'Mijloacele de primă intervenție sunt amplasate astfel:',
        /^1\.\nLaborator\nStingător P6 – Pulbere, 6\u00a0kg\n2$/m,
      ],
    ] as const) {
      const text = documentText(renderDocument(read(file), stageTwoData));
      expect(text.split(lead)).toHaveLength(3);
      expect(text).toMatch(row);
      expect(text).toMatch(/^—\nStingător P50 – Pulbere, 50\u00a0kg, carosabil\n(buc\.\n)?1$/m);
      const without = documentText(renderDocument(read(file), { ...stageTwoData, fire: sparse }));
      expect(without).not.toContain(lead);
    }
  });

  it('lists every extinguisher in its register, then the blank rows', () => {
    const register = renderDocument(read('fire/6.4_fire_extinguisher_register.docx'), data);
    const text = documentText(register);
    expect(text).toMatch(/^P6 – Pulbere, 6\u00a0kg, nr\. inventar 0012\nMagazin – Laborator$/m);
    expect(text).toMatch(/^G5 – Dioxid de carbon \(CO₂\), 5\u00a0kg\nDepozit$/m);
    const grid = new PizZip(register)
      .file('word/document.xml')!
      .asText()
      .match(/<w:tbl>[\s\S]*?<\/w:tbl>/g)!
      .at(-1)!;
    expect(grid.match(/<w:tr[ >]/g)).toHaveLength(2 + 2 + 7);
    expect(grid.match(/<w:tblHeader w:val="true"\/>/g)).toHaveLength(2);
  });

  it('gives every installation a sheet and a table of events of its own, the note once', () => {
    const register = renderDocument(read('fire/6.3_fire_installation_register.docx'), data);
    const text = documentText(register);
    expect(text.match(/^REGISTRU DE CONTROL$/gm)).toHaveLength(2);
    expect(text.match(/^Date evenimente$/gm)).toHaveLength(2);
    expect(text.match(/^Notă$/gm)).toHaveLength(1);
    expect(text).toMatch(/^Nr\. crt\. \(fișă\)\n2$/m);
    expect(text).toMatch(/^Denumirea instalației\nHidranți interiori – Unul pe nivel$/m);
    expect(text).toMatch(
      /^Caracteristici principale \(loc amplasare, zone protejate, componente etc\.\)\nMagazin$/m
    );
    expect(text).toMatch(
      /^Persoana fizică\/juridică ce execută verificarea, întreținerea, repararea\nS\.C\. HIDRANȚI DEMO S\.R\.L\.$/m
    );
    const xml = new PizZip(register).file('word/document.xml')!.asText();
    expect(xml.match(/<w:br w:type="page"\/>/g)).toHaveLength(3);
  });

  it('cites decision 9 for the internal controls only while the set holds it', () => {
    const decision = read('fire/1.6_fire_decision_instructions.docx');
    expect(documentText(renderDocument(decision, stageTwoData))).toContain(
      'a) executarea controalelor interne conform planificării, Decizia nr. 12 SU;'
    );
    const without = documentText(
      renderDocument(decision, { ...stageTwoData, controlDecision: false })
    );
    expect(without).toContain('a) executarea controalelor interne;');
    expect(without).not.toContain('12 SU');
  });

  // The engine repeats a list's paragraphs under one numbering: a counted list would count on
  // from one workplace to the next.
  it('counts no list in the posted instructions, which repeat per workplace', () => {
    const zip = new PizZip(read('fire/1.6_fire_decision_instructions.docx'));
    const xml = zip.file('word/document.xml')!.asText();
    const numbering = zip.file('word/numbering.xml')!.asText();
    const firstLevelFormat = (numId: string) => {
      const num = new RegExp(`<w:num w:numId="${numId}"[^>]*>[\\s\\S]*?</w:num>`).exec(
        numbering
      )![0];
      const override = /<w:lvlOverride w:ilvl="0">[\s\S]*?<w:numFmt w:val="(\w+)"/.exec(num)?.[1];
      if (override) return override;
      const abstractId = /<w:abstractNumId w:val="(\d+)"/.exec(num)![1];
      const abstract = new RegExp(
        `<w:abstractNum [^>]*w:abstractNumId="${abstractId}"[\\s\\S]*?</w:abstractNum>`
      ).exec(numbering)![0];
      return /<w:lvl w:ilvl="0"[\s\S]*?<w:numFmt w:val="(\w+)"/.exec(abstract)![1];
    };
    const posted = xml.slice(xml.indexOf('INSTRUCȚIUNI DE APĂRARE ÎMPOTRIVA INCENDIILOR'));
    const numIds = new Set(
      [...posted.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((match) => match[1]!)
    );
    numIds.delete('0');
    expect(numIds.size).toBeGreaterThan(0);
    expect([...numIds].map(firstLevelFormat).filter((format) => format !== 'bullet')).toEqual([]);
  });

  it('lists each dangerous substance in a table with every field, the empty ones to fill in', () => {
    const list = documentText(
      renderDocument(read('fire/5.3_fire_substances_list.docx'), stageTwoData)
    );
    expect(list).toContain('LISTA SUBSTANȚELOR PERICULOASE');
    expect(list).toContain(
      'Lista substanțelor periculoase utilizate în cadrul S.C. CLIENT DEMO S.R.L., întocmită în baza prevederilor Legii 307/2006 – art. 19 alin. (1) lit. f) și ale OMAI 163/2007 – art. 18 lit. p) și art. 20 alin. (3) lit. g).'
    );
    expect(list).toContain('Substanța 1: Propan');
    expect(list).toContain('Substanța 2: Diluant');
    expect(list).not.toContain('Câmp');
    expect(list).toContain('Proprietăți fizico-chimice(secțiunea 9 a fișei cu date de securitate)');
    expect(list).toContain('Flam. Gas 1, H220; Press. Gas, H280');
    expect(list).toContain('Cușca metalică din curte');
    expect(list.match(/DE COMPLETAT/g)).toHaveLength(5);
    expect(list).not.toContain('nu utilizează substanțe periculoase');
    expect(list).toContain('Data: 19.01.2026');
    expect(list).toContain('Cadru tehnic PSI al S.C. SERVICIU EXTERN S.R.L.');
    expect(list).toContain('Administrator al S.C. CLIENT DEMO S.R.L.');
  });

  it('declares in one paragraph that a client uses no dangerous substances, with no table', () => {
    const declared = renderDocument(read('fire/5.3_fire_substances_list.docx'), {
      ...stageTwoData,
      fire: sparse,
    });
    const text = documentText(declared);
    expect(text).toContain(
      'S.C. CLIENT DEMO S.R.L. declară că în activitatea sa nu utilizează substanțe periculoase.'
    );
    expect(text).not.toContain('Substanța 1');
    expect(text).not.toContain('DE COMPLETAT');
    expect(text).toContain('Maria POPESCU');
    expect(
      new PizZip(declared)
        .file('word/document.xml')!
        .asText()
        .match(/<w:tbl>/g)
    ).toHaveLength(1);
  });

  it("follows the site sheet row by row, a gap printing the mark and the model's instruction", () => {
    const file = read('fire/7.1_fire_site_sheet.docx');
    const text = documentText(renderDocument(file, stageTwoData));
    expect(text).toContain('FIȘA OBIECTIVULUI\n(OPERATORUL ECONOMIC/INSTITUȚIA)');
    expect(text).toContain(
      'Fișa obiectivului S.C. CLIENT DEMO S.R.L., întocmită în baza prevederilor OMAI 163/2007 – art. 18 lit. b) și art. 19, după modelul în vigoare al fișei obiectivului.'
    );
    expect(text).toContain('Denumirea operatorului economic/instituției\nS.C. CLIENT DEMO S.R.L.');
    expect(text).toContain(
      'Administrator/Conducător – telefon domiciliu\nDE COMPLETAT(telefonul de domiciliu)'
    );
    expect(text).toContain('– Magazin: Timișoara, Str. Lungă 5– Depozit: Timișoara, Str. Scurtă 2');
    expect(text).toContain(
      '1. Date generale privind apărarea împotriva incendiilor și protecția civilă\n1.1. Aspecte generale'
    );
    expect(text).toContain('Clădirea 2 (Depozit): DE COMPLETAT');
    expect(text).toContain(
      '1.2.1. Clădirea 1: Magazin, Timișoara, Str. Lungă 5\nDate constructive'
    );
    expect(text).toContain(
      'Date tehnice\nHidranți interiori/coloane uscate\nexistă: Unul pe nivel'
    );
    expect(text).toContain(
      '1.2.2. Clădirea 2: Depozit\nDate constructive\nStabilitatea la foc\nDE COMPLETAT'
    );
    expect(text).toContain('Substanța 1: Propan');
    expect(text).toContain('Mod de operare\nDE COMPLETAT(modul de manipulare și de utilizare)');
    expect(text).toContain(
      '3. Organizarea apărării împotriva incendiilor/activității de protecție civilă'
    );
    expect(text).toContain('Serviciu privat pentru situații de urgență\nnu există; nu este cazul');
    expect(text).not.toContain('nu utilizează substanțe periculoase');
    expect(text).not.toContain('Operatorul nu are clădiri proprii');
    expect(text).toContain('Data: 19.01.2026');
    expect(text).toContain('Cadru tehnic PSI al S.C. SERVICIU EXTERN S.R.L.');
    expect(text).toContain(
      'Administrator/Conducător\nMaria POPESCU\nAdministrator al S.C. CLIENT DEMO S.R.L.'
    );
    const xml = new PizZip(renderDocument(file, stageTwoData)).file('word/document.xml')!.asText();
    expect(xml.match(/<w:tbl>/g)).toHaveLength(7);

    const sparseText = documentText(
      renderDocument(file, { ...stageTwoData, fire: { ...fire, siteSheet: sparse.siteSheet } })
    );
    expect(sparseText).toContain(
      'Operatorul nu are clădiri proprii: activitatea se desfășoară numai în puncte de lucru temporare sau mobile, enumerate mai sus.'
    );
    expect(sparseText).toContain(
      'S.C. CLIENT DEMO S.R.L. declară că în activitatea sa nu utilizează substanțe periculoase.'
    );
    expect(sparseText).not.toContain('Date constructive');
    expect(sparseText).not.toContain('Substanța 1');
  });

  it('reports on the year from what the app holds, each section of art. 152 left to fill in', () => {
    const file = read('fire/7.2_fire_annual_report.docx');
    const text = documentText(renderDocument(file, stageTwoData));
    expect(text).toContain(
      'RAPORTUL ANUAL DE EVALUARE A CAPACITĂȚII DE APĂRARE ÎMPOTRIVA INCENDIILOR\npe anul 2026'
    );
    expect(text).toContain(
      'Raport întocmit pentru S.C. CLIENT DEMO S.R.L. în baza prevederilor OMAI 163/2007 – art. 18 lit. c), art. 151 și art. 152 și ale Legii 307/2006 – art. 27 alin. (1) lit. j)'
    );
    expect(text).toContain(
      '– Decizia privind organizarea apărării împotriva incendiilor, nr.\u00a04\u00a0SU din 19.01.2026;'
    );
    expect(text).toContain(
      '– Decizia privind instruirea în domeniul situațiilor de urgență, nr.\u00a05\u00a0SU din 19.01.2026.'
    );
    expect(text).toContain(
      'Cadrul tehnic PSI\nDan MARIN, certificat seria A nr. 1234/2024, reprezentant al S.C. SERVICIU EXTERN S.R.L.'
    );
    expect(text).toContain('2.1. Magazin, Timișoara, Str. Lungă 5');
    expect(text).toContain('2.2. Depozit, Timișoara, Str. Scurtă 2');
    expect(text).toContain('Hidranți interiori\n1 instalație\n12.03.2027');
    expect(text).toContain('Personal administrativ\nContabil\nla 6 luni\nfebruarie, august');
    expect(text).toContain('Controalele planificate prin decizia privind controlul propriu:');
    expect(text).toContain(
      'Incendii și alte evenimente produse în anul 2026\nDE COMPLETAT(data, locul, cauza și urmările'
    );
    expect(text).toContain('Fișa obiectivului\nnegenerat');
    expect(text).toContain('Documente neîntocmite încă: 1.');
    expect(text).toContain('7. Concluzii și măsuri propuse pentru anul 2027');
    expect(text).toContain('Data: 19.01.2026');
    expect(text).toContain('Aprobat\nMaria POPESCU\nAdministrator al S.C. CLIENT DEMO S.R.L.');
    expect(text).not.toContain('Documentația nu cuprinde o decizie privind controlul propriu');
    expect(text).toContain(
      'Modificări în organizare și implementarea noilor prevederi legale\nDeciziile emise în anul 2026:\n– Decizia privind organizarea apărării împotriva incendiilor, nr.\u00a04\u00a0SU din 19.01.2026;\n– Decizia privind instruirea în domeniul situațiilor de urgență, nr.\u00a05\u00a0SU din 02.06.2026, revizia 2.\nDE COMPLETAT(noile prevederi legale aplicate și stadiul îndeplinirii măsurilor stabilite la analiza anterioară)'
    );
    expect(text).toContain(
      'Instruirile efectuate și rezultatele testării\nPotrivit evidenței instruirilor, în anul 2026 s-a efectuat: 1 instructaj periodic, în luna februarie, la care au participat 2 angajați.\nÎn același an, potrivit rezultatelor consemnate, testul anual a fost promovat de 2 angajați.\n4. Controlul propriu'
    );
    expect(text.split('DE COMPLETAT')).toHaveLength(11);

    const sparseText = documentText(
      renderDocument(file, {
        ...stageTwoData,
        fire: { ...fire, annualReport: sparse.annualReport },
      })
    );
    expect(sparseText).toContain(
      'Documentația nu cuprinde o decizie privind controlul propriu; controlul se face de persoanele desemnate prin decizia privind organizarea apărării împotriva incendiilor.'
    );
    expect(sparseText).toContain('Toate documentele cerute operatorului sunt întocmite.');
    expect(sparseText).toContain(
      'Modificări în organizare și implementarea noilor prevederi legale\nDE COMPLETAT(deciziile emise sau modificate în cursul anului, noile prevederi legale aplicate și stadiul îndeplinirii măsurilor stabilite la analiza anterioară)'
    );
    expect(sparseText).toContain(
      'Instruirile efectuate și rezultatele testării\nDE COMPLETAT(instructajele introductive generale, specifice locului de muncă și periodice efectuate, numărul participanților și rezultatele testării)'
    );
    expect(sparseText).not.toContain('Potrivit evidenței instruirilor');
    expect(sparseText.split('DE COMPLETAT')).toHaveLength(12);
    expect(sparseText).not.toContain('Controalele planificate');
  });

  it('schedules the checks of each workplace in one table, or says there is nothing to schedule', () => {
    const rendered = renderDocument(read('fire/5.4_fire_maintenance_schedules.docx'), stageTwoData);
    const text = documentText(rendered);
    expect(text).toContain('GRAFICELE DE ÎNTREȚINERE ȘI VERIFICARE');
    expect(text).toContain(
      'Graficele de întreținere și verificare a mijloacelor tehnice de apărare împotriva incendiilor din dotarea S.C. CLIENT DEMO S.R.L., întocmite în baza prevederilor OMAI 163/2007 – art. 18 lit. q) și ale OMAI 135/2023 – art. 8, art. 9 și art. 12'
    );
    expect(text).toContain('Magazin (gelaterie)');
    expect(text).toContain('Ce se verifică\nPeriodicitatea\nCine efectuează\nTemei / observații');
    expect(text).toContain('la cel mult 6 luni, în iunie și decembrie');
    expect(text).toContain(
      'Instalația de utilizare a gazelor naturale\nanual\nOperatorul de distribuție\n—'
    );
    expect(text).toContain('Depozit (depozitare)');
    expect(text).toContain(
      'La acest loc de muncă nu există mijloace sau instalații de apărare împotriva incendiilor care să necesite întreținere ori verificare periodică.'
    );
    expect(text).toContain('Data: 19.01.2026');
    expect(text).toContain('Cadru tehnic PSI al S.C. SERVICIU EXTERN S.R.L.');
    expect(text).toContain('Administrator al S.C. CLIENT DEMO S.R.L.');
    const xml = new PizZip(rendered).file('word/document.xml')!.asText();
    expect(xml.match(/<w:tbl>/g)).toHaveLength(2);
    expect(xml.match(/<w:tblHeader w:val="true"\/>/g)).toHaveLength(1);
  });

  it('gives every workplace a page of its own on the posted sheet', () => {
    const sheet = renderDocument(read('fire/5.2_fire_workplace_organization.docx'), stageTwoData);
    const xml = new PizZip(sheet).file('word/document.xml')!.asText();
    expect(xml.match(/<w:br w:type="page"\/>/g)).toHaveLength(1);
    expect(documentText(sheet).match(/ORGANIZAREA APĂRĂRII ÎMPOTRIVA INCENDIILOR/g)).toHaveLength(
      2
    );
  });

  it('puts the alarm installations under alarm and the extinguishing ones under limiting and extinguishing', () => {
    const sheet = 'fire/5.2_fire_workplace_organization.docx';
    const equipped = {
      ...fire,
      workplaces: [
        {
          ...workplace,
          alarmInstallations: [
            {
              kindLabel: 'Instalație de detectare și alarmare la incendiu',
              description: 'Centrală',
            },
          ],
          hasEmergencyLighting: true,
        },
      ],
    };
    const text = documentText(renderDocument(read(sheet), { ...stageTwoData, fire: equipped }));
    expect(text).toContain(
      '1. Mijloace de alarmare/alertare\nTelefon 112 – serviciul profesionist pentru situații de urgență\nInstalație de detectare și alarmare la incendiu – Centrală\nConducătorul locului de muncă: Ion VLAD, șef magazin'
    );
    expect(text).toContain(
      '2. Instalații și dispozitive de limitare și stingere a incendiilor\nHidranți interiori – Unul pe nivel\n3.'
    );
    expect(text).toContain(
      'Loc de adunare: Parcarea din spate\nCăile de evacuare au iluminat de siguranță.'
    );
    const bare = documentText(renderDocument(read(sheet), { ...stageTwoData, fire: sparse }));
    expect(bare).toContain(
      '2. Instalații și dispozitive de limitare și stingere a incendiilor\nNu este cazul\n3.'
    );
    expect(bare).not.toContain('iluminat de siguranță');
  });

  it('marks an unset specific measure with a dash on the posted sheet', () => {
    const sheet = 'fire/5.2_fire_workplace_organization.docx';
    expect(documentText(renderDocument(read(sheet), stageTwoData))).toMatch(
      /^5\. Măsuri specifice\nVitrinele se opresc noaptea\.$/m
    );
    expect(documentText(renderDocument(read(sheet), { ...stageTwoData, fire: sparse }))).toMatch(
      /^5\. Măsuri specifice\n—$/m
    );
  });

  it.each(fireFiles)('%s keeps no author, company or title of the original', (name) => {
    const zip = new PizZip(read(name));
    const core = zip.file('docProps/core.xml')?.asText() ?? '';
    for (const tag of ['dc:creator', 'cp:lastModifiedBy', 'dc:title']) {
      expect(new RegExp(`<${tag}>[^<]+</${tag}>`).test(core), tag).toBe(false);
    }
    expect(zip.file('docProps/app.xml')?.asText() ?? '').not.toMatch(/<(Company|Manager)>[^<]/);
  });

  it.each([
    'fire/6.0_fire_cover_registers.docx',
    'fire/1.0_fire_cover_decisions.docx',
    'fire/2.0_fire_cover_own_instructions.docx',
    'fire/3.0_fire_cover_training_themes.docx',
    'fire/4.0_fire_cover_tests.docx',
  ])('%s has the technician sign for the provider', (name) => {
    const text = documentText(renderDocument(read(name), data));
    expect(text).toContain('Dan MARIN\nCadru tehnic PSI al S.C. SERVICIU EXTERN S.R.L.');
    expect(text).toContain('Maria POPESCU\nAdministrator al S.C. CLIENT DEMO S.R.L.');
  });

  it('names the own instructions themselves in the line above their cover title', () => {
    const text = documentText(
      renderDocument(read('fire/2.0_fire_cover_own_instructions.docx'), data)
    );
    expect(text).toContain(
      'Prezentele instrucțiuni proprii în domeniul situațiilor de urgență sunt obligatorii și se aplică la toate locurile de muncă.\nINSTRUCȚIUNI PROPRII ÎN DOMENIUL SITUAȚIILOR DE URGENȚĂ'
    );
  });

  it('lists the decisions the set holds on their cover, the two required from ten employees last', () => {
    const cover = (seasonsDecision: boolean, controlDecision: boolean) =>
      documentText(
        renderDocument(read('fire/1.0_fire_cover_decisions.docx'), {
          ...data,
          seasonsDecision,
          controlDecision,
        })
      ).match(/^\d\. .*$/gm);
    const nine = cover(true, true)!;
    expect(nine.map((item) => item.slice(0, 2))).toEqual([
      '1.',
      '2.',
      '3.',
      '4.',
      '5.',
      '6.',
      '7.',
      '8.',
      '9.',
    ]);
    expect(nine[4]).toMatch(/^5\. Modul de îndeplinire a atribuțiilor de cadru tehnic/);
    expect(nine[7]).toMatch(/^8\. Modul de reglementare a lucrărilor în timpul sezonului rece/);
    expect(nine[8]).toMatch(/^9\. Controlul propriu/);
    expect(nine.every((item) => item.endsWith('.'))).toBe(true);
    expect(cover(false, false)).toEqual(nine.slice(0, 7));
    expect(cover(false, true)).toEqual([...nine.slice(0, 7), nine[8]!.replace(/^9\./, '8.')]);
  });

  it('lists the installation register on the cover of the registers only while the set holds it', () => {
    const cover = (installationRegister: boolean) =>
      documentText(
        renderDocument(read('fire/6.0_fire_cover_registers.docx'), {
          ...data,
          installationRegister,
        })
      ).match(/^\d\. .*$/gm);
    expect(cover(true)).toHaveLength(6);
    expect(cover(true)![4]).toMatch(/^5\. Registru de control pentru instalațiile/);
    expect(cover(false)).toEqual([
      ...cover(true)!.slice(0, 4),
      '5. Registru de evidență a controlului stingătoarelor de incendiu.',
    ]);
  });

  it('lists the fire-safety modules its positions apply as annexes, in the contents and in chapter XXIV', () => {
    const own = read('fire/2.1_fire_own_instructions.docx');
    const text = documentText(renderDocument(own, stageTwoData));
    const chapter = text.slice(
      text.lastIndexOf('Capitolul XXIV.'),
      text.lastIndexOf('BIBLIOGRAFIE')
    );
    expect(chapter.split('\n').filter(Boolean)).toEqual([
      'Capitolul XXIV. Instrucțiuni proprii în domeniul situațiilor de urgență specifice activităților și echipamentelor de muncă din cadrul S.C. CLIENT DEMO S.R.L.',
      'Instrucțiunile specifice posturilor de lucru, întocmite pe activități și echipamente de muncă, sunt anexate prezentelor instrucțiuni proprii și fac parte din ele. Fiecare post de lucru le aplică pe cele care îl privesc.',
      'Anexa 1. I.P.S.U. Lucrul cu foc deschis (versiunea din 11.10.2026)',
      'Anexa 2. I.P.S.U. Depozitarea buteliilor (versiunea din 02.10.2026)',
    ]);
    expect(text).toMatch(
      /^Capitolul XXIII\. Dispoziții finale\nCapitolul XXIV\. Instrucțiuni proprii .*S\.C\. CLIENT DEMO S\.R\.L\.\nBIBLIOGRAFIE\nAnexa 1\. I\.P\.S\.U\. Lucrul cu foc deschis\nAnexa 2\. I\.P\.S\.U\. Depozitarea buteliilor$/m
    );

    const none = documentText(
      renderDocument(own, { ...stageTwoData, annexes: [], noAnnexes: true })
    );
    expect(
      none
        .slice(none.lastIndexOf('Capitolul XXIV.'), none.lastIndexOf('BIBLIOGRAFIE'))
        .split('\n')
        .filter(Boolean)
        .slice(1)
    ).toEqual([
      'Niciun post de lucru nu necesită instrucțiuni specifice dincolo de prevederile comune de mai sus.',
    ]);
    expect(none).not.toMatch(/^Anexa \d/m);
  });

  it('keeps the general chapters of the own instructions, its contents without page numbers', () => {
    const text = documentText(
      renderDocument(read('fire/2.1_fire_own_instructions.docx'), stageTwoData)
    );
    // Each chapter twice: its row in the contents, then its title.
    expect(text.match(/^Capitolul [IVX]+\. /gm)).toHaveLength(48);
    expect(text.match(/^Capitolul XXII\. Stingătoarele de incendiu$/gm)).toHaveLength(2);
    expect(text).toContain('(Preluare din OMAI 135/2023 – Anexa 1)');
    expect(text).toContain('(Preluare din OMAI 712/2005 – art. 21) Instructajul periodic');
    expect(text).toContain('pe o durată de cel puțin două ore');
    expect(text).toContain(
      'testul de verificare a cunoștințelor privind situațiile de urgență la angajare'
    );
    expect(text).toContain(
      'testul anual de verificare a cunoștințelor privind situațiile de urgență'
    );
    expect(text).toContain('lucrările prevăzute la art. 36 din OMAI 712/2005');
    expect(text).toContain('prevăzut la art. 101 din OMAI 163/2007');
    expect(text).toContain(
      'Prezentele instrucțiuni proprii în domeniul situațiilor de urgență sunt obligatorii și se aplică la toate locurile de muncă'
    );
    for (const gone of [
      'compartimentelor de muncă',
      'riscuri de accidentare',
      'formației de intervenție',
      'oțetul și sifonul',
      'copiii în firide',
      'buc./300 mp',
      '60 minute',
      'TLMSU',
      'cazărmi',
      '0-ZERO',
      '50-60',
      'haloni',
      'Tehnici de securitate la incendiu',
      'spumă chimică',
      'funcționează prin răsturnare',
      'tip S',
    ]) {
      expect(text).not.toContain(gone);
    }
  });

  it('gives every staff category with posts a block of the workplace and the periodic training', () => {
    const themes = 'fire/3.1_fire_training_themes.docx';
    const text = documentText(renderDocument(read(themes), stageTwoData));
    expect(text.match(/^FUNCȚIA: Personal administrativ \(Manager magazin\)$/gm)).toHaveLength(2);
    expect(text).toContain(
      'CINE EFECTUEAZĂ INSTRUIREA: Ion VLAD – conducătorul locului de muncă\n'
    );
    expect(text).toContain(
      'CINE EFECTUEAZĂ INSTRUIREA: Ion VLAD – conducătorul locului de muncă sau, după caz, S.C. SERVICIU EXTERN S.R.L. – Dan MARIN (cadru tehnic PSI)'
    );
    expect(text).toContain('Decizia nr. 9 SU');
    expect(text).toMatch(/^NOIEMBRIE\nIPSU Art. 236 – 257; Afișate; Testare.\n120 min$/m);
    const sparseText = documentText(
      renderDocument(read(themes), { ...stageTwoData, fire: sparse, fireThemes: sparseThemes })
    );
    expect(sparseText).not.toContain('Personal administrativ');
    expect(sparseText.match(/^FUNCȚIA: Personal de execuție \(Barman\)$/gm)).toHaveLength(2);
  });

  it("names the workplaces in every chapter of the themes, and keeps each plan's last rows with its total", () => {
    const themes = 'fire/3.1_fire_training_themes.docx';
    const text = documentText(renderDocument(read(themes), stageTwoData));
    expect(text.match(/^LOCUL DE MUNCĂ: Magazin, Depozit$/gm)).toHaveLength(5);
    expect(text).not.toContain('--');
    const plans = (bodyOf(themes).match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? []).filter((table) =>
      table.includes('TIMP TOTAL DE INSTRUIRE')
    );
    expect(plans).toHaveLength(2);
    for (const plan of plans) {
      const rows = plan.match(/<w:tr>[\s\S]*?<\/w:tr>/g)!;
      for (const row of rows.slice(-3, -1)) {
        expect(row).not.toMatch(/<w:keepNext w:val="false"\/>/);
        expect(row).toMatch(/<w:keepNext w:val="true"\/>/);
      }
    }
  });

  // OMAI 712/2005 art. 13 and 18 ask eight hours of training, which the breaks are not.
  it('counts eight hours of training in each plan, its breaks without minutes', () => {
    const text = documentText(read('fire/3.1_fire_training_themes.docx'));
    const plans = text.split('TIMP TOTAL DE INSTRUIRE').slice(0, -1);
    expect(plans).toHaveLength(2);
    for (const plan of plans) {
      const rows = plan.slice(plan.lastIndexOf('Durata'));
      const minutes = [...rows.matchAll(/^(\d+) min$/gm)].map(([, value]) => Number(value));
      expect(minutes.reduce((sum, value) => sum + value, 0)).toBe(480);
      expect(rows).toContain('PAUZA');
      expect(rows).not.toMatch(/^PAUZA\n\d+ min$/m);
    }
    expect(text).toMatch(/^TIMP TOTAL DE INSTRUIRE\n480 min$/m);
  });

  it('lists the two tests on their cover', () => {
    const text = documentText(read('fire/4.0_fire_cover_tests.docx'));
    expect(text).toMatch(/^1\. Test de verificare a cunoștințelor la angajare/m);
    expect(text).toMatch(/^2\. Test anual de verificare a cunoștințelor\.$/m);
    expect(text).not.toMatch(/periodic/i);
  });

  it('prints the checks of OMAI 135/2023 annex 2, each answered yes or no', () => {
    const text = documentText(read('fire/6.4_fire_extinguisher_register.docx'));
    expect(text.match(/^DA$/gm)).toHaveLength(8);
    expect(text.match(/^NU$/gm)).toHaveLength(8);
    for (const letter of 'abcdefgh') expect(text).toMatch(new RegExp(`^${letter}\\)`, 'm'));
  });

  it('prints the fifteen measures of the permit and who signs it', () => {
    const text = documentText(read('fire/6.2_fire_work_permit.docx'));
    for (let item = 1; item <= 15; item++) expect(text).toMatch(new RegExp(`^${item}\\. `, 'm'));
    for (const signer of [
      'Emitentul',
      'Șeful sectorului în care se execută lucrările',
      'Executanții lucrărilor cu foc',
      'Serviciul public voluntar/privat pentru situații de urgență',
    ]) {
      expect(text).toContain(signer);
    }
  });
});
