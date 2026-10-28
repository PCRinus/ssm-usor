/** Prices are in euro, without VAT. */
import { links } from './copy';

export type BillingPeriod = 'monthly' | 'annual';

export interface PlanLine {
  text: string;
  /** Must occur in `text`; that part is shown in bold. */
  bold?: string;
}

export interface PricedPlan {
  id: 'start' | 'profesional';
  name: string;
  who: string;
  badge?: string;
  monthly: number;
  annual: number;
  lead?: string;
  lines: PlanLine[];
}

export interface QuotedPlan {
  id: 'enterprise';
  name: string;
  who: string;
  ask: string;
  askNote: string;
  lead: string;
  lines: PlanLine[];
}

const quoteSubject = encodeURIComponent('Ofertă Enterprise SSM Ușor');

export const pricingCta = {
  label: 'Anunță-mă când se deschid conturile',
  short: 'Anunță-mă',
  href: '/#cont',
  note: 'La lansare: 30 de zile gratuite, fără card.',
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

export const start: PricedPlan = {
  id: 'start',
  name: 'Start',
  who: 'Pentru specialistul care lucrează singur.',
  badge: 'Pentru specialiștii independenți',
  monthly: 39,
  annual: 390,
  lines: [
    { text: 'Oricâți clienți', bold: 'Oricâți clienți' },
    { text: 'Până la 250 de angajați la clienții tăi', bold: '250 de angajați' },
    { text: 'Documentele SSM și SU, completate din datele clientului' },
    { text: 'Fișe de instruire semnate de angajați pe telefon' },
    { text: 'Clientul vede instruirile și fișele angajaților, fără să te sune' },
    { text: 'Un utilizator; al doilea costă 15 € pe lună' },
  ],
};

export const profesional: PricedPlan = {
  id: 'profesional',
  name: 'Profesional',
  who: 'Pentru firmele cu o echipă de specialiști.',
  monthly: 149,
  annual: 1490,
  lead: 'Tot ce include Start, plus:',
  lines: [
    { text: 'Până la 1.500 de angajați la clienții tăi', bold: '1.500 de angajați' },
    { text: '3 utilizatori, apoi 15 € pe lună pentru fiecare', bold: '3 utilizatori' },
    { text: 'Fiecare coleg își vede clienții lui' },
    { text: 'Documente fără marca SSM Ușor' },
    { text: 'Suport prioritar, cu răspuns în aceeași zi lucrătoare' },
  ],
};

export const enterprise: QuotedPlan = {
  id: 'enterprise',
  name: 'Enterprise',
  who: 'Pentru firmele mari de servicii externe.',
  ask: 'Ofertă personalizată',
  askNote: 'După mărimea firmei tale',
  lead: 'Tot ce include Profesional, plus:',
  lines: [
    { text: 'Peste 1.500 de angajați și oricâți utilizatori' },
    { text: 'Te ajutăm să-ți aduci clienții existenți' },
    { text: 'Autentificare unică cu contul firmei, la cerere' },
    { text: 'Acord de prelucrare a datelor după cerințele firmei tale' },
  ],
};

export const pricedPlans = [start, profesional];

const whole = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat('ro-RO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function eur(value: number): string {
  return `${(Number.isInteger(value) ? whole : cents).format(value)} €`;
}

export function monthlyPrice(plan: PricedPlan, period: BillingPeriod): string {
  return eur(period === 'monthly' ? plan.monthly : Math.round((plan.annual / 12) * 100) / 100);
}

export function annualNote(plan: PricedPlan): string {
  return `Plătit o dată pe an: ${eur(plan.annual)} + TVA`;
}

export const addOns = {
  title: 'Ai mai mulți clienți? Adaugi doar ce-ți lipsește.',
  items: [
    { label: '50 de angajați în plus', hint: 'aproximativ 15 clienți mici', price: '15 € / lună' },
    { label: 'Un coleg în plus', price: '15 € / lună' },
  ],
  note: 'Dacă treci de limită, lucrezi mai departe cu tot ce ai. Îți propunem un pachet, iar după o lună, ca să adaugi angajați noi, îl adaugi întâi.',
};

export const comingSoon = {
  title: 'În curând',
  items: [
    'Preluarea automată a dosarelor existente ale clienților',
    'Completarea automată a documentelor, cu inteligență artificială',
    'Semnătură electronică calificată, plătită doar când o folosești',
  ],
};

/** `true` is included, `false` is not, a string is shown as written. */
export type Cell = boolean | string;

export interface CompareRow {
  label: string;
  cells: [Cell, Cell, Cell];
}

export const compare = {
  title: 'Compară planurile',
  firstColumn: 'Ce primești',
  enterpriseAsk: 'La cerere',
  included: 'inclus',
  notIncluded: 'nu este inclus',
  groups: [
    {
      title: 'Mărime',
      rows: [
        { label: 'Clienți și clienți potențiali', cells: ['Oricâți', 'Oricâți', 'Oricâți'] },
        {
          label: 'Angajați la clienții tăi',
          cells: ['Până la 250', 'Până la 1.500', 'După nevoie'],
        },
        {
          label: 'Angajați în plus',
          cells: ['15 € pentru 50, până la 600', '40 € pentru 500', 'În ofertă'],
        },
        { label: 'Utilizatori', cells: ['1', '3', 'După nevoie'] },
        {
          label: 'Utilizator în plus',
          cells: ['15 € pe lună, doar unul', '15 € pe lună fiecare', 'În ofertă'],
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
        { label: 'Documente fără marca SSM Ușor', cells: [false, true, true] },
      ],
    },
    {
      title: 'Instruiri și semnături',
      rows: [
        { label: 'Instruiri la zi și fișe individuale', cells: [true, true, true] },
        { label: 'Teste de verificare', cells: [true, true, true] },
        { label: 'Semnătură electronică avansată', cells: ['Inclusă', 'Inclusă', 'Inclusă'] },
        {
          label: 'Coduri de semnare prin SMS, pe lună',
          cells: ['50, apoi 0,10 € fiecare', '300, apoi 0,10 € fiecare', 'După nevoie'],
        },
        { label: 'Clientul vede instruirile și fișele angajaților', cells: [true, true, true] },
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

export const pricingPage = {
  title: 'Prețuri: program SSM și SU de la 39 € pe lună | SSM Ușor',
  description:
    'Start 39 €, Profesional 149 € pe lună + TVA, cu oricâți clienți. Prețul depinde de câți angajați au clienții tăi. La lansare: 30 de zile gratuite.',
  eyebrow: 'Prețuri',
  heading: 'Toți clienții tăi, de la 39 € pe lună',
  intro:
    'Prețul depinde de câți angajați au clienții tăi, în total. Orice plan include documentele SSM și SU, instruirile, testele și semnăturile angajaților.',
  calculatorPrompt: 'Nu știi ce plan ți se potrivește?',
  calculatorLink: 'Calculează cât plătești',
  footnote: 'Prețurile sunt în euro, fără TVA.',
  faq: [
    {
      q: 'Ce angajați se numără?',
      a: 'Numărăm angajații activi ai tuturor clienților tăi activi. Foștii angajați, clienții potențiali și clienții arhivați nu se numără.',
    },
    {
      q: 'Ce se întâmplă dacă trec de limită?',
      a: 'Lucrezi mai departe cu tot ce ai. Îți arătăm pachetul de angajați în plus al planului tău (50 pe Start, 500 pe Profesional); dacă după o lună nu l-ai adăugat, nu mai poți adăuga angajați noi până nu o faci sau arhivezi clienții cu care nu mai lucrezi.',
    },
    {
      q: 'Pot încerca înainte să plătesc?',
      a: 'Da. Ai 30 de zile cu tot ce include Profesional, fără card; în această perioadă codurile se trimit pe email, iar SMS-urile pornesc când alegi un plan. Dacă nu alegi un plan, contul rămâne încă 30 de zile doar pentru citire: vezi și descarci tot, apoi datele se șterg.',
    },
    {
      q: 'Pot renunța oricând?',
      a: 'Da. Abonamentul rămâne activ până la sfârșitul perioadei plătite, fără penalizări. După aceea ai încă 30 de zile în care vezi și descarci tot, în Word și PDF; apoi datele se șterg.',
    },
  ],
};

export const pricingSection = {
  title: 'Un abonament pentru tot portofoliul, nu pentru fiecare client.',
  intro:
    'Prețul depinde de câți angajați au clienții tăi, în total. Documentele SSM și SU, instruirile, testele și semnăturile sunt incluse în orice plan.',
  calculator: 'Calculează cât plătești',
  compare: 'Compară planurile',
};

export const pricingLinks = {
  page: '/preturi/',
  compare: '/preturi/#compara',
  calculator: '/preturi/calculator/',
};

export interface Quote {
  plan: PricedPlan;
  total: number;
  lines: { label: string; value: string }[];
  advice: string;
}

/** Romanian puts "de" between a number and its noun from 20 up, unless the last two digits are 01–19. */
export function count(n: number, noun: string): string {
  const rest = n % 100;
  return `${n.toLocaleString('ro-RO')}${n >= 20 && (rest === 0 || rest >= 20) ? ' de ' : ' '}${noun}`;
}

export function quote(employees: number, members: number): Quote {
  const startPacks = Math.ceil(Math.max(0, employees - 250) / 50);
  const startMembers = Math.max(0, members - 1);
  const startTotal = start.monthly + 15 * startPacks + 15 * startMembers;
  const startFits = employees <= 600 && members <= 2;
  const profPacks = employees > 1500 ? Math.ceil((employees - 1500) / 500) : 0;
  const profMembers = Math.max(0, members - 3);
  const profTotal = profesional.monthly + 40 * profPacks + 15 * profMembers;
  const packs = (n: number, size: number) =>
    `${n === 1 ? 'Un pachet' : `${n} pachete`} de ${size} de angajați`;

  if (startFits && startTotal <= profTotal) {
    const lines = [{ label: 'Start, până la 250 de angajați', value: eur(start.monthly) }];
    if (startPacks) lines.push({ label: packs(startPacks, 50), value: eur(15 * startPacks) });
    if (startMembers) lines.push({ label: 'Un coleg în plus', value: eur(15) });
    return {
      plan: start,
      total: startTotal,
      lines,
      advice:
        profTotal - startTotal <= 20
          ? 'Ești aproape de Profesional: la același preț ai până la 1.500 de angajați și trei utilizatori.'
          : 'Plătești mai mult doar când treci de numărul de angajați inclus.',
    };
  }

  const lines = [
    { label: 'Profesional, până la 1.500 de angajați', value: eur(profesional.monthly) },
  ];
  if (profPacks) lines.push({ label: packs(profPacks, 500), value: eur(40 * profPacks) });
  if (profMembers) {
    lines.push({
      label: `${profMembers === 1 ? 'Un utilizator' : `${profMembers} utilizatori`} în plus`,
      value: eur(15 * profMembers),
    });
  }
  let advice = 'Profesional te costă la fel sau mai puțin decât Start cu pachete.';
  if (!startFits) {
    advice =
      members > 2
        ? 'Start acoperă cel mult doi utilizatori, așa că o echipă merge pe Profesional.'
        : 'Start acoperă cel mult 600 de angajați. Profesional are 1.500 incluși.';
  }
  return { plan: profesional, total: profTotal, lines, advice };
}

export const calculator = {
  title: 'Calculator de preț | SSM Ușor',
  description:
    'Află cât plătești pentru SSM Ușor după câți angajați au clienții tăi și câte persoane folosesc aplicația. Prețuri în euro, fără TVA.',
  back: '← Prețuri',
  heading: 'Calculează cât plătești',
  intro:
    'Oricâți clienți. Prețul depinde doar de câți angajați au clienții tăi, în total, și de câte persoane folosesc aplicația.',
  employees: 'Câți angajați au clienții tăi, în total?',
  minEmployees: 50,
  maxEmployees: 2000,
  /** About 3.5 employees per client among the small firms our first testers serve. */
  employeesPerClient: 3.5,
  examples: 'Exemple',
  presets: [
    { label: 'La început · 90 de angajați', employees: 90, members: 1 },
    { label: '70 de clienți mici · 250 de angajați', employees: 250, members: 1 },
    { label: '100 de clienți · 350 de angajați', employees: 350, members: 1 },
    { label: '100 de clienți, cu un coleg · 350 de angajați', employees: 350, members: 2 },
    { label: 'Firmă cu 3 specialiști · 1.000 de angajați', employees: 1000, members: 3 },
  ],
  members: 'Câte persoane folosesc aplicația, cu tot cu tine?',
  maxMembers: 10,
  fewer: 'O persoană mai puțin',
  more: 'O persoană în plus',
  best: 'Planul potrivit:',
  terms: 'Prețurile sunt în euro, fără TVA. Anual: două luni gratuite.',
  summaries: [
    {
      title: 'Start · 39 € + TVA pe lună',
      text: 'Până la 250 de angajați la clienții tăi, apoi 15 € pentru fiecare 50. Un utilizator; al doilea costă 15 € pe lună.',
    },
    {
      title: 'Profesional · 149 € + TVA pe lună',
      text: 'Până la 1.500 de angajați și 3 utilizatori. Fiecare coleg își vede clienții lui.',
    },
  ],
  enterprise: {
    title: 'Enterprise · ofertă personalizată',
    text: 'Pentru firmele mari de servicii externe.',
  },
};

export function clientsHint(employees: number): string {
  return `aproximativ ${count(Math.max(1, Math.round(employees / calculator.employeesPerClient)), 'clienți mici')}`;
}
