import type { PreventionMeasureKind, WorkSystemComponent } from '@ssm-usor/contracts';

// Sample evaluations for tests, the local seed and the browser flows. Written for them, not
// taken from a provider's pack: the app ships no risk text (ADR 015).

export type RiskFactorFixture = {
  component: WorkSystemComponent;
  group: string;
  description: string;
  gravityClass: number;
  probabilityClass: number;
  measures: { kind: PreventionMeasureKind; description: string }[];
  actions: string | null;
  deadline: string | null;
  responsiblePerson: string | null;
  observations: string | null;
};

export type RiskEvaluationFixture = {
  meansOfProduction: string;
  workEnvironment: string;
  exposure: string;
  factors: RiskFactorFixture[];
};

const factor = (
  component: WorkSystemComponent,
  group: string,
  description: string,
  [gravityClass, probabilityClass]: [number, number],
  measures: RiskFactorFixture['measures'] = [],
  plan: Partial<
    Pick<RiskFactorFixture, 'actions' | 'deadline' | 'responsiblePerson' | 'observations'>
  > = {}
): RiskFactorFixture => ({
  component,
  group,
  description,
  gravityClass,
  probabilityClass,
  measures,
  actions: plan.actions ?? null,
  deadline: plan.deadline ?? null,
  responsiblePerson: plan.responsiblePerson ?? null,
  observations: plan.observations ?? null,
});

const technical = (description: string) => ({ kind: 'technical' as const, description });
const organizational = (description: string) => ({ kind: 'organizational' as const, description });
const hygienic = (description: string) => ({ kind: 'hygienic_sanitary' as const, description });
const other = (description: string) => ({ kind: 'other' as const, description });

const manager = 'Conducătorul locului de muncă';
const administrator = 'Administratorul';
const teamLeader = 'Șeful de echipă';

export const officeEvaluation: RiskEvaluationFixture = {
  meansOfProduction:
    'Calculator, monitor, imprimantă, telefon, mobilier de birou, rafturi și documente.',
  workEnvironment:
    'Birou închis, cu iluminat natural și artificial, încălzit iarna și climatizat vara.',
  exposure: '8 h / schimb',
  factors: [
    factor(
      'means_of_production',
      'Factori de risc electric',
      'Electrocutare prin atingere directă la prize, prelungitoare sau echipamente cu izolația deteriorată.',
      [7, 1],
      [
        technical(
          'Verificarea periodică a instalației electrice de către un electrician autorizat.'
        ),
        organizational(
          'Interzicerea intervențiilor la instalația electrică de către persoane neautorizate.'
        ),
      ],
      { deadline: 'Permanent', responsiblePerson: administrator }
    ),
    factor(
      'means_of_production',
      'Factori de risc electric',
      'Electrocutare prin atingere indirectă, la defectarea împământării unui echipament.',
      [5, 2],
      [
        technical('Măsurarea anuală a rezistenței prizei de pământ (buletin PRAM).'),
        organizational(
          'Anunțarea imediată a conducătorului locului de muncă la orice defect electric.'
        ),
      ],
      {
        actions: 'Contractarea verificării PRAM cu o firmă autorizată.',
        deadline: 'Anual',
        responsiblePerson: administrator,
      }
    ),
    factor(
      'means_of_production',
      'Factori de risc mecanic',
      'Lovire de colțurile mobilierului sau de sertarele lăsate deschise.',
      [2, 3]
    ),
    factor(
      'means_of_production',
      'Factori de risc mecanic',
      'Căderea obiectelor așezate pe rafturile înalte.',
      [2, 2]
    ),
    factor(
      'work_environment',
      'Factori de risc fizic',
      'Iluminat insuficient sau reflexii pe ecran, care obosesc vederea.',
      [2, 4],
      [technical('Așezarea monitoarelor perpendicular pe ferestre și folosirea jaluzelelor.')],
      { deadline: '30 de zile', responsiblePerson: manager }
    ),
    factor(
      'work_environment',
      'Factori de risc fizic',
      'Temperatură necorespunzătoare în birou, vara sau iarna.',
      [1, 4]
    ),
    factor(
      'executant',
      'Acțiuni greșite',
      'Cădere la același nivel prin împiedicare de cablurile lăsate pe pardoseală.',
      [3, 3],
      [organizational('Fixarea cablurilor de-a lungul pereților, în afara căilor de trecere.')],
      { deadline: 'Permanent', responsiblePerson: manager }
    ),
    factor(
      'executant',
      'Acțiuni greșite',
      'Accident de circulație pe drumul dintre domiciliu și locul de muncă sau în deplasările de serviciu.',
      [7, 2],
      [
        organizational('Instruirea lucrătorilor privind circulația pe drumurile publice.'),
        other('Planificarea deplasărilor de serviciu astfel încât să nu fie făcute în grabă.'),
      ],
      {
        deadline: 'Permanent',
        responsiblePerson: manager,
        observations: 'Se reia la instruirea periodică.',
      }
    ),
    factor(
      'executant',
      'Omisiuni',
      'Neanunțarea defecțiunilor observate la echipamentele de lucru.',
      [2, 3]
    ),
    factor(
      'work_task',
      'Suprasolicitare fizică',
      'Poziție șezând prelungită la calculator, cu dureri de spate și ale încheieturilor.',
      [2, 5],
      [
        technical('Scaune reglabile pe înălțime, cu spătar.'),
        hygienic('Pauze de 10 minute la fiecare două ore de lucru la calculator.'),
      ],
      { deadline: 'Permanent', responsiblePerson: manager }
    ),
    factor(
      'work_task',
      'Suprasolicitare psihică',
      'Ritm de lucru intens și termene scurte.',
      [2, 4]
    ),
  ],
};

