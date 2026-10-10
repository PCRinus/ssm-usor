import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderDocument } from '../src/render';

// The PDFs land in `originals/preview/`, which git ignores. Two sample clients: one person in
// every role and short names, then three people and names long enough to test the layout. Only
// two of the three act in imminent danger, so decision 1.4 shows two of the five wordings of
// its Art. 2: the managers take the duties on, or settle which of them do.

const root = fileURLToPath(new URL('..', import.meta.url));
// preview [templates-dir] [output-dir], both relative to the package.
const [templatesArgument = 'templates', outputArgument = 'originals/preview'] =
  process.argv.slice(2);
const templates = `${root}${templatesArgument}/`;
const output = `${root}${outputArgument}/`;

const person = (name: string, jobTitle: string) => ({ name, jobTitle });
const listed = (items: string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} și ${items.at(-1)}`;
const described = (people: { name: string; jobTitle: string }[]) => {
  const items = people.map(({ name, jobTitle }) => `${name}, având funcția de ${jobTitle}`);
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')}, și ${items.at(-1)}`;
};

function evaluation(roman: string, name: string, heading: string, count: number) {
  const labels = [
    ['MIJLOACE DE PRODUCȚIE', 'mijloacelor de producție'],
    ['MEDIUL DE MUNCĂ', 'mediului de muncă'],
    ['EXECUTANT', 'executantului'],
    ['SARCINA DE MUNCĂ', 'sarcinii de muncă'],
  ] as const;
  const factors = Array.from({ length: count }, (_, index) => ({
    code: `F${index + 1}`,
    description: `Factor de risc ${index + 1}: lovire, tăiere sau cădere la utilizarea echipamentelor de muncă din dotare.`,
    level: index % 4 === 0 ? 4 : 1 + (index % 3),
    component: index % 4,
  }));
  const measured = factors
    .filter((factor) => factor.level > 3 || factor.code === 'F2')
    .sort((a, b) => b.level - a.level)
    .map((factor) => ({
      code: factor.code,
      description: factor.description,
      level: factor.level,
      measures:
        '– Verificarea periodică a echipamentelor.\n– Instruirea lucrătorilor la locul de muncă, la angajare și periodic, cu demonstrații practice.',
      technical: '– Verificarea periodică a echipamentelor.',
      organizational: '– Instruirea lucrătorilor la locul de muncă.',
      hygienicSanitary: '—',
      other: '—',
    }));
  const unacceptable = measured.filter((factor) => factor.level > 3);
  return {
    roman,
    name,
    heading,
    workZoneOrDash: 'Atelier',
    workSystem: {
      executant: name,
      workTask: 'Montaj și întreținere de instalații pe șantier.',
      meansOfProduction: 'Scule de mână, polizor unghiular, bormașină.',
      workEnvironment: 'Hală de producție cu iluminat mixt.',
    },
    exposedPersons: '3 persoane',
    exposure: '8 h / schimb',
    factorCount: count,
    components: labels.map(([label, of], component) => {
      const own = factors.filter((factor) => factor.component === component);
      return {
        label,
        of,
        count: own.length,
        share: count
          ? `${((own.length * 100) / count).toFixed(2).replace('.', ',')}\u00a0%`
          : '0,00\u00a0%',
        noFactors: own.length === 0,
        groups: own.length ? [{ letter: 'a', name: 'Factori de risc mecanic', factors: own }] : [],
      };
    }),
    sheet: factors.map((factor, index) => ({
      ...factor,
      component: index < 4 ? labels[factor.component]![0] : '',
      group: index < 4 ? 'Factori de risc mecanic' : '',
      consequence: factor.level > 3 ? 'Invaliditate gradul II' : 'ITM 3–45 zile',
      gravityClass: factor.level > 3 ? 5 : 2,
      probabilityClass: 3,
    })),
    ranked: [...factors].sort((a, b) => b.level - a.level),
    globalLevel: '2,75',
    verdict:
      'valoare care îl încadrează în categoria locurilor de muncă cu nivel de risc acceptabil, nedepășind limita maximă acceptabilă de 3,5',
    unacceptable,
    hasUnacceptable: unacceptable.length > 0,
    noUnacceptable: unacceptable.length === 0,
    findings: `Rezultatul este susținut de „Fișa de evaluare”, din care se observă că din totalul de ${count} factori de risc identificați, ${unacceptable.length} dintre ei depășesc valoarea 3.`,
    unacceptableLead: unacceptable.length ? 'Factorii de risc din domeniul inacceptabil sunt:' : '',
    measuresSentence: unacceptable.length
      ? 'Măsurile sunt prezentate în „Fișa de măsuri propuse”.'
      : '',
    irreversible:
      'Niciunul dintre factorii de risc identificați nu poate avea consecințe ireversibile.',
    plan: measured.map((factor) => ({
      ...factor,
      actions: 'Verificare la începutul fiecărui schimb.',
      deadline: 'Permanent',
      responsiblePerson: 'Conducătorul locului de muncă',
      observations: '—',
    })),
    hasPlan: measured.length > 0,
    noPlan: measured.length === 0,
  };
}

