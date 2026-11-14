/** Prices are in euro, without VAT. */
import { links } from './copy';

export type BillingPeriod = 'monthly' | 'annual';

export interface PlanLine {
  text: string;
  /** Must occur in `text`; that part is shown in bold. */
  bold?: string;
}

export interface SteppedPlan {
  id: 'start' | 'profesional';
  name: string;
  who: string;
  users: number;
  /** Ascending; each is the most workers the plan covers at that price. */
  steps: number[];
  firstPrice: number;
  /** Added to the monthly price for every `priceUnit` workers above the first step. */
  unitPrice: number;
  priceUnit: number;
  lines: PlanLine[];
}

export interface QuotedPlan {
  id: 'enterprise';
  name: string;
  who: string;
  ask: string;
  askNote: string;
  lines: PlanLine[];
}

const quoteSubject = encodeURIComponent('Ofertă Enterprise SSM Ușor');

export const trialDays = 14;

export const pricingCta = {
  label: 'Anunță-mă când se deschid conturile',
  short: 'Anunță-mă',
  href: '/#cont',
  note: `La lansare: ${trialDays} zile gratuite, fără card.`,
  quote: 'Cere o ofertă',
  quoteHref: `mailto:${links.email}?subject=${quoteSubject}`,
  quoteNote: 'Îți răspundem cu o ofertă pe email.',
};

export const billing = {
  label: 'Perioada de facturare',
  monthly: 'Lunar',
  annual: 'Anual: două luni gratuite',
  perMonth: '+ TVA pe lună',
};

export const defaultPeriod: BillingPeriod = 'annual';

export const start: SteppedPlan = {
  id: 'start',
  name: 'Start',
  who: 'Tot ce îți trebuie ca să ții la zi SSM și SU pentru toți clienții tăi.',
  users: 3,
  steps: [250, 500, 750],
  firstPrice: 39,
  unitPrice: 20,
  priceUnit: 250,
  lines: [
    { text: 'Oricâți clienți' },
    { text: '3 utilizatori' },
    { text: 'Documente SSM și SU din datele clientului' },
    { text: 'Fișe de instruire semnate pe telefon' },
    { text: 'Clientul vede instruirile fără să te sune' },
  ],
};

export const profesional: SteppedPlan = {
  id: 'profesional',
  name: 'Profesional',
  who: 'Pentru firma care crește: clienți noi, munca împărțită, ajutor mai repede.',
  users: 10,
  steps: [500, 1000, 1500, 2000, 3000, 4000, 5000],
  firstPrice: 89,
  unitPrice: 30,
  priceUnit: 500,
  lines: [
    { text: 'Tot ce include Start' },
    { text: '10 utilizatori' },
    { text: 'Fiecare coleg își vede clienții lui' },
    { text: 'Oferte și contracte pentru clienți noi' },
    { text: 'Suport în aceeași zi lucrătoare' },
  ],
};

export const enterprise: QuotedPlan = {
  id: 'enterprise',
  name: 'Enterprise',
  who: 'Pentru firmele mari de servicii externe.',
  ask: 'Ofertă',
  askNote: 'după mărimea firmei tale',
  lines: [
    { text: 'Tot ce include Profesional' },
    { text: 'Oricâți lucrători și utilizatori' },
    { text: 'Te ajutăm să-ți aduci clienții' },
    { text: 'Autentificare cu contul firmei' },
    { text: 'Acord de date după cerințele tale' },
  ],
};

export const steppedPlans = [start, profesional];

export const lastStep = (plan: SteppedPlan) => plan.steps.at(-1)!;

export const maxWorkers = lastStep(profesional);
export const maxUsers = profesional.users;

/** The smallest step that covers `workers`, or undefined past the plan's last step. */
export function stepFor(plan: SteppedPlan, workers: number): number | undefined {
  return plan.steps.find((step) => step >= workers);
}

export function monthlyAt(plan: SteppedPlan, step: number): number {
  return plan.firstPrice + (plan.unitPrice * (step - plan.steps[0]!)) / plan.priceUnit;
}

/** What a month costs when paid in the given period: annual pays ten months for twelve, rounded down. */
export function perMonth(monthly: number, period: BillingPeriod): number {
  return period === 'monthly' ? monthly : Math.floor((monthly * 10) / 12);
}

