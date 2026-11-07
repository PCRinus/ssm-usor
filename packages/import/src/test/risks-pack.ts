// An invented risk assessment and prevention plan, in the reference packs' layout; no text here
// comes from a real one.
import type { RisksAnswer } from '../risks-request';
import type { RisksTextFile } from '../risks-rows';

const header =
  '| COMPONENTA SISTEMULUI DE MUNCĂ | FACTORI DE RISC / IDENTIFICAŢI | FORMA CONCRETĂ DE / MANIFESTARE | CONSECINŢA MAXIMĂ / PREVIZIBILĂ | CLASA DE GRAVITATE | CLASA DE PROBABI-LITATE | NIVEL DE RISC |';
const numbers = '| 0 | 1 | 2 | 3 | 4 | 5 | 6 |';

export const assessmentPath = 'SSM/9._Evaluarea_riscurilor.docx';
export const planPath = 'SSM/10._Plan_de_prevenire.doc';
export const scannedPath = 'SSM/9._Evaluare_veche.pdf';

const bakerFactors = [
  '| MIJLOACE DE PRODUCŢIE | Factori de risc mecanic | F1. Prinderea degetelor în malaxorul de aluat pornit. | ITM / 45-180 zile | 3 | 3 | 3 |',
  '|  |  | F2. Tăierea mâinilor cu cuțitul de feliat pâine. | ITM / 3-45 zile | 2 | 5 | 3 |',
  '|  | Factori de risc termic | F3. Arsuri la scoaterea tăvilor din cuptor. | ITM / 3-45 zile | 2 | 5 | 4 |',
  '| MEDIUL / DE MUNCĂ | Factori de risc fizic | F4. Temperatură ridicată lângă cuptor vara. | Minore reversibile | 1 | 6 | 1 |',
  '| EXECUTANT | Acţiuni greşite | F5. Cădere pe pardoseala udă din brutărie. | ITM / 3-45 zile | 3 | 4 | 3 |',
  '|  | Omisiuni | F6. Nu oprește malaxorul înainte de curățare. | Invalid. Grad II | 5 | 2 | 4 |',
  '| SARCINA / DE MUNCĂ | Suprasolicitare fizica | F7. Ridicarea sacilor de făină de 50 kg. | ITM / 3-45 zile | 2 |  | 2 |',
];

const bakerSheet = [
  'SUBCAPITOLUL V.I. EVALUAREA RISCURILOR PENTRU LOCUL DE MUNCĂ : BRUTĂRIE,',
  'POSTUL DE LUCRU : BRUTAR.',
  'Elementele componente ale sistemului de muncă evaluat sunt :',
  '2. Mijloace de producţie :',
  'Cuptor electric cu trei vetre, malaxor de aluat, masă de inox, cuțite de feliat și tăvi de copt.',
  '4. Mediul de muncă :',
  'Brutăria are ferestre spre curte și ventilație mecanică deasupra cuptorului.',
  'II. IDENTIFICAREA FACTORILOR DE RISC SPECIFICI LOCULUI DE MUNCA :',
  '| UNITATEA : | FIŞA DE EVALUARE A LOCULUI DE MUNCĂ | NUMĂR PERSOANE EXPUSE : | 3 persoane |',
  '| SECTOR : |  | DURATA EXPUNERII : | 8h / schimb |',
  header,
  numbers,
  ...bakerFactors,
  '',
  'IV. FIŞA DE MĂSURI PROPUSE PENTRU LOCUL DE MUNCĂ : BRUTĂRIE, POSTUL DE LUCRU : BRUTAR.',
  '| Nr. / Crt. | FACTOR DE RISC | NIVEL DE RISC | MĂSURI PROPUSE |',
  '| 1 | F3. Arsuri la scoaterea tăvilor din cuptor. | 4 | Măsuri tehnice: Mănuși termorezistente la fiecare cuptor. Măsuri organizatorice: Instruirea brutarilor la angajare. |',
  '| 2 | F6. Nu oprește malaxorul înainte de curățare. | 4 | Montarea unui limitator la capacul malaxorului. / Instruirea brutarilor privind / oprirea malaxorului. / Control medical periodic. |',
  '',
];

