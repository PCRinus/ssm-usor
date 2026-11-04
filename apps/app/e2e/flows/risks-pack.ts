import {
  gravityConsequence,
  type PreventionMeasureKind,
  riskLevel,
  type WorkSystemComponent,
} from '@ssm-usor/contracts';
import {
  type LibraryEvaluation,
  proposeRisks,
  type ReadFactor,
  type ReadSheet,
  type RisksProposal,
} from '@ssm-usor/import';

import { workshopEvaluation } from '../../../api/src/modules/documents/risk-evaluations.fixture';

// An invented hotel's pack: its risk evaluation and prevention plan as the reading would have
// copied them.

export const hotel = {
  legalName: 'HOTEL ROYAL MAMAIA S.R.L.',
  name: 'Hotel Royal',
  cui: '14523987',
  posts: ['Recepționer', 'Bucătar', 'Cameristă'],
};

const file = 'Dosar/Evaluarea riscurilor Hotel Royal.docx';

const writtenComponents: Record<WorkSystemComponent, string> = {
  means_of_production: 'MIJLOACE DE PRODUCȚIE',
  work_environment: 'MEDIUL DE MUNCĂ',
  work_task: 'SARCINA DE MUNCĂ',
  executant: 'EXECUTANT',
};

type Written = {
  component: WorkSystemComponent;
  group: string;
  description: string;
  gravity: number | null;
  probability: number | null;
  measures?: [PreventionMeasureKind, string][];
} & Partial<Pick<ReadFactor, 'flags' | 'printedLevel' | 'consequence' | 'responsiblePerson'>>;

let rows = 0;

function factor(sheet: string, index: number, written: Written): ReadFactor {
  const { gravity, probability } = written;
  const grid = gravity !== null && probability !== null ? riskLevel(gravity, probability) : null;
  return {
    key: `${sheet}.${index}`,
    row: `R${(rows += 1)}`,
    source: { file, start: 0, end: 0 },
    component: written.component,
    writtenComponent: writtenComponents[written.component],
    group: written.group,
    description: written.description,
    code: `F${index}.`,
    consequence: written.consequence ?? (gravity !== null ? gravityConsequence(gravity) : ''),
    gravityClass: gravity,
    probabilityClass: probability,
    printedLevel: written.printedLevel ?? grid,
    measures: (written.measures ?? []).map(([kind, description]) => ({ kind, description })),
    measuresFrom: written.measures ? 'plan' : null,
    actions: written.measures ? 'Instruirea lucrătorilor și verificarea aplicării măsurilor' : null,
    deadline: 'Permanent',
    responsiblePerson: written.responsiblePerson ?? 'Administrator',
    observations: null,
    flags: written.flags ?? [],
  };
}

function sheet(
  key: string,
  heading: string,
  kind: ReadSheet['kind'],
  posts: string[],
  factors: Written[]
): ReadSheet {
  return {
    key,
    file,
    heading,
    kind,
    name: heading.replace(/^Fișa de evaluare( a locului de muncă)?:?\s*/u, ''),
    posts,
    rows: { first: `R${rows + 1}`, last: `R${rows + factors.length}` },
    meansOfProduction: 'Calculator, imprimantă, telefon, mobilier de birou.',
    workEnvironment: 'Spațiu închis, iluminat natural și artificial, climatizat.',
    exposure: '8 h / schimb',
    factors: factors.map((written, index) => factor(key, index + 1, written)),
    flags: [],
  };
}

export const cook: Written[] = [
  {
    component: 'means_of_production',
    group: 'Riscuri termice',
    description: 'Arsuri prin atingerea suprafețelor fierbinți ale plitei și cuptorului',
    gravity: 3,
    probability: 4,
    measures: [['technical', 'Mănuși termoizolante la îndemână lângă plită']],
  },
  {
    component: 'means_of_production',
    group: 'Riscuri mecanice',
    description: 'Tăiere cu cuțitele și cu feliatorul de mezeluri',
    gravity: 3,
    probability: 4,
    measures: [['organizational', 'Instruirea privind folosirea feliatorului']],
  },
  {
    component: 'work_environment',
    group: 'Microclimat',
    description: 'Temperatură ridicată în bucătărie în timpul verii',
    gravity: 2,
    probability: 5,
  },
  {
    component: 'work_task',
    group: 'Efort fizic',
    description: 'Ridicarea și transportul manual al vaselor mari cu alimente',
    gravity: 3,
    probability: 3,
  },
  {
    component: 'executant',
    group: 'Acțiuni greșite',
    description: 'Alunecare pe pardoseala udă sau unsuroasă a bucătăriei',
    gravity: 3,
    probability: 4,
  },
];