export function paidYearly(monthly: number): number {
  return perMonth(monthly, 'annual') * 12;
}

export const smsCodes = (step: number) => step / 5;
export const aiCredits = (step: number) => 2 * step + 250;
export const welcomeCredits = (step: number) => Math.min(10 * step, 10_000);

export const extras = { sms: 0.1, credits: 1.5, creditsPer: 100 };

/** The pricing section's slider: every step of either plan, then null for past the last one. */
export const workerStops: (number | null)[] = [
  ...[...new Set(steppedPlans.flatMap((plan) => plan.steps))].sort((a, b) => a - b),
  null,
];

/** The labels under the slider that stay on a phone, where all of them would collide. */
export const narrowStopLabels: (number | null)[] = [250, 1000, 2000, 4000, null];

const whole = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat('ro-RO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function eur(value: number): string {
  return `${(Number.isInteger(value) ? whole : cents).format(value)} €`;
}

export const num = (n: number) => whole.format(n);

/** Romanian puts "de" between a number and its noun from 20 up, unless the last two digits are 01–19. */
function de(n: number): string {
  const rest = n % 100;
  return n >= 20 && (rest === 0 || rest >= 20) ? ' de ' : ' ';
}

export function count(n: number, noun: string): string {
  return `${num(n)}${de(n)}${noun}`;
}

const keep = (text: string) => text.replaceAll(' ', '\u00a0');
const extraRates = `${keep(`${eur(extras.sms)} / SMS`)}, ${keep(`${eur(extras.credits)} / ${count(extras.creditsPer, 'credite AI')}`)}`;
const extraLine = `Peste atât plătești doar dacă permiți tu: ${extraRates}`;
const overText = `Peste ${count(maxWorkers, 'lucrători')}, îți facem o ofertă.`;

export const pricingSection = {
  title: 'Un abonament pentru tot portofoliul, nu pentru fiecare client.',
  intro:
    'Plătești după câți lucrători au clienții tăi, în total. Orice plan include documentele SSM și SU, instruirile, testele și semnăturile lucrătorilor.',
  calculator: 'Calculează cât plătești',
  compare: 'Compară planurile',
  workers: 'Lucrători la clienții tăi:',
  recommended: 'Recomandat',
  aiLink: 'credite AI',
  aiHref: '/#ai',
  terms:
    'Prețurile sunt în euro, fără TVA. Codurile SMS și creditele AI peste cele incluse le plătești doar dacă le permiți, până la o limită pe lună aleasă de tine.',
  enterpriseAllowance: `Peste ${count(maxWorkers, 'lucrători')} sau peste ${maxUsers} utilizatori`,
  enterpriseExtra: 'Coduri SMS și credite AI stabilite în ofertă',
};

export const defaultStop = workerStops.indexOf(500);

export function stopLabel(stop: number | null): string {
  return stop === null ? `${num(maxWorkers)}+` : num(stop);
}

export function workersShort(stop: number | null): string {
  return stop === null ? `peste ${num(maxWorkers)}` : num(stop);
}

export function workersText(stop: number | null): string {
  return stop === null ? `Peste ${count(maxWorkers, 'lucrători')}` : count(stop, 'lucrători');
}

export type Allowance = { text: string } | { before: string; after: string };

export interface CardState {
  id: SteppedPlan['id'] | QuotedPlan['id'];
  recommended: boolean;
  dim: boolean;
  price: string;
  yearly: string;
  allowance: Allowance;
  extra: string;
}

function included(step: number): Allowance {
  const credits = aiCredits(step);
  return {
    before: `${count(smsCodes(step), 'coduri SMS')} și ${num(credits)}${de(credits)}`,
    after: ' pe lună',
  };
}

function pricedCard(
  plan: SteppedPlan,
  step: number,
  period: BillingPeriod,
  state: Pick<CardState, 'recommended' | 'dim'> & { note?: string }
): CardState {
  const monthly = monthlyAt(plan, step);
  return {
    id: plan.id,
    recommended: state.recommended,
    dim: state.dim,
    price: eur(perMonth(monthly, period)),
    yearly: period === 'annual' ? `plătit anual: ${eur(paidYearly(monthly))} + TVA` : '',
    allowance: state.note ? { text: state.note } : included(step),
    extra: state.note ? '' : extraLine,
  };
}