const shopSheet = [
  'SUBCAPITOLUL V.II. EVALUAREA RISCURILOR PENTRU LOCUL DE MUNCĂ : MAGAZIN, POSTUL DE LUCRU : VÂNZĂTOR , CASIER',
  '2. Mijloace de producţie :',
  'Casa de marcat, cântarul electronic și rafturile magazinului.',
  '4. Mediul de muncă :',
  'Magazin cu vitrină spre stradă, încălzit iarna cu aeroterme.',
  '| SECTOR : |  | DURATA EXPUNERII : | 6h / schimb |',
  header,
  numbers,
  '| MIJLOACE DE PRODUCŢIE | Factori de risc electric | F1. Electrocutare la atingerea cântarului cu cablul deteriorat. | Deces | 7 | 1 | 3 |',
  '| MEDIUL / DE MUNCĂ | Factori de risc fizic | F2. Curenți de aer la ușa magazinului. | Minore reversibile | 1 | 4 | 1 |',
  '| EXECUTANT | Acţiuni greşite | F3. Lovirea de rafturi la aranjarea mărfii. | ITM / 3-45 zile | 2 | 3 | 2 |',
  '',
];

const sensitiveSheet = [
  'SUBCAPITOLUL V.III. EVALUAREA RISCURILOR PENTRU LOCUL DE MUNCĂ : GRUPURI SENSIBILE',
  'POSTUL DE LUCRU : ( FEMEI GRAVIDE , TINERII , PERSOANELE CU DIZABILITATI)',
  header,
  numbers,
  ...bakerFactors,
  '',
];

const visitorSheet = [
  'SUBCAPITOLUL V.IV. EVALUAREA RISCURILOR PENTRU LOCUL DE MUNCĂ : MAGAZIN ; POSTUL DE LUCRU : VIZITATOR',
  header,
  '| MEDIUL / DE MUNCĂ | Factori de risc fizic | F1. Alunecare pe gresia udă la intrare. | ITM / 3-45 zile | 2 | 2 | 2 |',
  '| ZONA EXTERIOARĂ | Factori de risc mecanic | F2. Lovire de ușa automată. | ITM / 3-45 zile | 2 | 1 | 1 |',
  '',
  'VI.I. IERARHIZAREA RISCURILOR EVALUATE',
  '| 1 | F 6 | Nu oprește malaxorul înainte de curățare. | 4 |',
  '| 9 | MIJLOACE DE PRODUCŢIE | F9. Factor uitat în afara fișei. | ITM / 3-45 zile | 2 | 2 | 2 |',
];

export const assessment: RisksTextFile = {
  path: assessmentPath,
  text: [
    'EVALUAREA RISCURILOR DE ACCIDENTARE SI/ SAU IMBOLNAVIRE PROFESIONALA PENTRU S.C. BRUTĂRIA DIN CURTE S.R.L.',
    '| Nr. crt. | Nr. pagina | Capitol |',
    '|  | 1 – 1 | Coperta |',
    '',
    ...bakerSheet,
    ...shopSheet,
    ...sensitiveSheet,
    ...visitorSheet,
  ].join('\n'),
};

export const plan: RisksTextFile = {
  path: planPath,
  text: [
    'PLANUL DE PREVENIRE SI PROTECTIE',
    '| Nr. / crt. | Loc de munca / Post de lucru | Riscuri evaluate | Masuri tehnice | Masuri organizatorice | Masuri igienico-sanitare | Masuri de alta natura | Actiuni | Termen | Persoana care raspunde | Observatii |',
    '|  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |',
    '| 1 | BRUTĂRIA DIN CURTE / / BRUTAR | Prinderea degetelor in malaxorul de aluat pornit | Protecția de la gura malaxorului. | Instruire asupra / folosirii malaxorului; / Afișarea instrucțiunii. | -- | -- | Revizuirea instrucțiunii. | Imediat / Periodic | Cond. / loc / munca / Serv extern | -- |',
    '| 2 |  | Taierea mainilor cu cutitul / Arsuri la scoaterea tavilor din cuptor | -- | Instruirea brutarilor. | Trusa de prim ajutor | Manusi | -- | Periodic | Ion POPESCU | -- |',
    '| 3 |  | Zgomot de la hota de evacuare | Izolarea hotei. | -- | -- | -- | -- | Anual | Administrator | -- |',
  ].join('\n'),
};

export const scanned: RisksTextFile = {
  path: scannedPath,
  text: [
    'SUBCAPITOLUL V.I. EVALUAREA RISCURILOR PENTRU POSTUL DE LUCRU : CURIER',
    'COMPONENTA FACTORI FORMA CONCRETĂ CONSECINȚA GRAVITATE PROBABILITATE NIVEL',
    'MIJLOACE DE PRODUCȚIE Factori de risc mecanic F1. Accident rutier cu bicicleta de livrare. Deces 7 2 4',
    'F2. Lovire de ușa clădirii la livrare. ITM 3-45 zile 2 3 2',
  ].join('\n'),
};

