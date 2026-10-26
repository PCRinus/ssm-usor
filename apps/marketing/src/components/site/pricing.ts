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

export function priceNote(plan: PricedPlan, period: BillingPeriod): string {
  return period === 'monthly'
    ? `Anual: ${eur(plan.annual)} + TVA`
    : `Plătit o dată pe an: ${eur(plan.annual)} + TVA`;
}

export const addOns = {
  title: 'Ai mai mulți clienți? Adaugi doar ce-ți lipsește.',
  items: [
    { label: '50 de angajați în plus', hint: 'aproximativ 15 clienți mici', price: '15 € / lună' },
    { label: 'Un coleg în plus', price: '15 € / lună' },
  ],
  note: 'Dacă treci de limită, aplicația merge mai departe. Îți propunem un pachet și alegi tu când îl adaugi.',
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
        { label: 'Coduri de semnare prin SMS, pe lună', cells: ['50', '300', 'După nevoie'] },
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
      a: 'Lucrezi mai departe, nimic nu se blochează. Îți arătăm un pachet de 50 de angajați și ai o lună să te hotărăști.',
    },
    {
      q: 'Pot încerca înainte să plătesc?',
      a: 'Da. Ai 30 de zile cu tot ce include Profesional, fără card. Dacă nu alegi un plan, îți poți vedea și descărca în continuare documentele.',
    },
    {
      q: 'Pot renunța oricând?',
      a: 'Da. Planul lunar se oprește la sfârșitul lunii plătite, fără penalizări. Documentele rămân ale tale și le descarci oricând în Word și PDF.',
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