export function cardStates(workers: number | null, period: BillingPeriod): CardState[] {
  const startStep = workers === null ? undefined : stepFor(start, workers);
  const profStep = workers === null ? undefined : stepFor(profesional, workers);
  const recommended = startStep ? 'start' : profStep ? 'profesional' : 'enterprise';
  return [
    pricedCard(start, startStep ?? lastStep(start), period, {
      recommended: recommended === 'start',
      dim: !startStep,
      note: startStep
        ? undefined
        : workers === null
          ? overText
          : `Pentru ${count(workers, 'lucrători')}, alege ${profesional.name}.`,
    }),
    pricedCard(profesional, profStep ?? lastStep(profesional), period, {
      recommended: recommended === 'profesional',
      dim: !profStep,
      note: profStep ? undefined : overText,
    }),
    {
      id: enterprise.id,
      recommended: recommended === 'enterprise',
      dim: false,
      price: enterprise.ask,
      yearly: '',
      allowance: { text: pricingSection.enterpriseAllowance },
      extra: pricingSection.enterpriseExtra,
    },
  ];
}

export const paymentFacts = {
  label: 'Plata și factura',
  payment: { title: 'Plată securizată', walletsText: 'sau cu cardul, prin Stripe.' },
  invoice: {
    title: 'Factura vine singură',
    text: 'După fiecare plată, pe email și în SPV, prin RO e-Factura.',
  },
  cancel: {
    title: 'Renunți oricând',
    text: 'Fără penalizări. Ai acces până la capătul perioadei plătite.',
  },
};

export const comingSoon = {
  title: 'În curând',
  items: ['Semnătură electronică calificată, plătită doar când o folosești'],
};

/** `true` is included, `false` is not, a string is shown as written. */
export type Cell = boolean | string;

export interface CompareRow {
  label: string;
  cells: [Cell, Cell, Cell];
}

function joined(items: string[], last: string): string {
  return `${items.slice(0, -1).join(', ')} ${last} ${items.at(-1)}`;
}

function stepList(plan: SteppedPlan, format: (step: number) => string): string {
  const all = plan.steps.map(format);
  return all.length <= 3 ? joined(all, 'sau') : `de la ${all[0]} la ${all.at(-1)}`;
}

function stepPrices(plan: SteppedPlan): string {
  return plan.steps
    .map((step, i) =>
      keep(`${i === 0 ? count(step, 'lucrători') : num(step)}: ${eur(monthlyAt(plan, step))}`)
    )
    .join(', ');
}