export const workshopEvaluation: RiskEvaluationFixture = {
  meansOfProduction:
    'Scule de mână, polizor unghiular, bormașină, mașini-unelte, piese și materiale de prelucrat.',
  workEnvironment: 'Hală de producție cu iluminat mixt, zgomot și pulberi, ventilată natural.',
  exposure: '8 h / schimb',
  factors: [
    factor(
      'means_of_production',
      'Factori de risc mecanic',
      'Prinderea mâinilor sau a îmbrăcămintei de elementele în mișcare ale mașinilor neprotejate.',
      [5, 3],
      [
        technical('Montarea și păstrarea apărătorilor la toate elementele în mișcare.'),
        organizational('Interzicerea îmbrăcămintei largi și a bijuteriilor lângă mașini.'),
      ],
      {
        actions: 'Verificarea apărătorilor la începutul fiecărui schimb.',
        deadline: 'Zilnic',
        responsiblePerson: teamLeader,
      }
    ),
    factor(
      'means_of_production',
      'Factori de risc mecanic',
      'Tăiere sau înțepare cu sculele de mână ori cu muchiile pieselor.',
      [2, 5],
      [technical('Mănuși de protecție mecanică.')],
      { deadline: 'Permanent', responsiblePerson: teamLeader }
    ),
    factor(
      'means_of_production',
      'Factori de risc mecanic',
      'Proiectarea de așchii sau de fragmente de disc la lucrul cu polizorul unghiular.',
      [4, 3],
      [
        technical('Folosirea polizorului numai cu apărătoarea discului montată.'),
        technical('Ochelari de protecție.'),
        organizational('Instruirea pentru alegerea și schimbarea discurilor.'),
      ],
      {
        deadline: 'Imediat',
        responsiblePerson: teamLeader,
        observations: 'Discurile se păstrează ferite de umezeală.',
      }
    ),
    factor(
      'means_of_production',
      'Factori de risc electric',
      'Electrocutare prin atingere directă la sculele electrice portabile cu cablul deteriorat.',
      [7, 2],
      [
        technical('Verificarea sculelor electrice portabile înainte de fiecare folosire.'),
        organizational('Scoaterea din uz a sculelor cu cablul sau carcasa deteriorată.'),
      ],
      { deadline: 'Permanent', responsiblePerson: 'Electricianul autorizat' }
    ),
    factor(
      'work_environment',
      'Factori de risc fizic',
      'Zgomot peste valorile de expunere, în timpul funcționării mașinilor.',
      [3, 4],
      [
        technical('Antifoane pentru lucrul lângă mașinile zgomotoase.'),
        hygienic('Audiogramă la examenul medical periodic.'),
      ],
      { deadline: 'Anual', responsiblePerson: administrator }
    ),
    factor(
      'work_environment',
      'Factori de risc chimic',
      'Pulberi rezultate la șlefuire și la debitare.',
      [3, 3]
    ),
    factor(
      'work_environment',
      'Factori de risc fizic',
      'Iluminat insuficient la unele posturi de lucru.',
      [2, 3]
    ),
    factor(
      'executant',
      'Acțiuni greșite',
      'Ridicarea și transportul manual al unor sarcini prea grele sau în poziții forțate.',
      [3, 5],
      [
        organizational('Manipularea sarcinilor de peste 25 kg de către două persoane.'),
        technical('Cărucioare pentru transportul pieselor.'),
      ],
      { deadline: '30 de zile', responsiblePerson: teamLeader }
    ),
    factor(
      'executant',
      'Acțiuni greșite',
      'Cădere la același nivel pe pardoseala murdară de ulei sau aglomerată cu materiale.',
      [3, 3]
    ),
    factor(
      'executant',
      'Omisiuni',
      'Nepurtarea echipamentului individual de protecție primit.',
      [3, 4],
      [organizational('Controlul purtării echipamentului la începutul schimbului.')],
      { deadline: 'Zilnic', responsiblePerson: teamLeader }
    ),
    factor(
      'work_task',
      'Suprasolicitare fizică',
      'Lucru în picioare pe toată durata schimbului.',
      [2, 5]
    ),
    factor(
      'work_task',
      'Alte riscuri',
      'Executarea unor operații pentru care lucrătorul nu a fost instruit.',
      [4, 2]
    ),
  ],
};