const sheetColumns = {
  component: 1,
  group: 2,
  description: 3,
  consequence: 4,
  gravity: 5,
  probability: 6,
  level: 7,
};

const none = { startWords: '', endWords: '' };

export const unplanned = {
  measuresFrom: null,
  measures: [],
  actions: null,
  deadline: null,
  responsiblePerson: null,
  observations: null,
};

// The answer a model would give for `assessment` and `plan`, with the rows numbered as
// `numberRows([assessment, plan])` numbers them.
export const answer: RisksAnswer = {
  sheets: [
    {
      file: assessmentPath,
      heading: 'SUBCAPITOLUL V.I. EVALUAREA RISCURILOR PENTRU LOCUL DE MUNCĂ : BRUTĂRIE,',
      kind: 'job_position',
      name: 'BRUTAR',
      posts: ['Brutar'],
      workName: 'Producție de panificație',
      firstRow: 'R7',
      lastRow: 'R13',
      columns: sheetColumns,
      meansOfProduction: {
        startWords: 'Cuptor electric cu trei vetre',
        endWords: 'cuțite de feliat și tăvi de copt.',
      },
      workEnvironment: {
        startWords: 'Brutăria are ferestre spre curte',
        endWords: 'ventilație mecanică deasupra cuptorului.',
      },
      exposure: { startWords: '8h / schimb', endWords: '8h / schimb' },
      factorCount: null,
      factors: [],
    },
    {
      file: assessmentPath,
      heading:
        'SUBCAPITOLUL V.II. EVALUAREA RISCURILOR PENTRU LOCUL DE MUNCĂ : MAGAZIN, POSTUL DE LUCRU : VÂNZĂTOR , CASIER',
      kind: 'job_position',
      name: 'VÂNZĂTOR , CASIER',
      posts: ['Vânzător', 'casier'],
      workName: 'Vânzare în magazin',
      firstRow: 'R20',
      lastRow: 'R22',
      columns: sheetColumns,
      meansOfProduction: { startWords: 'Casa de marcat', endWords: 'rafturile magazinului.' },
      workEnvironment: { startWords: 'Magazin cu vitrină', endWords: 'iarna cu aeroterme.' },
      exposure: { startWords: '6h / schimb', endWords: '6h / schimb' },
      factorCount: null,
      factors: [],
    },
    {
      file: assessmentPath,
      heading: 'SUBCAPITOLUL V.III. EVALUAREA RISCURILOR PENTRU LOCUL DE MUNCĂ : GRUPURI SENSIBILE',
      kind: 'sensitive_groups',
      name: 'GRUPURI SENSIBILE',
      posts: [],
      workName: null,
      firstRow: 'R25',
      lastRow: 'R31',
      columns: sheetColumns,
      meansOfProduction: none,
      workEnvironment: none,
      exposure: none,
      factorCount: null,
      factors: [],
    },
    {
      file: assessmentPath,
      heading:
        'SUBCAPITOLUL V.IV. EVALUAREA RISCURILOR PENTRU LOCUL DE MUNCĂ : MAGAZIN ; POSTUL DE LUCRU : VIZITATOR',
      kind: 'other',
      name: 'VIZITATOR',
      posts: [],
      workName: null,
      firstRow: 'R33',
      lastRow: 'R34',
      columns: sheetColumns,
      meansOfProduction: {
        startWords: 'Ușa automată a magazinului',
        endWords: 'se deschide singură',
      },
      workEnvironment: none,
      exposure: none,
      factorCount: null,
      factors: [],
    },
  ],
  measures: [
    { row: 'R15', factorRow: 'R9', column: 4, parts: [] },
    {
      row: 'R16',
      factorRow: 'R12',
      column: 4,
      parts: [
        { kind: 'technical', startWords: 'Montarea unui limitator' },
        { kind: 'organizational', startWords: 'Instruirea brutarilor privind' },
        { kind: 'hygienic_sanitary', startWords: 'Control medical periodic' },
      ],
    },
  ],
  planTables: [
    {
      file: planPath,
      firstRow: 'R39',
      lastRow: 'R41',
      columns: {
        post: 2,
        risk: 3,
        technical: 4,
        organizational: 5,
        hygienicSanitary: 6,
        other: 7,
        actions: 8,
        deadline: 9,
        responsible: 10,
        observations: 11,
      },
    },
  ],
  plan: [
    { row: 'R39', factorRows: ['R7'] },
    { row: 'R40', factorRows: ['R8', 'R9'] },
    { row: 'R41', factorRows: [] },
  ],
};