const receptionist: Written[] = [
  {
    component: 'means_of_production',
    group: 'Riscuri electrice',
    description: 'Atingerea elementelor aflate sub tensiune la prizele și prelungitoarele defecte',
    gravity: 4,
    probability: 2,
    measures: [
      [
        'technical',
        'Verificarea periodică a instalației electrice de către un electrician autorizat',
      ],
      ['organizational', 'Interzicerea folosirii prelungitoarelor improvizate'],
    ],
  },
  {
    component: 'means_of_production',
    group: 'Riscuri mecanice',
    description: 'Lovirea de colțurile mobilierului de la recepție',
    gravity: 2,
    probability: 3,
    responsiblePerson: 'Ionescu Maria',
    flags: [{ kind: 'person_named', field: 'responsiblePerson', text: 'Ionescu Maria' }],
  },
  {
    component: 'work_environment',
    group: 'Microclimat',
    description: 'Curenți de aer la deschiderea ușii de la intrarea principală',
    gravity: 2,
    probability: 5,
    printedLevel: 2,
    flags: [{ kind: 'level_mismatch', printed: 2, grid: riskLevel(2, 5) }],
  },
  {
    component: 'work_task',
    group: 'Suprasolicitare psihică',
    description: 'Relația cu clienții nemulțumiți sau agresivi',
    gravity: 3,
    probability: 3,
    consequence: 'Invaliditate gradul III',
    flags: [
      {
        kind: 'consequence_mismatch',
        consequence: 'Invaliditate gradul III',
        consequenceClass: 4,
      },
    ],
  },
  {
    component: 'work_task',
    group: 'Conținut necorespunzător',
    description: 'Ritm de lucru intens la sosirea grupurilor de turiști',
    gravity: 2,
    probability: 5,
  },
  {
    component: 'executant',
    group: 'Acțiuni greșite',
    description: 'Deplasarea pe scări cu bagajele clienților',
    gravity: null,
    probability: 3,
    consequence: '',
    flags: [{ kind: 'class_missing', field: 'gravity', written: '' }],
  },
];

const chambermaid: Written[] = [
  {
    component: 'work_task',
    group: 'Efort fizic',
    description: 'Ridicarea saltelelor la schimbarea lenjeriei',
    gravity: 3,
    probability: 4,
  },
  {
    component: 'means_of_production',
    group: 'Substanțe chimice',
    description: 'Contactul pielii cu substanțele de curățenie iritante',
    gravity: 2,
    probability: 5,
    measures: [
      ['other', 'Mănuși de protecție din nitril'],
      ['organizational', 'Fișele cu date de securitate afișate în oficiu'],
    ],
    flags: [{ kind: 'measure_kind_guessed' }],
  },
  {
    component: 'executant',
    group: 'Acțiuni greșite',
    description: 'Împiedicarea de cablul aspiratorului',
    gravity: 3,
    probability: 3,
  },
];

const sensitive: Written[] = [
  {
    component: 'work_task',
    group: 'Efort fizic',
    description: 'Statul prelungit în picioare al lucrătoarelor gravide',
    gravity: 2,
    probability: 4,
  },
  {
    component: 'work_environment',
    group: 'Microclimat',
    description: 'Lucrul tinerilor în bucătărie, la temperaturi ridicate',
    gravity: 2,
    probability: 4,
  },
];

const visitors: Written[] = [
  {
    component: 'work_environment',
    group: 'Suprafețe de deplasare',
    description: 'Alunecarea pe pardoseala holului după curățenie',
    gravity: 3,
    probability: 3,
  },
  {
    component: 'work_environment',
    group: 'Circulație',
    description: 'Lovirea de cărucioarele de bagaje lăsate pe hol',
    gravity: 2,
    probability: 3,
  },
];

const roomService: Written[] = [
  {
    component: 'work_task',
    group: 'Efort fizic',
    description: 'Transportul tăvilor încărcate pe scări',
    gravity: 2,
    probability: 4,
  },
  {
    component: 'means_of_production',
    group: 'Riscuri termice',
    description: 'Opărirea cu băuturile fierbinți servite în camere',
    gravity: 3,
    probability: 3,
  },
];

