/** Romanian, sentence case, with diacritics; the reader is addressed as "tu". */
import type { ScreenName } from './screens';

const appUrl = import.meta.env.PUBLIC_APP_URL || 'https://app.ssmusor.ro';

export const links = {
  login: `${appUrl}/autentificare`,
  email: 'contact@ssmusor.ro',
  notifyHref:
    'mailto:contact@ssmusor.ro?subject=Anun%C8%9B%C4%83-m%C4%83%20c%C3%A2nd%20se%20deschid%20conturile&body=Bun%C4%83%2C%0A%0AVreau%20s%C4%83%20fiu%20anun%C8%9Bat%20c%C3%A2nd%20pot%20crea%20un%20cont%20SSM%20U%C8%99or.%0A%0AFirma%3A%20%0ANum%C4%83r%20de%20clien%C8%9Bi%3A%20',
};

export const cta = {
  login: 'Intră în cont',
  signup: 'Creează un cont',
  signupNote: 'în curând',
  notify: 'Anunță-mă când se deschid conturile',
  haveAccount: 'Ai deja cont?',
};

export const waitlist = {
  // Bump when the consent sentence below changes; it is stored with each subscription.
  consentVersion: '2026-09',
  label: 'Adresa ta de email',
  placeholder: 'nume@firma.ro',
  submit: 'Anunță-mă',
  consent: 'Folosim adresa doar ca să te anunțăm când se deschid conturile.',
  consentLink: 'Politica de confidențialitate',
  sending: 'Se trimite…',
  success: 'Ți-am trimis un email. Deschide-l și confirmă adresa ca să te trecem pe listă.',
  error: 'Nu am putut trimite cererea. Încearcă din nou sau scrie-ne la contact@ssmusor.ro.',
  challengeFailed: 'Verificarea anti-spam nu a reușit. Reîncarcă pagina și încearcă din nou.',
};

export const page = {
  title: 'Program SSM și SU (PSI) pentru servicii externe | SSM Ușor',
  description:
    'Documentele SSM și SU ale clienților, completate din datele lor. Instruiri la zi și fișe semnate de lucrători pe telefon. Pentru servicii externe SSM.',
  siteName: 'SSM Ușor',
  imageAlt:
    'Sigla SSM Ușor, titlul „De la clientul nou la fișa semnată.” și pagina de start din aplicație',
};

export const nav = [
  { href: '#cum', label: 'Cum funcționează' },
  { href: '#angajati', label: 'Pentru lucrători' },
  { href: '/preturi/', label: 'Prețuri' },
  { href: '#intrebari', label: 'Întrebări' },
];

/** Section links (`#…`) point into the landing page wherever the header is shown. */
export function navHref(href: string, home = '/'): string {
  return href.startsWith('#') ? `${home}${href}` : href;
}

export const hero = {
  title: 'Mai puțin timp în Word. Mai mult timp la clienți.',
  lede: 'SSM Ușor pregătește documentele SSM și SU ale fiecărui client, îți arată ce instruiri urmează și le trimite lucrătorilor fișele de semnat pe telefon. Tu verifici, ei semnează.',
  status: {
    before: 'Conturile noi se deschid în curând.',
    link: 'Lasă-ne adresa',
    after: 'și te anunțăm.',
  },
  stageLabel: 'Pagina de start din aplicație și semnarea de pe telefon',
  dashboardAlt: 'Pagina de start: ce ai de făcut și situația instruirilor la toți clienții',
  phoneAlt: 'Portalul lucrătorului: alege ce semnează',
};

export type FactMark = 'eu' | 'signature' | 'legislation' | 'formats' | 'payment';

export const facts: { mark: FactMark; title: string; text: string }[] = [
  {
    mark: 'eu',
    title: 'Găzduite în Uniunea Europeană',
    text: 'Datele clienților tăi sunt stocate în UE.',
  },
  {
    mark: 'signature',
    title: 'Semnătură electronică avansată',
    text: 'Semnătura calificată vine în curând, ca extensie.',
  },
  {
    mark: 'legislation',
    title: 'Legislația, urmărită zilnic',
    text: 'Afli când un document trebuie refăcut.',
  },
  {
    mark: 'formats',
    title: 'Documentele rămân ale tale',
    text: 'Le descarci oricând, în Word sau PDF.',
  },
  {
    mark: 'payment',
    title: 'Plata cu cardul, în siguranță',
    text: 'Numărul cardului tău nu ajunge la noi.',
  },
];