export const sensitiveGroupsEvaluation: RiskEvaluationFixture & {
  workTask: string;
  exposedPersons: string;
} = {
  workTask:
    'Activitățile postului ocupat, adaptate: fără ridicarea de greutăți, fără muncă de noapte și fără expunere la substanțe periculoase.',
  exposedPersons: 'După caz, la data evaluării',
  meansOfProduction: 'Echipamentele de muncă ale postului ocupat.',
  workEnvironment: 'Mediul de muncă al postului ocupat.',
  exposure: '8 h / schimb',
  factors: [
    factor(
      'means_of_production',
      'Factori de risc mecanic',
      'Accidentarea persoanelor cu dizabilități pe căile de acces neadaptate (praguri, trepte).',
      [3, 3],
      [technical('Semnalizarea pragurilor și a treptelor.')],
      { deadline: '60 de zile', responsiblePerson: administrator }
    ),
    factor(
      'work_environment',
      'Factori de risc fizic',
      'Temperaturi extreme în spațiile de lucru.',
      [2, 3]
    ),
    factor(
      'work_environment',
      'Factori de risc biologic',
      'Contact cu persoane bolnave, cu risc de infectare.',
      [3, 3]
    ),
    factor(
      'executant',
      'Acțiuni greșite',
      'Executarea de către tineri, fără supraveghere, a unor operații periculoase.',
      [5, 2],
      [
        organizational('Lucrul tinerilor numai sub supravegherea unui lucrător cu experiență.'),
        organizational('Instruire suplimentară a tinerilor la angajare.'),
      ],
      { deadline: 'Permanent', responsiblePerson: manager }
    ),
    factor(
      'work_task',
      'Suprasolicitare fizică',
      'Ridicarea și transportul de greutăți de către lucrătoarea gravidă.',
      [4, 3],
      [
        organizational(
          'Repartizarea lucrătoarei gravide la activități fără manipularea de greutăți.'
        ),
        hygienic(
          'Evaluarea aptitudinii de către medicul de medicina muncii după anunțarea sarcinii.'
        ),
      ],
      { deadline: 'La anunțarea sarcinii', responsiblePerson: administrator }
    ),
    factor(
      'work_task',
      'Suprasolicitare fizică',
      'Statul prelungit în picioare sau în aceeași poziție.',
      [2, 4]
    ),
    factor(
      'work_task',
      'Suprasolicitare psihică',
      'Muncă de noapte sau program prelungit pentru tineri și lucrătoare gravide.',
      [3, 3],
      [
        organizational(
          'Interzicerea muncii de noapte pentru tineri și pentru lucrătoarele gravide.'
        ),
      ],
      { deadline: 'Permanent', responsiblePerson: administrator }
    ),
  ],
};