// The library's Bucătar: one factor of the pack's swapped for another, and one class other.
export const libraryCook: Written[] = [
  ...cook.slice(0, 1),
  { ...cook[1]!, gravity: 4 },
  ...cook.slice(2, 4),
  {
    component: 'means_of_production',
    group: 'Riscuri electrice',
    description: 'Electrocutarea la atingerea aparatelor electrice cu mâinile ude',
    gravity: 4,
    probability: 2,
  },
];

export const chambermaidExisting = workshopEvaluation.factors.length;

const planFile = 'Dosar/Planul de prevenire și protecție Hotel Royal.docx';

// A plan row that pairs with no factor, written out as the reading writes it: the plan gives no
// component, group or classes.
function planRow(
  row: string,
  risk: string,
  measures: [PreventionMeasureKind, string][],
  fields: Pick<ReadFactor, 'actions' | 'deadline' | 'responsiblePerson'>
) {
  const factor: ReadFactor = {
    key: `plan-${row}`,
    row,
    source: { file: planFile, start: 0, end: 0 },
    component: null,
    writtenComponent: '',
    group: '',
    description: risk,
    code: null,
    consequence: '',
    gravityClass: null,
    probabilityClass: null,
    printedLevel: null,
    measures: measures.map(([kind, description]) => ({ kind, description })),
    measuresFrom: 'plan',
    ...fields,
    observations: null,
    flags: [],
  };
  return {
    row,
    file: planFile,
    text: `| RECEPȚIONER HOTEL | ${risk} | ${measures.map(([, text]) => text).join(' / ')} | ${fields.actions ?? '--'} | ${fields.deadline ?? '--'} | ${fields.responsiblePerson ?? '--'} |`,
    post: 'RECEPȚIONER HOTEL',
    risk,
    sheet: 'receptionist',
    factor,
  };
}

export const protectiveEquipmentRow =
  'Neutilizarea echipamentului individual de protecție și a celorlalte mijloace de protecție din dotare.';
export const firstAidRow = 'Lipsa trusei de prim ajutor din spațiile de birou';

export function hotelRisks(library: LibraryEvaluation[]): RisksProposal {
  rows = 0;
  const sheets = [
    sheet(
      'receptionist',
      'Fișa de evaluare: Recepționer',
      'job_position',
      ['Recepționer'],
      receptionist
    ),
    sheet('cook', 'Fișa de evaluare: Bucătar', 'job_position', ['Bucătar'], cook),
    sheet('chambermaid', 'Fișa de evaluare: Cameristă', 'job_position', ['Cameristă'], chambermaid),
    sheet(
      'room-service',
      'Fișa de evaluare: Ospătar room-service',
      'job_position',
      [],
      roomService
    ),
    sheet('sensitive', 'Grupuri sensibile la riscuri', 'sensitive_groups', [], sensitive),
    sheet('visitors', 'Fișa de evaluare: Vizitatori', 'other', [], visitors),
  ];
  return proposeRisks({
    read: {
      sheets,
      unplacedRows: [
        {
          row: 'R90',
          file,
          text: '| F27. | Expunere la zgomot în spălătorie | Hipoacuzie | 2 | 4 | 3 |',
        },
      ],
      unmatchedPlanRows: [
        planRow('R112', protectiveEquipmentRow, [['organizational', 'Instruirea personalului']], {
          actions: 'Alocarea fondurilor materiale necesare',
          deadline: 'Periodic',
          responsiblePerson: 'Cond. loc muncă; Serv extern',
        }),
        planRow(
          'R113',
          firstAidRow,
          [['organizational', 'Dotarea recepției cu o trusă de prim ajutor completă']],
          { actions: null, deadline: 'Imediat', responsiblePerson: 'Administrator' }
        ),
        {
          row: 'R120',
          file,
          text: '| Spălătorie | Zgomot | Montarea de amortizoare la mașinile de spălat | Anual | Administrator |',
          post: 'Spălătorie',
          risk: 'Zgomot',
          sheet: null,
          factor: null,
        },
      ],
      unmatchedMeasureRows: [],
    },
    posts: hotel.posts,
    library,
    takenNames: library.map((entry) => entry.name),
    client: { name: hotel.name },
    existing: { posts: { Cameristă: chambermaidExisting } },
  });
}