// The `fire` object of the fire-safety set (ADR 018): one workplace for the short sample, two
// for the long one, the second without a manager of its own and with interior hydrants.
function fireSample(people: ReturnType<typeof person>[], long: boolean) {
  const [first] = people;
  const workplace = (name: string, activity: string, extra: Record<string, unknown> = {}) => ({
    first: true,
    name,
    activity,
    address: 'Timișoara, județul Timiș, Str. Gheorghe Lazăr 24',
    floorAreaM2: 180,
    normLabel: 'Clădiri comerciale (1 buc./200 m²)',
    assemblyPoint: 'Parcarea din fața clădirii',
    combustibleMaterials: 'Ambalaje din carton și hârtie, mobilier din lemn, textile.',
    ignitionSources: 'Instalația electrică, aparatele electrice de încălzire.',
    fireRiskEquipment: 'Vitrine frigorifice, casa de marcat, aparate de cafea.',
    specificMeasures: '',
    extinguishers: [
      { code: 'P6', agentLabel: 'Pulbere', capacityLabel: '6\u00a0kg', wheeled: false, count: 2 },
      {
        code: 'G5',
        agentLabel: 'Dioxid de carbon (CO₂)',
        capacityLabel: '5\u00a0kg',
        wheeled: false,
        count: 1,
      },
    ],
    extinguisherCount: 3,
    otherEquipment: [],
    installations: [],
    hasInstallations: false,
    hasExteriorHydrants: false,
    hasInteriorHydrants: false,
    manager: first,
    firstIntervention: [{ ...first!, roleLabel: 'șef echipă de primă intervenție' }],
    firstInterventionNames: first!.name,
    interventionLeaderName: first!.name,
    ...extra,
  });
  const workplaces = long
    ? [
        workplace('Punct de lucru Calea Aradului', 'Gelaterie și cofetărie cu laborator propriu'),
        workplace('Depozit central', 'Depozitare de materii prime și ambalaje', {
          first: false,
          floorAreaM2: 1250,
          normLabel: 'Alte amenajări (1 buc./150 m²)',
          specificMeasures: 'Stivuirea ambalajelor la cel puțin 1 m de corpurile de iluminat.',
          extinguishers: [
            {
              code: 'P6',
              agentLabel: 'Pulbere',
              capacityLabel: '6\u00a0kg',
              wheeled: false,
              count: 6,
            },
            {
              code: 'P50',
              agentLabel: 'Pulbere',
              capacityLabel: '50\u00a0kg',
              wheeled: true,
              count: 1,
            },
            {
              code: 'SM9',
              agentLabel: 'Spumă mecanică',
              capacityLabel: '9\u00a0l',
              wheeled: false,
              count: 2,
            },
          ],
          extinguisherCount: 9,
          otherEquipment: [
            { kindLabel: 'Ladă cu nisip', count: 1 },
            { kindLabel: 'Post de intervenție PSI', count: 1 },
          ],
          installations: [
            { kindLabel: 'Hidranți interiori', description: 'Câte doi pe fiecare nivel' },
            { kindLabel: 'Hidranți exteriori', description: '' },
            {
              kindLabel: 'Instalație de detectare, semnalizare și avertizare la incendiu',
              description: '',
            },
          ],
          hasInstallations: true,
          hasExteriorHydrants: true,
          hasInteriorHydrants: true,
          manager: null,
          firstIntervention: people.slice(1).map((each) => ({
            ...each,
            roleLabel: 'coordonator privind apărarea împotriva incendiilor',
          })),
          firstInterventionNames: listed(people.slice(1).map(({ name }) => name)),
          interventionLeaderName: people[1]!.name,
        }),
      ]
    : [workplace('Punct de lucru', 'Gelaterie')];
  return {
    decisionNumbers: {
      organization: '1 PSI',
      training: '2 PSI',
      openFire: '3 PSI',
      smoking: '4 PSI',
      seasons: '5 PSI',
      technician: '6 PSI',
      instructions: '7 PSI',
      waste: '8 PSI',
      control: '9 PSI',
    },
    schedule: {
      periodicHours: 2,
      periodicLabel: '2\u00a0ore',
      administrativeIntervalMonths: 3,
      administrativeIntervalLabel: '3 LUNI',
      administrativeMonths: 'lunile februarie, mai, august și noiembrie',
      workerIntervalMonths: long ? 1 : 3,
      workerIntervalLabel: long ? '1 LUNĂ' : '3 LUNI',
      workerMonths: long
        ? 'lunile ianuarie, februarie, martie, aprilie, mai, iunie, iulie, august, septembrie, octombrie, noiembrie și decembrie'
        : 'lunile februarie, mai, august și noiembrie',
      firstMonth: 2,
      firstMonthLabel: 'februarie',
      dayFrom: 2,
      dayTo: 7,
    },
    staff: {
      administrative: long ? [] : ['Manager magazin'],
      execution: ['Lucrător comercial', 'Barman preparator'],
      administrativeText: long ? null : 'Manager magazin',
      executionText: 'Lucrător comercial, Barman preparator',
    },
    coordinator: first,
    interventionLeader: people[1] ?? first,
    workplaceManagers: people.map((each, index) => ({
      ...each,
      workplaceName: index === 0 ? null : workplaces[0]!.name,
    })),
    designated: people,
    workplaces,
    hasExteriorHydrants: long,
    hasGasExtinguishers: true,
    smoking: long
      ? {
          policy: 'forbidden_everywhere',
          forbiddenEverywhere: true,
          designatedPlaces: false,
          place: null,
        }
      : {
          policy: 'designated_places',
          forbiddenEverywhere: false,
          designatedPlaces: true,
          place: 'în curtea interioară, lângă poarta de acces auto',
        },
    waste: long
      ? {
          kinds: ['deșeuri de carton, hârtie, plastic', 'deșeuri menajere', 'uleiuri uzate'],
          contractor: null,
        }
      : {
          kinds: ['deșeuri de carton, hârtie, plastic', 'deșeuri menajere'],
          contractor: 'S.C. ECO COLECT S.R.L.',
        },
  };
}