export interface Shot {
  screen: ScreenName;
  alt: string;
}

export type StepVisual =
  | { kind: 'desktop'; shot: Shot }
  | { kind: 'phones'; first: Shot; second: Shot }
  | { kind: 'combo'; desktop: Shot; phone: Shot };

export interface Step {
  tab: string;
  title: string;
  text: string;
  visual: StepVisual;
}

export const steps = {
  title: 'De la clientul nou la fișa semnată, în patru pași.',
  label: 'Pașii',
  items: [
    {
      tab: 'Aduci clientul',
      title: 'Aduci clientul, cu tot cu dosarul lui.',
      text: 'Încarci documentația pe care o ai și fotografiile fișelor, iar firma, posturile și lucrătorii intră în aplicație. Pentru un client nou, scrii CUI-ul și datele firmei se completează singure.',
      visual: {
        kind: 'desktop',
        shot: {
          screen: 'importReview',
          alt: 'Verificarea datelor preluate din dosarul unui client: cinci secțiuni gata, o alegere de făcut și o secțiune de verificat',
        },
      },
    },
    {
      tab: 'Primești documentele',
      title: 'Primești documentele completate.',
      text: 'Dosarul SSM și dosarul pentru situații de urgență pornesc cu datele clientului deja puse. Le citești, le ajustezi direct în browser și le emiți când sunt gata.',
      visual: {
        kind: 'desktop',
        shot: {
          screen: 'documents',
          alt: 'Documentația SSM a unui client, cu documente în lucru și emise',
        },
      },
    },
    {
      tab: 'Instruiești și testezi',
      title: 'Instruiești și testezi.',
      text: 'Notezi instruirea pentru tot grupul deodată. Lucrătorii dau testul de pe telefon, iar tu vezi pe loc cine a trecut și când urmează următoarea instruire.',
      visual: {
        kind: 'phones',
        first: { screen: 'phonePortalTest', alt: 'O întrebare din test, pe telefon' },
        second: { screen: 'phonePortalHome', alt: 'Prima pagină a lucrătorului în portal' },
      },
    },
    {
      tab: 'Semnează toată lumea',
      title: 'Semnează toată lumea, de pe telefon.',
      text: 'Lucrătorii semnează fișele fără parolă și fără nimic de instalat. Tu semnezi alături, din aplicație. Nu mai treci pe la fiecare om cu hârtiile ca să strângi semnăturile.',
      visual: {
        kind: 'combo',
        desktop: { screen: 'signatures', alt: 'Lista ta de semnături, pe clienți' },
        phone: { screen: 'phonePortalSign', alt: 'Lucrătorul alege ce semnează' },
      },
    },
  ] satisfies Step[],
};

export type ImportMarkName = 'documents' | 'sheets' | 'kept' | 'review';

export interface TrainingSheet {
  name: string;
  mark: string;
  job: string;
  place: string;
  signature: 'badea' | 'coman' | 'dobre';
  rows: [date: string, duration: string][];
}

