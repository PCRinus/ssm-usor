import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderDocument, TemplateError } from '../src/render';
import { signingTypeKeys } from '../src/signing';
import { signingAgreementSamples } from './signing-samples';
import { trainingSheetSamples } from './training-sheet-samples';

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

const runOn = (text: string) =>
  /^.\p{Ll}/u.test(text) ? text[0]!.toLocaleLowerCase('ro') + text.slice(1) : text;
const person = (name: string, jobTitle: string) => ({
  name,
  jobTitle,
  jobTitleRunOn: runOn(jobTitle),
});
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

// The `fire` object of the fire-safety set (ADR 018): one workplace for the short sample, three
// for the long one, the second without a manager of its own and with interior hydrants, the
// third a mobile site.
function fireSample(people: ReturnType<typeof person>[], long: boolean) {
  const [first] = people;
  const workplace = (name: string, activity: string, extra: Record<string, unknown> = {}) => ({
    first: true,
    name,
    activity,
    activityRunOn: runOn(activity),
    address: 'Timișoara, județul Timiș, Str. Gheorghe Lazăr 24',
    areaLabel: '180\u00a0m²',
    normLabel: 'Clădiri comerciale (1 buc./200 m²)',
    assemblyPoint: 'Parcarea din fața clădirii',
    combustibleMaterials: 'Ambalaje din carton și hârtie, mobilier din lemn, textile.',
    ignitionSources: 'Instalația electrică, aparatele electrice de încălzire.',
    fireRiskEquipment: 'Vitrine frigorifice, casa de marcat, aparate de cafea.',
    specificMeasures: '',
    specificMeasuresRunOn: '',
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
          areaLabel: '1250\u00a0m²',
          normLabel: 'Alte amenajări (1 buc./150 m²)',
          specificMeasures: 'Stivuirea ambalajelor la cel puțin 1 m de corpurile de iluminat.',
          specificMeasuresRunOn: 'stivuirea ambalajelor la cel puțin 1 m de corpurile de iluminat.',
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
        workplace('Șantier Dumbrăvița', 'Lucrări de construcții și instalații', {
          first: false,
          address: 'Dumbrăvița, județul Timiș, Str. Petőfi Sándor 50',
          areaLabel: '—',
          normLabel: '—',
          assemblyPoint: 'Zona de acces în șantier, lângă containerul de birou',
          combustibleMaterials: 'Cofraje și schele din lemn, ambalaje, carburanți pentru utilaje.',
          ignitionSources: 'Lucrări de sudură și tăiere, instalația electrică provizorie.',
          fireRiskEquipment: 'Grup electrogen, aparat de sudură, polizor unghiular.',
          extinguishers: [
            {
              code: 'P6',
              agentLabel: 'Pulbere',
              capacityLabel: '6\u00a0kg',
              wheeled: false,
              count: 2,
            },
          ],
          extinguisherCount: 2,
        }),
      ]
    : [workplace('Punct de lucru', 'Gelaterie')];
  return {
    representativeRoleRunOn: 'administrator',
    decisionNumbers: {
      organization: '1 PSI',
      training: '2 PSI',
      openFire: '3 PSI',
      smoking: '4 PSI',
      technician: '5 PSI',
      instructions: '6 PSI',
      waste: '7 PSI',
      seasons: '8 PSI',
      control: '9 PSI',
    },
    schedule: {
      periodicHours: 2,
      periodicLabel: '2\u00a0ore',
      administrativeIntervalMonths: 3,
      administrativeIntervalLabel: '3 luni',
      administrativeMonths: 'lunile februarie, mai, august și noiembrie',
      workerIntervalMonths: long ? 1 : 3,
      workerIntervalLabel: long ? '1 lună' : '3 luni',
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
    manyWorkplaceManagers: people.length > 1,
    designated: people,
    workplaces,
    hasExteriorHydrants: long,
    hasGasExtinguishers: true,
    hasThirdParties: long,
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
          kinds: [
            'deșeuri de carton, hârtie, plastic',
            'diverse materiale (ciment, cărămizi, ceramică, roci, ipsos, resturi de tâmplărie, soluții de lăcuit, vopsit și izolante, materiale de construcții cu termen de valabilitate expirat)',
            'deșeuri menajere',
            'uleiuri uzate',
          ],
          contractor: null,
          collectors:
            'muncitorii necalificați, șeful de șantier și gestionarul depozitului de materiale',
        }
      : {
          kinds: ['deșeuri de carton, hârtie, plastic', 'deșeuri menajere'],
          contractor: 'S.C. ECO COLECT S.R.L.',
          collectors: null,
        },
    // The long sample has a workplace with CO₂ units, one with only free rows and an empty one.
    schedules: [
      {
        name: workplaces[0]!.name,
        activity: workplaces[0]!.activity,
        hasRows: true,
        empty: false,
        rows: [
          {
            what: 'Controlul fiecărui stingător de incendiu (P6 – 2\u00a0buc., G5 – 1\u00a0buc.)',
            interval: 'lunar',
            who: `${first!.name}, coordonatorul privind apărarea împotriva incendiilor, cu cadrul tehnic, după caz`,
            basis:
              'OMAI 135/2023 – art. 8; rezultatele se înscriu în registrul de evidență a controlului stingătoarelor',
          },
          {
            what: 'Verificarea prin cântărire a stingătoarelor cu CO₂ sau agent curat (G5 – 1\u00a0buc.)',
            interval: 'la cel mult 6 luni, în iunie și decembrie',
            who: `${first!.name}, coordonatorul privind apărarea împotriva incendiilor, cu cadrul tehnic, după caz`,
            basis: 'OMAI 135/2023 – art. 8 alin. (3)',
          },
          {
            what: 'Verificarea stingătoarelor de către o firmă atestată (P6 – 2\u00a0buc.)',
            interval: 'anual',
            who: 'S.C. FOC STOP S.R.L.',
            basis: 'OMAI 135/2023 – art. 9; următorul service: 15.01.2027 și 12.03.2027',
          },
          {
            what: 'Verificarea stingătoarelor de către o firmă atestată (G5 – 1\u00a0buc.)',
            interval: 'anual',
            who: 'firmă atestată',
            basis: 'OMAI 135/2023 – art. 9; conform instrucțiunilor producătorului',
          },
          {
            what: 'Reîncărcarea stingătoarelor (P6 – 2\u00a0buc., G5 – 1\u00a0buc.)',
            interval: 'la termenul producătorului',
            who: 'S.C. FOC STOP S.R.L.',
            basis: 'OMAI 135/2023 – art. 12',
          },
          ...(long
            ? [
                {
                  what: 'Instalație de detectare, semnalizare și avertizare la incendiu',
                  interval: 'la 6 luni',
                  who: 'S.C. ALARM SERVICE S.R.L.',
                  basis: 'următoarea verificare: 12.03.2027',
                },
                {
                  what: 'Instalația de utilizare a gazelor naturale',
                  interval: 'anual',
                  who: 'Operatorul de distribuție',
                  basis: '—',
                },
              ]
            : []),
        ],
      },
      ...(long
        ? [
            {
              name: workplaces[1]!.name,
              activity: workplaces[1]!.activity,
              hasRows: true,
              empty: false,
              rows: [
                {
                  what: 'Coșul de fum al centralei termice',
                  interval: 'anual, înainte de sezonul rece',
                  who: 'Firmă autorizată de coșerit',
                  basis: '—',
                },
                {
                  what: 'Testarea funcționării iluminatului de siguranță',
                  interval: 'la 6 luni',
                  who: 'Electricianul autorizat al unității',
                  basis: '—',
                },
              ],
            },
            {
              name: workplaces[2]!.name,
              activity: workplaces[2]!.activity,
              hasRows: false,
              empty: true,
              rows: [],
            },
          ]
        : []),
    ],
    // The long sample lists its substances with gaps to fill in; the short one declares none.
    substances: long
      ? {
          state: 'listed',
          none: false,
          listed: true,
          entries: [
            {
              name: 'Gaz petrolier lichefiat (propan) în butelii',
              classification: 'Flam. Gas 1, H220; Press. Gas (Liquefied gas), H280',
              quantity: '2 butelii de 11 kg',
              physicalChemicalProperties: 'Gaz incolor, mai greu decât aerul, extrem de inflamabil',
              identificationCodes: 'Propan, CAS 74-98-6, nr. ONU 1965',
              healthEnvironmentRisks: 'DE COMPLETAT',
              protectionMeans: 'DE COMPLETAT',
              interventionMeasures: 'DE COMPLETAT',
              extinguishingAgents: 'Pulbere, CO₂; buteliile se răcesc cu apă pulverizată',
              storagePlace: 'Cușca metalică ventilată din curte, departe de surse de căldură',
              handling:
                'Butelia se transportă și se folosește în poziție verticală, cu robinetul închis când nu este folosită',
            },
            {
              name: 'Diluant pentru vopsele (white spirit)',
              classification: 'Flam. Liq. 3, H226; Asp. Tox. 1, H304; STOT RE 1, H372',
              quantity: '2 bidoane de 5 l',
              physicalChemicalProperties:
                'Lichid incolor, cu miros caracteristic, punct de inflamabilitate 38 °C',
              identificationCodes: 'DE COMPLETAT',
              healthEnvironmentRisks:
                'Poate fi mortal în caz de înghițire și de pătrundere în căile respiratorii; afectează sistemul nervos central la expunere prelungită',
              protectionMeans: 'Mănuși din nitril, ochelari de protecție, ventilarea încăperii',
              interventionMeasures: 'DE COMPLETAT',
              extinguishingAgents: 'Spumă, pulbere, CO₂; nu se folosește jet de apă',
              storagePlace: 'Dulapul metalic pentru substanțe inflamabile din atelier',
              handling: 'DE COMPLETAT',
            },
          ],
        }
      : { state: 'none', none: true, listed: false, entries: [] },
  };
}

// The long sample's IPSU annexes two modules its execution posts apply, cited in every session.
function fireThemesSample(people: ReturnType<typeof person>[], long: boolean) {
  const modules = long
    ? 'I.P.S.U. Scări metalice, art.\u00a01–12; I.P.S.U. Aparat de sudură oxiacetilenică; '
    : '';
  return {
    ownInstructionsRevision: { id: 'r-2', number: 1, versionIds: long ? ['v-2', 'v-3'] : [] },
    workplaceNames: long ? 'Sediu social, Depozit Str. Fabricii 3' : 'Sediu social',
    categories: [
      ...(long
        ? []
        : [
            {
              staffCategory: 'technical_administrative',
              label: 'Personal administrativ',
              posts: ['Manager magazin'],
              postsText: 'Manager magazin',
              workplaceTrainers: { workplaceManagers: null, technician: true },
              periodicTrainers: { workplaceManagers: null, technician: true },
              intervalLabel: '3 LUNI',
              sessions: ['FEBRUARIE', 'MAI', 'AUGUST', 'NOIEMBRIE'].map((month, index) => ({
                month,
                content: `IPSU art.\u00a0${index * 64 + 1}–${index * 64 + 64}; instrucțiunile afișate la locul de muncă (Decizia nr.\u00a06 PSI)${index === 3 ? '; testare.' : ''}`,
                duration: '120 min',
              })),
            },
          ]),
      {
        staffCategory: 'execution',
        label: 'Personal de execuție',
        posts: ['Lucrător comercial', 'Barman preparator'],
        postsText: 'Lucrător comercial, Barman preparator',
        workplaceTrainers: {
          workplaceManagers: `${listed(people.map(({ name }) => name))} – ${people.length === 1 ? 'conducătorul locului de muncă' : 'conducătorii locurilor de muncă'}`,
          technician: false,
        },
        periodicTrainers: {
          workplaceManagers: `${listed(people.map(({ name }) => name))} – ${people.length === 1 ? 'conducătorul locului de muncă' : 'conducătorii locurilor de muncă'}`,
          technician: true,
        },
        intervalLabel: long ? '1 LUNĂ' : '3 LUNI',
        sessions: (long
          ? [
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
            ]
          : ['FEBRUARIE', 'MAI', 'AUGUST', 'NOIEMBRIE']
        ).map((month, index, months) => ({
          month,
          content: `IPSU art.\u00a0${index * 20 + 1}–${index * 20 + 20}; ${modules}instrucțiunile afișate la locul de muncă (Decizia nr.\u00a06 PSI)${index === months.length - 1 ? '; testare.' : ''}`,
          duration: '120 min',
        })),
      },
    ],
  };
}

// The long sample's operator has fourteen employees, a filled building, an empty one and a
// mobile site; the short one four employees and a building half filled. Built as the API builds
// `fire.siteSheet`, a gap a null value.
function siteSheetSample({
  legalName,
  representativeName,
  technician,
  people,
  long,
}: {
  legalName: string;
  representativeName: string;
  technician: string;
  people: ReturnType<typeof person>[];
  long: boolean;
}) {
  const gap = 'DE COMPLETAT';
  const row = (title: string, value: string | null, hint: string) => ({ title, value, hint });
  const technicianLabel =
    'Cadru tehnic cu atribuții în domeniul apărării împotriva incendiilor/Inspector de protecție civilă';
  const decision = (number: number) => `Decizia nr.\u00a0${number} PSI`;
  const building = (filled: boolean, name: string, place: string, extinguishers: string) => ({
    name,
    place,
    constructive: [
      row(
        'Stabilitatea la foc',
        null,
        'din proiect sau din alte documente tehnice; în lipsa lor se precizează că conducerea nu poate prezenta documente privind stabilitatea la foc'
      ),
      row(
        'Compartimente de incendiu',
        null,
        'numărul compartimentelor de incendiu, suprafața și înălțimea fiecăruia'
      ),
      row(
        'Căi de acces, intervenție și evacuare',
        null,
        'numărul, gabaritul, marcarea și semnalizarea lor'
      ),
      row(
        'Case de scări (închise/deschise)',
        null,
        'numărul, gabaritul și alcătuirea constructivă'
      ),
      row('Ascensoare de intervenție', null, 'dacă există, potrivit reglementării'),
    ],
    technical: [
      row(
        'Sisteme de ventilație/climatizare',
        null,
        'dacă există; contractul de întreținere și reparare cu o firmă autorizată și ultima verificare, sau exploatarea prin personal propriu calificat'
      ),
      row(
        'Sisteme de încălzire',
        filled ? `combustibil: gaze naturale; întreținerea și ultima verificare: ${gap}` : null,
        'dacă există; tipul combustibilului; contractul de întreținere și reparare cu o firmă autorizată și ultima verificare, sau exploatarea prin personal propriu calificat'
      ),
      row(
        'Instalații electrice',
        filled ? 'întreținute de S.C. ELECTRO SERV S.R.L.; ultima verificare: 12.03.2026' : null,
        'contractul de întreținere și reparare cu o firmă autorizată și ultima verificare, sau exploatarea prin personal propriu calificat'
      ),
      row(
        'Instalație de alimentare cu gaze naturale/G.P.L.',
        filled ? 'încălzire și prepararea hranei' : null,
        'dacă există; scopul utilizării (prepararea hranei, încălzire, uz industrial)'
      ),
      row(
        'Iluminat de siguranță',
        filled
          ? 'există: corpuri autonome pe căile de evacuare; firma de service: S.C. ELECTRO SERV S.R.L.'
          : 'nu există',
        'dacă există; tipul de alimentare, categoria (continuarea lucrului, evacuare, intervenție) și spațiile protejate'
      ),
      row(
        'Sisteme și instalații tehnologice',
        'Vitrine frigorifice, casa de marcat, aparate de cafea.',
        'se enumeră sistemele și instalațiile tehnologice, dacă există'
      ),
      row(
        'Sistem/dispozitiv de evacuare a fumului și gazelor fierbinți',
        'nu există',
        'dacă există; sistemul de acționare și spațiile protejate'
      ),
      row(
        'Sisteme de detectare a incendiilor',
        filled
          ? 'nu există'
          : 'există: firma de service: S.C. ALARM SERVICE S.R.L.; ultima verificare: 12.03.2026',
        'dacă există; tipul, spațiile protejate, firma atestată care o întreține și ultima verificare'
      ),
      row(
        'Sisteme de alarmare/avertizare',
        filled
          ? null
          : `prin instalația de detectare, semnalizare și avertizare la incendiu; tipul avertizării: ${gap}`,
        'dacă există; tipul: sonoră (bandă preînregistrată, megafon etc.) sau silențioasă'
      ),
      row(
        'Sisteme de limitare a propagării incendiilor',
        null,
        'uși rezistente la foc, clapete antifoc, sisteme de obturare, oprirea automată a ventilării, protecții ale structurilor, cu compartimentul în care sunt prevăzute'
      ),
      row('Sisteme de detectare a gazelor', 'nu există', 'dacă există; spațiile protejate'),
      row(
        'Instalații speciale de stingere cu apă',
        'nu există',
        'tipul (sprinklere, apă pulverizată etc.), zonele protejate, numărul capetelor de refulare'
      ),
      row(
        'Instalații de stingere cu gaze/aerosoli',
        null,
        'dacă există; tipul, zonele protejate, numărul capetelor de refulare'
      ),
      row(
        'Alte instalații de stingere (pulbere, spumă etc.)',
        null,
        'dacă există; tipul instalației, spațiile protejate și numărul de sectoare'
      ),
      row(
        'Instalație de protecție împotriva trăsnetului',
        'nu există',
        'dacă există; dacă este verificată de o firmă atestată'
      ),
      row(
        'Stingătoare',
        extinguishers,
        'pe tipodimensiuni; dacă sunt verificate de o firmă atestată'
      ),
      row(
        'Hidranți interiori/coloane uscate',
        filled ? 'nu există' : 'există: câte doi pe fiecare nivel',
        'dacă există; alimentarea de la rețeaua orașului sau din rezerva de apă (m³)'
      ),
      row(
        'Hidranți exteriori',
        filled ? 'nu există' : 'există',
        'dacă există; numărul, distanța față de clădire și pe ce laturi, alimentarea'
      ),
      row(
        'Alimentarea cu apă pentru stingerea incendiilor (rezerva de apă, pompe)',
        filled ? 'nu există o rezervă proprie de apă pentru stingerea incendiilor' : null,
        'rezerva de apă (m³); pompele (număr, m³/min)'
      ),
      row(
        'Utilaje și autospeciale de intervenție din dotarea serviciului privat pentru situații de urgență',
        'nu este cazul: operatorul nu are serviciu privat pentru situații de urgență',
        'utilajele și autospecialele serviciului privat, dacă există'
      ),
      row(
        'Stocuri de produse de stingere/neutralizatori',
        null,
        'stocurile de produse de stingere și de neutralizatori, dacă există'
      ),
      row(
        'Echipament de protecție al personalului de intervenție în funcție de riscurile existente și de efectele negative ale incendiilor specifice',
        null,
        'echipamentul de protecție al echipei de primă intervenție, potrivit riscurilor'
      ),
      ...(filled
        ? [
            row(
              'Alte precizări',
              'Clădirea are o singură scară de evacuare, spre curtea interioară.',
              ''
            ),
          ]
        : []),
    ],
  });
  const perBuilding = (first: string) =>
    long
      ? `Clădirea 1 (Punct de lucru Calea Aradului): ${first}\nClădirea 2 (Depozit central): ${gap}`
      : first;
  const documents = [
    'Decizia nr.\u00a01 PSI privind organizarea apărării împotriva incendiilor',
    'Decizia nr.\u00a02 PSI privind instruirea în domeniul situațiilor de urgență',
    'Decizia nr.\u00a03 PSI privind lucrul cu foc deschis',
    'Decizia nr.\u00a04 PSI privind fumatul',
    'Decizia nr.\u00a05 PSI privind cadrul tehnic PSI',
    'Decizia nr.\u00a06 PSI privind instrucțiunile de apărare împotriva incendiilor',
    'Decizia nr.\u00a07 PSI privind colectarea deșeurilor',
    ...(long
      ? [
          'Decizia nr.\u00a08 PSI privind perioadele caniculare și sezonul rece',
          'Decizia nr.\u00a09 PSI privind controlul propriu',
        ]
      : []),
    'Instrucțiunile proprii de apărare împotriva incendiilor',
    'Tematica de instruire în domeniul situațiilor de urgență',
    'Testele de verificare a cunoștințelor',
    'Lista mijloacelor de apărare împotriva incendiilor',
    'Organizarea apărării împotriva incendiilor la fiecare loc de muncă',
    'Lista substanțelor periculoase',
    ...(long ? ['Graficele de întreținere și verificare'] : []),
    'Evidența exercițiilor de intervenție, a controalelor și a permiselor de lucru cu foc',
    'Permisul de lucru cu foc',
    ...(long ? ['Registrul de control pentru instalațiile de apărare împotriva incendiilor'] : []),
    'Registrul de evidență a controlului stingătoarelor de incendiu',
  ];
  const buildings = [
    building(
      true,
      'Punct de lucru Calea Aradului',
      'Punct de lucru Calea Aradului, Timișoara, județul Timiș, Str. Gheorghe Lazăr 24',
      'P6 – 2\u00a0buc., G5 – 1\u00a0buc.; verificate de S.C. FOC STOP S.R.L.'
    ),
    ...(long
      ? [
          building(
            false,
            'Depozit central',
            'Depozit central, Timișoara, județul Timiș, Str. Gheorghe Lazăr 24',
            `P6 – 6\u00a0buc., P50 carosabil – 1\u00a0buc., SM9 – 2\u00a0buc.; firma atestată care le verifică: ${gap}`
          ),
        ]
      : []),
  ];
  return {
    identity: [
      row('Denumirea operatorului economic/instituției', legalName, 'denumirea în clar'),
      row(
        'Administrator/Conducător – date de identificare',
        `${representativeName}, administrator`,
        'numele și prenumele, funcția'
      ),
      row(
        'Administrator/Conducător – telefon serviciu',
        long ? null : '0722 111 222',
        'telefonul de serviciu și faxul administratorului'
      ),
      row(
        'Administrator/Conducător – telefon domiciliu',
        null,
        'telefonul de domiciliu, faxul și adresa de e-mail ale administratorului'
      ),
      row(
        'Coordonatele operatorului economic/instituției – adresa',
        'Timișoara, județul Timiș, Str. Gheorghe Lazăr 24',
        'adresa sediului unde se află operatorul economic/instituția'
      ),
      row(
        'Coordonatele operatorului economic/instituției – telefon, fax, e-mail',
        'telefon: 0722 111 222, e-mail: office@exemplu.ro',
        'telefonul, faxul și adresa de e-mail ale operatorului'
      ),
      row(
        'Coordonatele filialelor/sucursalelor/punctelor de lucru (dacă este cazul)',
        [
          '– Punct de lucru Calea Aradului (sediu social): Timișoara, județul Timiș, Str. Gheorghe Lazăr 24',
          ...(long
            ? [
                '– Depozit central: Timișoara, județul Timiș, Str. Gheorghe Lazăr 24',
                '– Șantier Dumbrăvița (șantier temporar sau mobil): Dumbrăvița, județul Timiș, Str. Petőfi Sándor 50',
              ]
            : []),
          `Telefon, fax, e-mail pentru fiecare: ${gap}`,
        ].join('\n'),
        'adresa, telefonul, faxul și adresa de e-mail ale fiecărui punct de lucru'
      ),
      row(
        'Număr de înregistrare din registrul comerțului',
        long ? 'J35/1234/2008, CUI 14399840' : 'CUI 14399840',
        'numărul de ordine în registrul comerțului sau codul unic de înregistrare'
      ),
      row(
        `${technicianLabel} – nume și prenume`,
        `${technician}, reprezentant al S.C. SERVICIU EXTERN S.R.L.`,
        'numele și prenumele cadrului tehnic'
      ),
      row(
        `${technicianLabel} – telefon serviciu`,
        '0256 123 456',
        'telefonul de serviciu al cadrului tehnic'
      ),
      row(
        `${technicianLabel} – telefon domiciliu`,
        null,
        'telefonul de domiciliu al cadrului tehnic'
      ),
      row(
        `${technicianLabel} – certificat de competență, termen de valabilitate`,
        `seria A nr. 1234/2024; termen de valabilitate: ${gap}`,
        'numărul certificatului de competență și termenul lui de valabilitate'
      ),
    ],
    general: [
      row(
        'Domeniul de activitate',
        `Gelaterie și cofetărie cu laborator propriu${long ? '; Depozitare de materii prime și ambalaje; Lucrări de construcții și instalații' : ''} (cod CAEN 1052); domeniul din model: ${gap}`,
        'se alege unul dintre domeniile modelului: administrativ; comercial; cult; cultură; educație; financiar-bancar; fond forestier; monumente istorice și de arhitectură; sănătate; sport; agrement; turism; transporturi; operatori economici cu risc mare și foarte mare de incendiu; alte domenii de activitate'
      ),
      row(
        'Anul de construire (punere în funcțiune)',
        perBuilding('1987'),
        'anul punerii în funcțiune; modificările, modernizările sau extinderile, cu anul lor; numărul avizului sau al autorizației de securitate la incendiu, dacă există'
      ),
      row(
        'Suprafața construită/desfășurată',
        perBuilding('412,5\u00a0m²'),
        'în m², pentru fiecare construcție'
      ),
      row(
        'Număr niveluri (regim de înălțime)',
        perBuilding('P+1E'),
        'numărul de niveluri și înălțimea în m, pentru fiecare construcție'
      ),
      row(
        'Clasificare construcție (civilă, de producție, de depozitare, cu funcțiuni mixte)',
        perBuilding('cu funcțiuni mixte'),
        'civilă, de producție, de depozitare sau cu funcțiuni mixte'
      ),
      row(
        'Structura de rezistență a construcției (structură metalică, beton armat, zidărie, lemn, mixtă etc.)',
        long ? perBuilding('Cadre din beton armat, închideri din zidărie de cărămidă') : null,
        'structură metalică, beton armat, zidărie, lemn, mixtă etc.'
      ),
      row(
        'Personal angajat',
        `${long ? '14 angajați' : '4 angajați'} în total, după lista clientului; numărul estimativ pe fiecare clădire: ${gap}`,
        'număr estimativ, pentru fiecare clădire'
      ),
      row(
        'Utilizarea clădirii',
        null,
        'prezența oamenilor în clădire, permanent sau temporar, în timpul și în afara programului de lucru, în week-end și de sărbători, cu numărul maxim de persoane prezente simultan; pericolele din vecinătăți'
      ),
    ],
    buildings,
    noBuildings: false,
    substances: long
      ? {
          none: false,
          listed: true,
          entries: [
            {
              name: 'Gaz petrolier lichefiat (propan) în butelii',
              rows: [
                row(
                  'Denumirea substanțelor periculoase folosite, clasificare',
                  'Gaz petrolier lichefiat (propan) în butelii – Flam. Gas 1, H220; Press. Gas (Liquefied gas), H280',
                  'în conformitate cu sistemul internațional de clasificare a substanțelor periculoase, frazele de risc asociate'
                ),
                row(
                  'Cantitatea existentă în unitate',
                  '2 butelii de 11 kg',
                  'pentru fiecare substanță'
                ),
                row(
                  'Loc de depozitare',
                  'Cușca metalică ventilată din curte, departe de surse de căldură',
                  'instalație, echipament de proces, sistem de stocare, sistem de compresie, conducte etc.'
                ),
                row(
                  'Mod de operare',
                  'Butelia se transportă și se folosește în poziție verticală, cu robinetul închis când nu este folosită',
                  'modul de manipulare și de utilizare'
                ),
              ],
            },
            {
              name: 'Diluant pentru vopsele (white spirit)',
              rows: [
                row(
                  'Denumirea substanțelor periculoase folosite, clasificare',
                  'Diluant pentru vopsele (white spirit) – Flam. Liq. 3, H226; Asp. Tox. 1, H304; STOT RE 1, H372',
                  'în conformitate cu sistemul internațional de clasificare a substanțelor periculoase, frazele de risc asociate'
                ),
                row(
                  'Cantitatea existentă în unitate',
                  '2 bidoane de 5 l',
                  'pentru fiecare substanță'
                ),
                row(
                  'Loc de depozitare',
                  'Dulapul metalic pentru substanțe inflamabile din atelier',
                  'instalație, echipament de proces, sistem de stocare, sistem de compresie, conducte etc.'
                ),
                row('Mod de operare', null, 'modul de manipulare și de utilizare'),
              ],
            },
          ],
        }
      : { none: true, listed: false, entries: [] },
    organization: [
      row(
        'Organizarea alarmării',
        `da, prin ${decision(1)} privind organizarea apărării împotriva incendiilor: ${people[0]!.name} asigură observarea și anunțarea incendiului pe plan intern și prin apel la 112, iar șeful echipei de primă intervenție, ${people.at(-1)!.name}, anunță 112; fișa de organizare a apărării împotriva incendiilor este afișată la fiecare loc de muncă`,
        'dacă este organizată și pe baza căror documente'
      ),
      row(
        'Instruirea personalului',
        `da, periodic, potrivit Deciziei nr.\u00a02 PSI: personalul administrativ la 3 luni și personalul de execuție la ${long ? '1 lună' : '3 luni'}, câte 2 ore la fiecare instruire periodică; personalul administrativ este instruit de cadrul tehnic PSI, ${technician}, titular al certificatului seria A nr. 1234/2024; personalul de execuție, de șefii locurilor de muncă (${listed(people.map(({ name }) => name))}), cu cadrul tehnic, după caz`,
        'dacă se face periodic (periodicitatea pe categorii de personal), de către cine, dacă este persoană atestată'
      ),
      row(
        'Control intern de prevenire',
        long
          ? `da, potrivit Deciziei nr.\u00a09 PSI: coordonatorul privind apărarea împotriva incendiilor, ${people[0]!.name}, și cadrul tehnic – trimestrial, pe tot perimetrul și la persoanele juridice care desfășoară activități în spațiile operatorului; coordonatorul – lunar, fiecare stingător; șefii locurilor de muncă – zilnic sau pe schimb; personalul de execuție – zilnic, la terminarea programului; conducerea, cu coordonatorul și cadrul tehnic – anual, în ianuarie`
          : `da, de persoanele desemnate prin ${decision(1)}: șefii locurilor de muncă – zilnic sau pe schimb, la locul de muncă pe care îl conduc; coordonatorul privind apărarea împotriva incendiilor, ${people[0]!.name} – lunar, controlul fiecărui stingător de incendiu`,
        'dacă se execută, la ce interval și de către cine'
      ),
      row(
        'Serviciu privat pentru situații de urgență',
        'nu există; nu este cazul',
        'dacă există sau dacă este încheiat un contract: obiectul contractului, datele firmei'
      ),
      row(
        'Planuri/exerciții de evacuare din clădire',
        null,
        'când s-a executat ultima oară exercițiul de evacuare și ce probleme deosebite au fost constatate'
      ),
      row(
        'Afișare instrucțiuni specifice',
        `da: instrucțiunile de apărare împotriva incendiilor aprobate prin ${decision(6)} se afișează la fiecare loc de muncă`,
        'dacă există'
      ),
      row(
        'Obligațiile administratorului/conducerii',
        `da: stabilite prin ${decision(1)} privind organizarea apărării împotriva incendiilor`,
        'dacă există și ce documente sunt întocmite'
      ),
      row(
        'Obligațiile cadrului tehnic/inspectorului/personalului din structura cu atribuții de apărare împotriva incendiilor/de protecție civilă',
        `da: ${decision(5)} privind cadrul tehnic PSI, cu obligațiile din anexa ei, și ${decision(1)} privind organizarea apărării împotriva incendiilor, pentru coordonator și echipa de primă intervenție`,
        'dacă există și ce documente sunt întocmite pentru reglementarea lor'
      ),
      row(
        'Ordinea interioară',
        `reglementată prin ${decision(3)} privind lucrul cu foc deschis, ${decision(4)} privind fumatul${long ? `, ${decision(7)} privind colectarea deșeurilor și ${decision(8)} privind perioadele caniculare și sezonul rece` : ` și ${decision(7)} privind colectarea deșeurilor`}; asigurarea căilor de acces, de evacuare și de intervenție: ${gap}`,
        'reglementările pentru lucrul cu foc deschis, fumat, deșeuri, sezonul rece și perioadele caniculare; căile de acces, de evacuare și de intervenție'
      ),
      row(
        'Documente specifice de apărare împotriva incendiilor',
        documents.map((document) => `– ${document}`).join('\n'),
        'potrivit reglementărilor în domeniu'
      ),
      row('Documente specifice de protecție civilă', null, 'potrivit reglementărilor în domeniu'),
      row(
        'Reglementarea modului de întreținere, verificare, reparare a mijloacelor tehnice de apărare împotriva incendiilor',
        long
          ? `– stingătoarele: S.C. FOC STOP S.R.L.\n– iluminat de siguranță: S.C. ELECTRO SERV S.R.L.\n– hidranți interiori: ${gap}\n– hidranți exteriori: ${gap}\n– instalație de detectare, semnalizare și avertizare la incendiu: S.C. ALARM SERVICE S.R.L.\nVerificările se fac după graficele de întreținere și verificare.`
          : '– stingătoarele: S.C. FOC STOP S.R.L.',
        'persoana juridică atestată care întreține, verifică și repară fiecare mijloc'
      ),
      row(
        'Evidența incendiilor de la punerea în funcțiune a operatorului economic/instituției (pe fiecare clădire în parte)',
        null,
        'incendiile produse, pe fiecare clădire, cu cauzele lor'
      ),
    ],
  };
}

// The annual report 7.2 (ADR 020) for 2026, built as the API builds it from the samples' set: the
// long one with its three workplaces and decision 9, the short one under ten employees, whose
// set holds no decision 9 and no site sheet.
function annualReportSample(people: ReturnType<typeof person>[], long: boolean) {
  const [first] = people;
  const decision = (number: number, subject: string) => ({
    title: `Decizia privind ${subject}`,
    reference: `nr.\u00a0${number}\u00a0PSI din 19.01.2026`,
  });
  const subjects = [
    'organizarea apărării împotriva incendiilor',
    'instruirea în domeniul situațiilor de urgență',
    'lucrul cu foc deschis',
    'fumatul',
    'cadrul tehnic PSI',
    'instrucțiunile de apărare împotriva incendiilor',
    'colectarea deșeurilor',
    ...(long ? ['perioadele caniculare și sezonul rece', 'controlul propriu'] : []),
  ];
  const issued = 'emis, rev.\u00a01 din 19.01.2026';
  const draft = 'ciornă, rev.\u00a01 din 19.01.2026';
  const extinguisher = (what: string, count: number, next: string) => ({
    what,
    quantity: `${count}\u00a0buc.`,
    next,
  });
  const shop = {
    name: long ? 'Punct de lucru Calea Aradului' : 'Punct de lucru',
    place: `${long ? 'Punct de lucru Calea Aradului' : 'Punct de lucru'}, Timișoara, județul Timiș, Str. Gheorghe Lazăr 24`,
    rows: [
      extinguisher('Stingător P6 – pulbere, 6\u00a0kg', 2, '15.01.2027, 12.03.2027'),
      extinguisher('Stingător G5 – dioxid de carbon (CO₂), 5\u00a0kg', 1, '—'),
    ],
  };
  const workplaces = long
    ? [
        shop,
        {
          name: 'Depozit central',
          place: 'Depozit central, Timișoara, județul Timiș, Str. Gheorghe Lazăr 24',
          rows: [
            extinguisher('Stingător P6 – pulbere, 6\u00a0kg', 6, '01.04.2027'),
            extinguisher('Stingător P50 carosabil – pulbere, 50\u00a0kg', 1, '01.04.2027'),
            extinguisher('Stingător SM9 – spumă mecanică, 9\u00a0l', 2, '—'),
            { what: 'Ladă cu nisip', quantity: '1\u00a0buc.', next: '—' },
            { what: 'Post de intervenție PSI', quantity: '1\u00a0buc.', next: '—' },
            {
              what: 'Instalație de detectare, semnalizare și avertizare la incendiu',
              quantity: '1 instalație',
              next: '12.09.2026',
            },
            {
              what: 'Hidranți interiori – Câte doi pe fiecare nivel',
              quantity: '1 instalație',
              next: '12.03.2027',
            },
            { what: 'Hidranți exteriori', quantity: '1 instalație', next: '—' },
          ],
        },
        {
          name: 'Șantier Dumbrăvița',
          place: 'Șantier Dumbrăvița, Dumbrăvița, județul Timiș, Str. Petőfi Sándor 50',
          rows: [extinguisher('Stingător P6 – pulbere, 6\u00a0kg', 2, '—')],
        },
      ]
    : [shop];
  const documents = [
    ...subjects.map((subject, index) => ({
      title: `Decizia privind ${subject}`,
      state: index < 2 ? issued : draft,
    })),
    { title: 'Instrucțiuni proprii în domeniul situațiilor de urgență', state: draft },
    { title: 'Tematica de instruire în domeniul situațiilor de urgență', state: draft },
    { title: 'Test la angajare', state: draft },
    { title: 'Test anual', state: draft },
    { title: 'Lista mijloacelor de apărare împotriva incendiilor', state: draft },
    {
      title: 'Organizarea apărării împotriva incendiilor la locul de muncă',
      state: draft,
    },
    { title: 'Lista substanțelor periculoase', state: draft },
    ...(long ? [{ title: 'Graficele de întreținere și verificare', state: draft }] : []),
    {
      title: 'Evidența exercițiilor de intervenție, a controalelor și a permiselor de lucru cu foc',
      state: draft,
    },
    { title: 'Permis de lucru cu foc', state: draft },
    ...(long
      ? [
          {
            title: 'Registru de control pentru instalațiile de apărare împotriva incendiilor',
            state: 'negenerat',
          },
        ]
      : []),
    { title: 'Registru de evidență a controlului stingătoarelor de incendiu', state: draft },
    ...(long ? [{ title: 'Fișa obiectivului', state: draft }] : []),
  ];
  const coordinator = `${people.at(-1)!.name}, ${people.at(-1)!.jobTitle}`;
  const controls = [
    {
      who: 'Coordonatorul privind apărarea împotriva incendiilor și cadrul tehnic',
      interval: 'trimestrial: martie, iunie, septembrie, decembrie',
      scope: 'pe tot perimetrul',
    },
    {
      who: 'Coordonatorul privind apărarea împotriva incendiilor și cadrul tehnic',
      interval: 'trimestrial: martie, iunie, septembrie, decembrie',
      scope: 'la persoanele juridice care desfășoară activități în spațiile operatorului',
    },
    {
      who: 'Coordonatorul privind apărarea împotriva incendiilor, cu cadrul tehnic, după caz',
      interval: 'lunar',
      scope: 'fiecare stingător de incendiu',
    },
    {
      who: 'Coordonatorul privind apărarea împotriva incendiilor, cu cadrul tehnic, după caz',
      interval: 'la cel mult 6 luni: iunie, decembrie',
      scope: 'stingătoarele cu CO₂ sau agent curat, prin cântărire',
    },
    {
      who: 'Șefii locurilor de muncă',
      interval: 'zilnic sau pe schimb',
      scope: 'locul de muncă condus',
    },
    {
      who: 'Personalul de execuție',
      interval: 'zilnic',
      scope: 'zona de lucru, la terminarea programului',
    },
    {
      who: 'Administrator, cu coordonatorul privind apărarea împotriva incendiilor și cadrul tehnic',
      interval: 'anual: ianuarie',
      scope: 'pe tot perimetrul',
    },
  ];
  return {
    year: 2026,
    nextYear: 2027,
    decisions: subjects.map((subject, index) => decision(index + 1, subject)),
    coordinator,
    interventionLeader: `${first!.name}, ${first!.jobTitle}`,
    workplaceManagers: listed(people.map(({ name }) => name)),
    staff: long
      ? [
          {
            label: 'Personal de execuție',
            posts: 'Barman preparator, Lucrător comercial, Operator montaj linii automate',
            headcount: '13 angajați',
          },
        ]
      : [
          { label: 'Personal administrativ', posts: 'Manager magazin', headcount: '1 angajat' },
          {
            label: 'Personal de execuție',
            posts: 'Barman preparator, Lucrător comercial',
            headcount: '3 angajați',
          },
        ],
    headcount: long ? '14 angajați' : '4 angajați',
    workplaces,
    periodicLabel: '2\u00a0ore',
    training: long
      ? [
          {
            label: 'Personal de execuție',
            posts: 'Barman preparator, Lucrător comercial, Operator montaj linii automate',
            interval: 'la 1 lună',
            months:
              'ianuarie, februarie, martie, aprilie, mai, iunie, iulie, august, septembrie, octombrie, noiembrie, decembrie',
          },
        ]
      : [
          {
            label: 'Personal administrativ',
            posts: 'Manager magazin',
            interval: 'la 3 luni',
            months: 'februarie, mai, august, noiembrie',
          },
          {
            label: 'Personal de execuție',
            posts: 'Barman preparator, Lucrător comercial',
            interval: 'la 3 luni',
            months: 'februarie, mai, august, noiembrie',
          },
        ],
    controls: long ? controls : [],
    hasControls: long,
    noControls: !long,
    documents,
    missingCount: long ? 1 : 0,
    allGenerated: !long,
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
      // The short sample annexes nothing, so both own instructions show their sentence for none.
      annexes:
        people.length > 1
          ? [
              {
                number: 1,
                title: 'Activități de birou',
                versionId: 'v-1',
                versionDate: '26.09.2026',
              },
              { number: 2, title: 'Scări metalice', versionId: 'v-2', versionDate: '12.03.2026' },
              {
                number: 3,
                title: 'Aparat de sudură oxiacetilenică',
                versionId: 'v-3',
                versionDate: '26.09.2026',
              },
            ]
          : [],
      noAnnexes: people.length === 1,
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
                  'I.P.S.S.M. Art.\u00a01\u00a0–\u00a0165; I.P.S.S.M. Activități de birou, Art.\u00a01\u00a0–\u00a015',
                duration: '120 min',
              },
              {
                month: 'AUGUST',
                content:
                  'I.P.S.S.M. Art.\u00a0166\u00a0–\u00a0287; I.P.S.S.M. Activități de birou, Art.\u00a01\u00a0–\u00a015',
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
            ].map((month, index) => ({
              month,
              content: `I.P.S.S.M. Art.\u00a0${index * 24 + 1}\u00a0–\u00a0${index * 24 + 24}; I.P.S.S.M. Scări metalice, Art.\u00a01\u00a0–\u00a012; I.P.S.S.M. Aparat de sudură oxiacetilenică`,
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
      fire: {
        ...fireSample(people, people.length > 1),
        siteSheet: siteSheetSample({
          legalName,
          representativeName,
          technician: fireSafetyTechnician,
          people,
          long: people.length > 1,
        }),
        annualReport: annualReportSample(people, people.length > 1),
      },
      fireThemes: fireThemesSample(people, people.length > 1),
      seasonsDecision: true,
      controlDecision: true,
      installationRegister: true,
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
// The per-employee templates are merged with an employee's data, not a client's.
const employeeSamples = new Map<string, { label: string; data: Record<string, unknown> }[]>(
  [templates, `${templates}fire/`]
    .filter((folder) => existsSync(`${folder}manifest.json`))
    .flatMap((folder) =>
      (
        JSON.parse(readFileSync(`${folder}manifest.json`, 'utf8')) as {
          templates: { perEmployee?: true; typeKey: string; file: string }[];
        }
      ).templates
        .filter((entry) => entry.perEmployee)
        .map((entry) => [
          `${folder}${entry.file}`,
          entry.typeKey === signingTypeKeys.agreement
            ? signingAgreementSamples()
            : trainingSheetSamples(entry.typeKey.endsWith('_psi') ? 'psi' : 'ssm'),
        ])
    )
);
for (const { folder, name } of files) {
  const template = new Uint8Array(readFileSync(`${folder}${name}`));
  for (const { label, data } of employeeSamples.get(`${folder}${name}`) ?? samples) {
    try {
      writeFileSync(
        `${output}${name.replace(/\.docx$/, '')}.${label}.docx`,
        renderDocument(template, data)
      );
    } catch (error) {
      if (!(error instanceof TemplateError)) throw error;
      console.warn(`${name} (${label}) skipped: ${error.message}`);
    }
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