export const compare = {
  title: 'Compară planurile',
  firstColumn: 'Ce primești',
  from: 'de la',
  enterpriseAsk: 'La cerere',
  included: 'inclus',
  notIncluded: 'nu este inclus',
  groups: [
    {
      title: 'Mărime',
      rows: [
        { label: 'Clienți', cells: ['Oricâți', 'Oricâți', 'Oricâți'] },
        {
          label: 'Lucrători la clienții tăi',
          cells: [
            stepList(start, num),
            joined(profesional.steps.map(num), 'sau'),
            `Peste ${num(maxWorkers)}`,
          ],
        },
        {
          label: 'Utilizatori',
          cells: [String(start.users), String(profesional.users), `Peste ${maxUsers}`],
        },
      ],
    },
    {
      title: 'Documente',
      rows: [
        { label: 'Documentele SSM, completate din datele clientului', cells: [true, true, true] },
        { label: 'Documentele pentru situații de urgență', cells: [true, true, true] },
        { label: 'Evaluarea riscurilor pe posturi', cells: [true, true, true] },
        { label: 'Instrucțiunile tale proprii, incluse în documente', cells: [true, true, true] },
        {
          label: 'Oferte și contracte pentru firmele care nu îți sunt încă clienți',
          cells: [false, true, true],
        },
        { label: 'Documente fără marca SSM Ușor', cells: [false, true, true] },
      ],
    },
    {
      title: 'Instruiri și semnături',
      rows: [
        { label: 'Instruiri la zi și fișe individuale', cells: [true, true, true] },
        { label: 'Teste de verificare', cells: [true, true, true] },
        { label: 'Semnătură electronică avansată', cells: ['Inclusă', 'Inclusă', 'Inclusă'] },
        { label: 'Clientul vede instruirile și fișele lucrătorilor', cells: [true, true, true] },
      ],
    },
    {
      title: 'Coduri SMS și credite AI',
      rows: [
        {
          label: 'Coduri de semnare prin SMS, pe lună',
          cells: [
            `Unul la 5 lucrători: ${stepList(start, (step) => num(smsCodes(step)))}`,
            `Unul la 5 lucrători: ${stepList(profesional, (step) => num(smsCodes(step)))}`,
            'După nevoie',
          ],
        },
        {
          label: 'Credite AI, pe lună',
          cells: [
            `2 la fiecare lucrător, plus 250: ${stepList(start, (step) => num(aiCredits(step)))}`,
            `2 la fiecare lucrător, plus 250: ${stepList(profesional, (step) => num(aiCredits(step)))}`,
            'După nevoie',
          ],
        },
        {
          label: 'Credite AI de bun venit, o dată, la prima plată',
          cells: [
            `10 la fiecare lucrător: ${stepList(start, (step) => num(welcomeCredits(step)))}`,
            `10 la fiecare lucrător, cel mult ${num(welcomeCredits(Infinity))}`,
            'În ofertă',
          ],
        },
        {
          label: 'Peste cele incluse, doar dacă le permiți',
          cells: [extraRates, extraRates, 'În ofertă'],
        },
      ],
    },
    {
      title: 'Echipă',
      rows: [
        { label: 'Fiecare coleg își vede clienții lui', cells: [false, true, true] },
        { label: 'Autentificare unică cu contul firmei', cells: [false, false, 'La cerere'] },
      ],
    },
    {
      title: 'Ajutor',
      rows: [
        {
          label: 'Suport',
          cells: ['Pe email', 'Prioritar, răspuns în aceeași zi lucrătoare', 'Persoană dedicată'],
        },
        { label: 'Ajutor la mutarea clienților existenți', cells: [false, false, true] },
      ],
    },
  ] satisfies { title: string; rows: CompareRow[] }[],
};

const fromPrices = `Start de la ${eur(start.firstPrice)}, Profesional de la ${eur(profesional.firstPrice)}`;

export const pricingPage = {
  title: `Prețuri: program SSM și SU de la ${eur(start.firstPrice)} pe lună | SSM Ușor`,
  description: `${fromPrices} pe lună + TVA, cu oricâți clienți. Prețul depinde de câți lucrători au clienții tăi. La lansare: ${trialDays} zile gratuite.`,
  eyebrow: 'Prețuri',
  heading: `Toți clienții tăi, de la ${eur(start.firstPrice)} pe lună`,
  intro: `Plătești după câți lucrători au clienții tăi, în total: ${fromPrices} + TVA pe lună. Orice plan include documentele SSM și SU, instruirile, testele și semnăturile lucrătorilor.`,
  calculatorPrompt: 'Nu știi ce plan ți se potrivește?',
  calculatorLink: 'Calculează cât plătești',
  footnote: 'Prețurile sunt în euro, fără TVA.',
  faq: [
    {
      q: 'Ce lucrători se numără?',
      a: 'Numărăm lucrătorii activi ai tuturor clienților tăi activi. Foștii lucrători, ofertele și clienții arhivați nu se numără.',
    },
    {
      q: 'Ce se întâmplă dacă trec de numărul de lucrători al planului?',
      a: `Treci pe treapta următoare. ${start.name} are trepte de ${joined(start.steps.map(num), 'și')} de lucrători, apoi treci pe ${profesional.name}, care are trepte de ${joined(profesional.steps.map(num), 'și')}. Ce ai lucrat nu se blochează niciodată. Dacă după o lună ai tot mai mulți lucrători decât treapta ta, nu mai poți adăuga lucrători noi până nu treci pe treapta următoare sau arhivezi clienții cu care nu mai lucrezi.`,
    },
    {
      q: 'Pot încerca înainte să plătesc?',
      a: `Da. Ai ${trialDays} zile cu tot ce include Profesional, fără card. În această perioadă codurile de semnare se trimit pe email, iar SMS-urile pornesc când alegi un plan. Ai 300 de credite AI pe toată perioada, iar creditele de bun venit vin la prima plată. Dacă nu alegi un plan, contul rămâne încă 30 de zile doar pentru citire: vezi și descarci tot, apoi datele se șterg.`,
    },
    {
      q: 'Ce sunt creditele AI?',
      a: `Cu ele, inteligența artificială citește documentația și fișele pe care le ai deja, iar tu verifici ce a citit înainte să se salveze. Documentele unui client folosesc 25 de credite AI, plus unul pentru fiecare pagină scanată; fiecare fotografie a unei fișe folosește unul. Planul include în fiecare lună 2 credite AI pentru fiecare lucrător al treptei tale, plus 250; cele nefolosite nu trec în luna următoare. La prima plată primești, o singură dată, credite de bun venit care nu expiră: 10 pentru fiecare lucrător al treptei, cel mult ${num(welcomeCredits(Infinity))}.`,
    },
    {
      q: 'Ce se întâmplă când termin codurile SMS sau creditele AI ale lunii?',
      a: `Nu plătești nimic în plus până nu permiți tu. Până atunci, când se termină ce include luna, codurile de semnare pleacă pe email, iar importurile noi așteaptă luna următoare. Dacă permiți, alegi o limită pe lună și plătești doar ce folosești peste ce include planul, până la limita ta: ${eur(extras.sms)} pentru fiecare cod prin SMS în plus și ${eur(extras.credits)} pentru fiecare ${count(extras.creditsPer, 'credite AI')} în plus.`,
    },
    {
      q: 'Pot renunța oricând?',
      a: 'Da. Abonamentul rămâne activ până la sfârșitul perioadei plătite, fără penalizări. După aceea ai încă 30 de zile în care vezi și descarci tot, în Word și PDF; apoi datele se șterg.',
    },
  ],
};