function sample(
  label: string,
  legalName: string,
  representativeName: string,
  people: ReturnType<typeof person>[],
  fireSafetyTechnician: string
) {
  return {
    label,
    data: {
      branding: true,
      decisionNumber: 1,
      issueDate: '19.01.2026',
      issueYear: '2026',
      hasUnitRisks: true,
      noUnitRisks: false,
      unitRisks: [
        {
          risk: 'Cădere de la același nivel pe pardoseală alunecoasă.',
          measure:
            '– Întreținerea curățeniei în spațiile de lucru și purtarea de încălțăminte adecvată.\n– Semnalizarea pardoselii ude.',
        },
        {
          risk: 'Electrocutare prin atingere directă sau indirectă.',
          measure: '– Verificări PRAM anuale și verificarea vizuală a integrității cablurilor.',
        },
      ],
      followingYear: '2027',
      positions: [
        {
          name: 'Manager magazin',
          activities: 'Conduce magazinul și ține legătura cu furnizorii.',
          staffCategory: 'Tehnico-administrativ',
          workZone: 'Birou',
          workZoneLine: true,
          workZoneOrDash: 'Birou',
          intervalLabel: 'la 6 luni',
          trainingDuration: '2\u00a0ore',
          equipment: [],
        },
        {
          name: 'Sudor',
          activities: 'Sudură electrică și autogenă în atelier și pe șantier.',
          staffCategory: 'Execuție',
          workZone: 'Atelier',
          workZoneLine: true,
          workZoneOrDash: 'Atelier',
          intervalLabel: 'la 2 luni',
          trainingDuration: '2\u00a0ore',
          equipment: Array.from({ length: 30 }, (_, index) => ({
            risk: `Risc ${index + 1}: înțepături, tăieturi, zgârieturi (mâini, brațe)`,
            item: `Articol ${index + 1}`,
            quantityLabel: '1 buc. / 12 luni',
            allocationLabel: 'Inventar personal',
          })),
        },
        ...people.map(({ jobTitle }, index) => ({
          name: jobTitle,
          activities:
            index === 0 ? '—' : 'Montaj și întreținere de instalații criogenice pe șantier.',
          staffCategory: index === 0 ? 'Tehnico-administrativ' : 'Execuție',
          workZone: index === 0 ? '' : 'Atelier, șantier temporar',
          workZoneLine: index !== 0,
          workZoneOrDash: index === 0 ? '—' : 'Atelier, șantier temporar',
          intervalLabel: index === 0 ? 'la 6 luni' : 'la 3 luni',
          trainingDuration: '2\u00a0ore',
          equipment: [
            {
              risk: 'Lovituri, impact, cădere de obiecte de la înălțime (craniu)',
              item: 'Cască de protecție',
              quantityLabel: '1 buc. / 24 luni',
              allocationLabel: 'Inventar personal',
            },
            {
              risk: 'Înțepături, tăieturi, zgârieturi (mâini, brațe)',
              item: 'Mănuși împotriva agresiunilor mecanice',
              quantityLabel: '2 buc. / 6 luni',
              allocationLabel: 'Inventar personal',
            },
            {
              risk: 'Radiații, împroșcare (față, ochi)',
              item: 'Mască de sudură',
              quantityLabel: '1 buc. / 24 luni',
              allocationLabel: 'Inventar de secție',
            },
            {
              risk: 'Pulberi, fibre',
              item: 'Mască de unică folosință FFP2',
              quantityLabel: '20 buc.',
              allocationLabel: 'Consum',
            },
          ],
        })),
      ],
      get equippedPositions() {
        return this.positions.filter((position) => position.equipment.length > 0);
      },
      hasEquippedPositions: true,
      unequippedPositionsText: 'postul de lucru Manager magazin',
      annexes: [
        { number: 1, title: 'Activități de birou', versionId: 'v-1', versionDate: '26.09.2026' },
        { number: 2, title: 'Scări metalice', versionId: 'v-2', versionDate: '12.03.2026' },
        {
          number: 3,
          title: 'Aparat de sudură oxiacetilenică',
          versionId: 'v-3',
          versionDate: '26.09.2026',
        },
      ],
      noAnnexes: false,
      riskAssessment: {
        unit: {
          activity: '2562 – Fabricarea articolelor de feronerie',
          employeeCount: 6,
          workplaces: [
            { label: 'Sediu social', address: 'București, Sector 1' },
            {
              label: 'Punct de lucru „Atelier”',
              address: 'Ghiroda, județul Timiș, Str. Industriilor 4',
            },
          ],
          noWorkplaces: false,
        },
        evaluationCountText: '2 posturi de lucru și grupurile sensibile la riscuri specifice',
        globalLevel: '2,80',
        evaluations: [
          evaluation(
            'I',
            'Manager magazin',
            'LOCUL DE MUNCĂ: BIROU, POSTUL DE LUCRU: MANAGER MAGAZIN',
            9
          ),
          evaluation('II', 'Sudor', 'POSTUL DE LUCRU: SUDOR', 40),
          evaluation(
            'III',
            'Grupuri sensibile la riscuri specifice',
            'GRUPURI SENSIBILE LA RISCURI SPECIFICE (FEMEI GRAVIDE, LĂUZE SAU FEMEI CARE ALĂPTEAZĂ, TINERI, PERSOANE CU DIZABILITĂȚI)',
            3
          ),
        ],
      },
      themes: {
        ownInstructionsRevision: { id: 'r-1', number: 1 },
        annexTitles:
          'I.P.S.S.M. Activități de birou; I.P.S.S.M. Scări metalice; I.P.S.S.M. Aparat de sudură oxiacetilenică',
        positions: [
          {
            name: 'MANAGER MAGAZIN',
            trainer: 'S.C. SERVICIU EXTERN DEMO S.R.L. – Ana IONESCU',
            modules: [{ citation: 'I.P.S.S.M. Activități de birou, Art.\u00a01\u00a0–\u00a015' }],
            intervalLabel: '6 LUNI',
            sessions: [
              {
                month: 'FEBRUARIE',
                content:
                  'I.P.S.S.M. Art.\u00a01\u00a0–\u00a0165; I.P.S.S.M. Activități de birou, Art.\u00a01\u00a0–\u00a015;',
                duration: '120 min',
              },
              {
                month: 'AUGUST',
                content:
                  'I.P.S.S.M. Art.\u00a0166\u00a0–\u00a0287; I.P.S.S.M. Activități de birou, Art.\u00a01\u00a0–\u00a015; Testare.',
                duration: '120 min',
              },
            ],
          },
          ...people.map(({ name, jobTitle }) => ({
            name: jobTitle.toUpperCase(),
            trainer:
              people.length === 1
                ? `${name} – conducătorul locului\u00a0de\u00a0muncă`
                : `${people
                    .slice(0, -1)
                    .map((manager) => manager.name)
                    .join(
                      ', '
                    )} și ${people.at(-1)!.name} – conducătorii locurilor\u00a0de\u00a0muncă`,
            modules: [
              { citation: 'I.P.S.S.M. Scări metalice, Art.\u00a01\u00a0–\u00a012' },
              { citation: 'I.P.S.S.M. Aparat de sudură oxiacetilenică' },
            ],
            intervalLabel: '1 LUNĂ',
            sessions: [
              'IANUARIE',
              'FEBRUARIE',
              'MARTIE',
              'APRILIE',
              'MAI',
              'IUNIE',
              'IULIE',
              'AUGUST',
              'SEPTEMBRIE',
              'OCTOMBRIE',
              'NOIEMBRIE',
              'DECEMBRIE',
            ].map((month, index, months) => ({
              month,
              content: `I.P.S.S.M. Art.\u00a0${index * 24 + 1}\u00a0–\u00a0${index * 24 + 24}; I.P.S.S.M. Scări metalice, Art.\u00a01\u00a0–\u00a012; I.P.S.S.M. Aparat de sudură oxiacetilenică;${index === months.length - 1 ? ' Testare.' : ''}`,
              duration: '120 min',
            })),
          })),
        ],
      },
      client: { legalName, representativeName, representativeRole: 'Administrator' },
      provider: {
        legalName: 'S.C. SERVICIU EXTERN DEMO S.R.L.',
        representativeName: 'Ana IONESCU',
        representativeRole: 'Administrator',
      },
      specialist: { name: 'Ana IONESCU', professionalTitle: 'Evaluator de risc SSM' },
      fireSafetyTechnician: {
        name: fireSafetyTechnician,
        certificate: 'seria A nr. 1234/2024',
        authorization: people.length > 1 ? null : 'nr. 12 din 15.09.2026, ISU Timiș',
      },
      fire: fireSample(people, people.length > 1),
      workplaceManagers: people,
      workplaceManagersText: described(people),
      workplaceManagersList: people.map(({ name, jobTitle }) => `${name}, ${jobTitle}`).join('; '),
      firstAiders: people,
      firstAiderNames: listed(people.map(({ name }) => name)),
      evaluationTeam: people,
      imminentDanger: people.slice(0, 2),
      imminentDangerText: described(people.slice(0, 2)),
      workplaceManagersAssumeImminentDanger: people.length <= 2,
      workplaceManagersAssumeAndDesignateImminentDanger: false,
      workplaceManagersDesignateAlongsideImminentDanger: false,
      workplaceManagersAssignImminentDanger: people.length > 2,
      workplaceManagersDesignateImminentDanger: false,
      imminentDangerOthersText: null,
      imminentDangerManagerNames:
        people.length > 2 ? listed(people.slice(0, 2).map(({ name }) => name)) : null,
      workersRepresentativeDecision: true,
      workersRepresentatives: people,
      workersRepresentativesLead: people.length === 1 ? 'următorul angajat' : 'următorii angajați',
      training: {
        periodicDuration: '2\u00a0ore',
        intervalPhrase: 'se stabilesc următoarele intervale de timp',
        administrative: true,
        worker: true,
        administrativeFrequency: 'SEMESTRIAL',
        administrativeMonths: 'lunile februarie și august',
        workerFrequency: 'TRIMESTRIAL',
        workerMonths: 'lunile februarie, mai, august și noiembrie',
        dayFrom: 2,
        dayTo: 7,
      },
    },
  };
}