export const importSection = {
  title: 'Încarci dosarul vechi. Inteligența artificială îl citește, tu verifici.',
  intro:
    'Încarci documentația unui client și fotografiile fișelor de instruire. Inteligența artificială le citește și îți propune datele firmei, posturile și lucrătorii, cu instruirile lor. Nu se salvează nimic până nu verifici și confirmi.',
  stageLabel: 'Fișele de instruire de pe hârtie devin lista de lucrători din aplicație',
  shotAlt:
    'Lucrătorii unui client, creați din fișele de instruire, cu instruirile SSM și SU și testele de pe fișe',
  outcomes: [
    {
      mark: 'documents',
      title: 'Clientul, din documentația lui',
      text: 'Inteligența artificială citește dosarul și îți propune datele firmei, punctele de lucru, posturile și persoanele cu atribuții.',
    },
    {
      mark: 'sheets',
      title: 'Lucrătorii, din fișele de instruire',
      text: 'Fotografiezi fișele în orice ordine. Scrisul de mână e citit și pus pe lucrători, cu instruirile și testele fiecăruia.',
    },
    {
      mark: 'kept',
      title: 'Nicio instruire de refăcut',
      text: 'Ce s-a făcut pe hârtie rămâne făcut. Nu reiei instruirea la angajare și nici testul.',
    },
    {
      mark: 'review',
      title: 'Tu verifici fiecare valoare',
      text: 'Lângă fiecare valoare vezi pasajul din document sau locul de pe fotografie din care a fost citită. O corectezi, apoi confirmi.',
    },
  ] satisfies { mark: ImportMarkName; title: string; text: string }[],
  note: 'Citirile se plătesc în credite AI: dosarul unui client folosește în jur de 70, o pagină fotografiată dintr-o fișă, unul. Fiecare plan include credite AI în fiecare lună, iar la prima plată primești credite de bun venit.',
  sheet: {
    unit: 'Unitatea',
    company: 'Brutăria Spicul Auriu SRL',
    title: ['FIȘĂ INDIVIDUALĂ DE INSTRUIRE PRIVIND', 'SECURITATEA ȘI SĂNĂTATEA ÎN MUNCĂ'],
    name: 'Numele și prenumele',
    mark: 'Legitimație, marca',
    job: 'Funcția',
    place: 'Locul de muncă',
    periodic: 'Instruirea periodică',
    columns: [
      'Data instruirii',
      'Durata',
      'Semnătura celui instruit',
      'Semnătura celui care a instruit',
    ],
  },
  // Back to front: the last one lies on top.
  sheets: [
    {
      name: 'Dobre Cristian',
      mark: '37',
      job: 'patiser',
      place: 'laborator',
      signature: 'dobre',
      rows: [
        ['15.11.2024', '2 ore'],
        ['15.05.2025', '2 ore'],
        ['15.11.2025', '2 ore'],
        ['15.05.2026', '2 ore'],
      ],
    },
    {
      name: 'Coman Daniela',
      mark: '12',
      job: 'patiser',
      place: 'laborator',
      signature: 'coman',
      rows: [
        ['20.02.2025', '2 ore'],
        ['20.08.2025', '2 ore'],
        ['20.02.2026', '2 ore'],
        ['20.08.2026', '2 ore'],
      ],
    },
    {
      name: 'Badea Ion',
      mark: '5',
      job: 'brutar',
      place: 'secția panificație',
      signature: 'badea',
      rows: [
        ['18.06.2024', '2 ore'],
        ['18.12.2024', '2 ore'],
        ['18.06.2025', '2 ore'],
        ['18.12.2025', '2 ore'],
        ['18.06.2026', '2 ore'],
      ],
    },
  ] satisfies TrainingSheet[],
};

export const day = {
  title: 'Știi de dimineață ce ai de făcut.',
  intro:
    'Semnăturile care te așteaptă, documentele de emis, clienții cărora le lipsesc date și instruirile întârziate, pe o singură pagină. Nu mai deschizi fiecare dosar ca să afli unde ești.',
  phoneAlt: 'Pagina de start pe telefon',
};

export type LibraryIcon = 'instructions' | 'risk' | 'tests';

export const library = {
  title: 'Scrii o dată. Folosești la toți clienții.',
  intro:
    'Tot ce pregătești pentru un client rămâne în biblioteca ta. La clientul următor pornești de acolo și ajustezi doar ce diferă.',
  items: [
    {
      icon: 'instructions',
      title: 'Instrucțiuni proprii',
      text: 'Le scrii o dată sau le preiei din dosarul vechi și le legi de posturi.',
    },
    {
      icon: 'risk',
      title: 'Evaluarea riscurilor',
      text: 'Un post evaluat devine model pentru același post la alt client.',
    },
    {
      icon: 'tests',
      title: 'Teste',
      text: 'Pornești de la întrebările incluse și adaugi ce vrei tu.',
    },
  ] satisfies { icon: LibraryIcon; title: string; text: string }[],
  shotAlt: 'Evaluări de risc: posturi evaluate o dată și aplicate la orice client',
};

export const legislation = {
  title: 'Când se schimbă legea, afli înaintea controlului.',
  text: 'Urmărim zilnic actele normative citate în documente. Când un document trebuie actualizat, îți arătăm la ce clienți și îl refaci pentru toți odată. Dosarele rămân la zi, nu doar în ziua în care le-ai predat.',
  shotAlt: 'Pagina Legislație după verificarea de azi: actele urmărite, toate în vigoare',
};

export const contract = {
  title: 'Și contractul cu clientul pleacă tot de aici.',
  text: 'Generezi contractul de servicii, îl trimiți pe email, iar clientul îți încarcă exemplarul semnat printr-un link. Apoi îl treci în lista de clienți.',
  stepsLabel: 'Contractul, pe pași',
  steps: [
    'Generezi contractul de servicii',
    'Îl trimiți clientului pe email',
    'Clientul încarcă exemplarul semnat printr-un link',
    'Îl treci în lista de clienți',
  ],
};