export const pricingLinks = {
  page: '/preturi/',
  compare: '/preturi/#compara',
  calculator: '/preturi/calculator/',
};

export interface Quote {
  plan: SteppedPlan | QuotedPlan;
  step?: number;
  /** The plan's monthly price at `step`, before any annual discount. */
  monthly?: number;
  perMonth?: number;
  yearly?: number;
  lines: { label: string; value: string }[];
  advice: string;
}

export const calculator = {
  title: 'Calculator de preț | SSM Ușor',
  description:
    'Află ce plan ți se potrivește și cât plătești pentru SSM Ușor, după câți lucrători au clienții tăi și câte persoane lucrează în cont. Prețuri în euro, fără TVA.',
  back: '← Prețuri',
  heading: 'Calculează cât plătești',
  intro:
    'Oricâți clienți. Prețul depinde de câți lucrători au clienții tăi, în total, și de câte persoane lucrează în cont.',
  employees: 'Câți lucrători au clienții tăi, în total?',
  minEmployees: 50,
  stepEmployees: 50,
  /** One step past the last plan step stands for "more than that". */
  maxEmployees: maxWorkers + 50,
  overEmployees: `Peste ${num(maxWorkers)}`,
  /** About 3.5 employees per client among the small firms our first testers serve. */
  employeesPerClient: 3.5,
  examples: 'Exemple',
  presets: [
    { label: `La început, ${count(100, 'lucrători')}`, employees: 100, members: 1 },
    { label: `70 de clienți mici, ${count(250, 'lucrători')}`, employees: 250, members: 1 },
    { label: `Cu doi colegi, ${count(600, 'lucrători')}`, employees: 600, members: 3 },
    { label: `5 specialiști, ${count(1200, 'lucrători')}`, employees: 1200, members: 5 },
    {
      label: `Firmă mare, peste ${count(maxWorkers, 'lucrători')}`,
      employees: maxWorkers + 50,
      members: 8,
    },
  ],
  members: 'Câte persoane lucrează în cont, cu tot cu tine?',
  /** One more than Profesional's users stands for "more than that". */
  maxMembers: maxUsers + 1,
  fewer: 'O persoană mai puțin',
  more: 'O persoană în plus',
  period: 'Cum plătești?',
  best: 'Planul potrivit:',
  enterpriseAsk: 'Ofertă personalizată',
  terms: 'Prețurile sunt în euro, fără TVA.',
  summaries: [
    {
      title: `Start, de la ${eur(start.firstPrice)} + TVA pe lună`,
      text: `${stepPrices(start)}. ${start.users} utilizatori.`,
    },
    {
      title: `Profesional, de la ${eur(profesional.firstPrice)} + TVA pe lună`,
      text: `${stepPrices(profesional)}. ${profesional.users} utilizatori.`,
    },
  ],
  enterprise: {
    title: 'Enterprise, ofertă personalizată',
    text: `Peste ${count(maxWorkers, 'lucrători')} sau peste ${maxUsers} utilizatori.`,
  },
  extra: `Dacă într-o lună termini codurile SMS sau creditele AI incluse, nu plătești nimic în plus: codurile de semnare pleacă pe email, iar importurile noi așteaptă luna următoare. Dacă vrei să continui, poți permite plata pentru ce folosești în plus, până la o limită pe lună aleasă de tine: ${eur(extras.sms)} pentru fiecare SMS și ${eur(extras.credits)} pentru fiecare ${count(extras.creditsPer, 'credite AI')}.`,
};