const samples = [
  sample(
    'short',
    'S.C. PIPETECH S.R.L.',
    'Florin Cristian TALOȘ',
    [person('Florin Cristian TALOȘ', 'Administrator')],
    'Dan POP'
  ),
  sample(
    'long',
    'S.C. INSTALAȚII TERMICE ȘI SANITARE BANAT CONSTRUCT S.R.L.',
    'Alexandra-Ioana CONSTANTINESCU-MUNTEANU',
    [
      person('Alexandra-Ioana CONSTANTINESCU-MUNTEANU', 'Administrator'),
      person('Mihai POPESCU', 'Operator montaj linii automate'),
      person('Elena DUMITRU', 'Conducător antrepriză construcții-montaj'),
    ],
    'Radu-Constantin MĂRGINEANU-ZAHARIA'
  ),
];

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const files = [templates, `${templates}fire/`]
  .filter((folder) => existsSync(folder))
  .flatMap((folder) =>
    readdirSync(folder)
      .filter((file) => file.endsWith('.docx'))
      .map((name) => ({ folder, name }))
  );
for (const { folder, name } of files) {
  const template = new Uint8Array(readFileSync(`${folder}${name}`));
  for (const { label, data } of samples) {
    writeFileSync(
      `${output}${name.replace(/\.docx$/, '')}.${label}.docx`,
      renderDocument(template, data)
    );
  }
}

execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '--entrypoint',
    'sh',
    '-v',
    `${output}:/work`,
    'gotenberg/gotenberg:8',
    '-c',
    'cd /work && soffice --headless --convert-to pdf --outdir /work *.docx >/dev/null 2>&1',
  ],
  { stdio: 'inherit' }
);
for (const file of readdirSync(output)
  .filter((name) => name.endsWith('.pdf'))
  .sort()) {
  const pages = readFileSync(`${output}${file}`)
    .toString('latin1')
    .match(/\/Type\s*\/Page[^s]/g)?.length;
  console.log(`${file}: ${pages} pages`);
}