export const portal = {
  title: 'Lucrătorii semnează de pe telefon, nu pe hârtie.',
  intro:
    'Primesc un mesaj pe email sau SMS și intră în portal fără parolă. Citesc materialul, dau testul și semnează fișa. Administratorul firmei vede cine a terminat și cine mai are de semnat.',
  note: 'Fișele semnate rămân la dosarul fiecărui lucrător, gata de arătat la control.',
  phones: [
    { screen: 'phonePortalHome', alt: 'Portal: prima pagină a lucrătorului' },
    { screen: 'phonePortalTest', alt: 'Portal: o întrebare din test' },
    { screen: 'phonePortalSign', alt: 'Portal: alegerea fișelor de semnat' },
  ] satisfies Shot[],
};

export const access = {
  title: 'Conturile noi se deschid în curând.',
  intro: 'Lasă-ne adresa de email și îți scriem în ziua în care poți crea cont.',
  // "Modelele de documente sunt verificate juridic…" belongs here only once the legal review is done.
  trust: [
    'Ce ai emis rămâne exact cum l-ai emis.',
    'Datele clienților tăi rămân ale tale.',
    'Gândit pentru serviciile externe de prevenire și protecție din România.',
  ],
};

export interface Faq {
  q: string;
  a: string;
  /** A part of `a` shown as a link. */
  link?: { text: string; href: string };
}

export const faq = {
  title: 'Întrebări frecvente',
  items: [
    {
      q: 'Pot să îmi creez un cont acum?',
      a: 'Încă nu. Lasă-ne adresa și te anunțăm când se deschid conturile. Dacă ai deja cont, intră din colțul din dreapta sus.',
    },
    {
      q: 'Pentru cine e SSM Ușor?',
      a: 'Pentru serviciile externe SSM și SU, de la specialistul care lucrează singur la echipele cu mai mulți colegi. Clienții tăi și lucrătorii lor intră doar în portal, invitați de tine.',
    },
    {
      q: 'Trebuie să instaleze lucrătorii ceva?',
      a: 'Nu. Primesc un mesaj pe email sau SMS și deschid portalul din browserul telefonului, fără parolă.',
    },
    {
      q: 'Ce semnătură electronică folosiți?',
      a: 'O semnătură electronică avansată, pentru fișele de instruire și de testare. Pregătim și o extensie pentru semnătura electronică calificată.',
    },
    {
      q: 'Pot modifica documentele?',
      a: 'Da. Fiecare document se deschide în browser și îl ajustezi înainte să-l emiți. Poți și încărca varianta ta în Word.',
    },
    {
      q: 'Faceți și documentația pentru situații de urgență (PSI)?',
      a: 'Da. Fiecare client are, pe lângă dosarul SSM, dosarul pentru situații de urgență, pregătit din aceleași date.',
    },
    {
      q: 'Am mulți clienți. Trebuie să îi introduc pe toți de la zero?',
      a: 'Nu. Încarci documentația pe care o ai deja și fotografiile fișelor de instruire. Aplicația preia din ele datele firmei, posturile și lucrătorii, cu instruirile lor. Nu se salvează nimic până nu verifici și confirmi, iar instruirile făcute pe hârtie nu se refac.',
    },
    {
      q: 'Cum evaluați riscurile?',
      a: 'După metoda I.N.C.D.P.M. București. Tu alegi gravitatea și probabilitatea pentru fiecare factor; restul se calculează singur, iar evaluarea și planul de prevenire ies din aceleași date.',
    },
    {
      q: 'Pot lucra cu colegii în același cont?',
      a: 'Da. Îi inviți pe email și fiecare intră cu contul lui.',
    },
    {
      q: 'Pot să îmi iau documentele dacă renunț?',
      a: 'Da. Le descarci oricând, pentru fiecare client, în Word sau PDF, și încă 30 de zile după ce renunți.',
    },
    {
      q: 'Cât costă?',
      a: 'De la 39 € + TVA pe lună, cu oricâți clienți. Prețul depinde de câți lucrători au clienții tăi în total; detaliile sunt pe pagina de prețuri.',
      link: { text: 'pagina de prețuri', href: '/preturi/' },
    },
  ] satisfies Faq[],
};

export const footer = {
  legal: [
    { href: '/termeni/', label: 'Termeni' },
    { href: '/confidentialitate/', label: 'Confidențialitate' },
    { href: '/prelucrare-date/', label: 'Prelucrarea datelor' },
  ],
};