export function membersLabel(members: number): string {
  return members > maxUsers ? `peste ${maxUsers}` : String(members);
}

export function employeesLabel(employees: number): string {
  return employees > maxWorkers ? calculator.overEmployees : num(employees);
}

export function employeesText(employees: number): string {
  return workersText(employees > maxWorkers ? null : employees);
}

export function quote(employees: number, members: number, period: BillingPeriod): Quote {
  const employeesOver = employees > maxWorkers;
  const membersOver = members > maxUsers;
  const startStep = stepFor(start, employees);
  const profStep = stepFor(profesional, employees);

  if (employeesOver || membersOver || profStep === undefined) {
    return {
      plan: enterprise,
      lines: [
        {
          label: 'Lucrători',
          value: employeesOver ? `peste ${num(maxWorkers)}` : `până la ${num(profStep!)}`,
        },
        { label: 'Utilizatori', value: membersLabel(members) },
        { label: 'Coduri SMS și credite AI', value: 'după nevoie' },
      ],
      advice: employeesOver
        ? `Peste ${count(maxWorkers, 'lucrători')} îți facem o ofertă după mărimea firmei tale.`
        : `Peste ${maxUsers} utilizatori îți facem o ofertă după mărimea echipei tale.`,
    };
  }

  const onStart = startStep !== undefined && members <= start.users;
  const plan = onStart ? start : profesional;
  const step = onStart ? startStep : profStep;
  const monthly = monthlyAt(plan, step);
  const lines = [
    {
      label: `${plan.name}, până la ${count(step, 'lucrători')}`,
      value: eur(perMonth(monthly, period)),
    },
    { label: 'Utilizatori incluși', value: String(plan.users) },
    { label: 'Coduri de semnare prin SMS, pe lună', value: num(smsCodes(step)) },
    { label: 'Credite AI, pe lună', value: num(aiCredits(step)) },
    { label: 'Credite AI de bun venit, la prima plată', value: num(welcomeCredits(step)) },
  ];
  if (period === 'annual')
    lines.push({ label: 'Plătit o dată pe an', value: eur(paidYearly(monthly)) });

  let advice: string;
  if (onStart) {
    advice = `Rămâi la același preț până la ${count(step, 'lucrători')}. Dacă vrei ${profesional.users} utilizatori sau oferte pentru firmele care nu îți sunt încă clienți, ${profesional.name} costă ${eur(perMonth(monthlyAt(profesional, profStep), period))} pe lună.`;
  } else if (startStep !== undefined) {
    advice = `${start.name} are cel mult ${start.users} utilizatori, așa că o echipă de ${members} merge pe ${profesional.name}.`;
  } else {
    advice = `${start.name} acoperă până la ${count(lastStep(start), 'lucrători')}. Pe ${profesional.name} rămâi la același preț până la ${count(step, 'lucrători')}.`;
  }

  return {
    plan,
    step,
    monthly,
    perMonth: perMonth(monthly, period),
    yearly: period === 'annual' ? paidYearly(monthly) : undefined,
    lines,
    advice,
  };
}

export function clientsHint(employees: number): string {
  if (employees > maxWorkers) return 'îți facem o ofertă';
  return `aproximativ ${count(Math.max(1, Math.round(employees / calculator.employeesPerClient)), 'clienți mici')}`;
}
