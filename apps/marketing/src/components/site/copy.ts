/**
 * Narrative: an external SSM service adds a client, adds its employees, creates the documents,
 * contracts and tests for them, and gets everything signed by the right people, in one place.
 * Portfolio, deadlines, visits and evidence exist but stay secondary.
 *
 * Romanian, sentence case, with diacritics; one short line per item outside the hero.
 */

const appUrl = import.meta.env.PUBLIC_APP_URL || 'https://app.ssmusor.ro';

export const links = {
  login: `${appUrl}/login`,
  email: 'contact@ssmusor.ro',
  notifyHref:
    'mailto:contact@ssmusor.ro?subject=Anun%C8%9B%C4%83-m%C4%83%20c%C3%A2nd%20se%20deschid%20conturile&body=Bun%C4%83%2C%0A%0AVreau%20s%C4%83%20fiu%20anun%C8%9Bat%20c%C3%A2nd%20pot%20crea%20un%20cont%20SSM%20U%C8%99or.%0A%0AFirma%3A%20%0ANum%C4%83r%20de%20clien%C8%9Bi%3A%20',
};

export const cta = {
  login: 'Intră în cont',
  signup: 'Creează un cont',
  signupNote: 'în curând',
  notify: 'Anunță-mă când se deschid conturile',
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

export const status = {
  short: 'Platformă în dezvoltare. Conturile noi se deschid în curând.',
};

export interface Step {
  title: string;
  text: string;
}

export interface DocumentGroup {
  title: string;
  items: string[];
}

export interface Signer {
  who: string;
  signs: string;
}

export interface Faq {
  q: string;
  a: string;
}

export interface Pack {
  title: string;
  count: string;
  sections: string[];
}

export const copy = {
  lede: 'Adaugi clientul și angajații, creezi documentele și testele, semnezi cu toată lumea. Într-un singur loc.',
  steps: [
    { title: 'Adaugi clientul', text: 'Firma, punctele de lucru și contractul de servicii.' },
    {
      title: 'Adaugi angajații',
      text: 'Manual sau din Excel. Funcția și locul de muncă, o singură dată.',
    },
    {
      title: 'Creezi documentele și testele',
      text: 'Din șabloanele tale, cu datele deja completate.',
    },
    {
      title: 'Semnezi cu toată lumea',
      text: 'Tu, administratorul și fiecare angajat, de pe telefon.',
    },
  ] satisfies Step[],
  documents: [
    { title: 'Pentru firmă', items: ['Contract de servicii', 'Decizii', 'Instrucțiuni proprii'] },
    {
      title: 'Pentru angajați',
      items: ['Fișă de instruire', 'Declarații', 'Proces-verbal de predare'],
    },
    {
      title: 'Instruire și testare',
      items: ['Tematici', 'Teste cu punctaj', 'Fișa de testare anuală'],
    },
  ] satisfies DocumentGroup[],
  documentsNote: 'Orice alt document se încarcă și rămâne la dosar.',
  signers: [
    { who: 'Tu', signs: 'Contractul, fișele și procesele-verbale.' },
    { who: 'Administratorul', signs: 'Contractul și deciziile firmei.' },
    { who: 'Angajatul', signs: 'Fișa de instruire și declarațiile, de pe telefon.' },
  ] satisfies Signer[],
  signatureNote: 'Semnătură electronică printr-un furnizor autorizat, cu dovada validării.',
  also: [
    { title: 'Toți clienții, o pagină', text: 'Ce este de făcut la fiecare firmă.' },
    { title: 'Termene automate', text: 'Instruiri periodice și documente care expiră.' },
    { title: 'Vizite', text: 'Constatări cu fotografii, remedieri urmărite.' },
    { title: 'Dosar pentru control', text: 'Export complet în câteva minute.' },
  ] satisfies Step[],
  trust: [
    'Datele rămân ale tale: export PDF și Word oricând.',
    'Găzduire în Uniunea Europeană.',
    'Documente pornite din dosarele reale ale unui serviciu extern și revizuite cu specialiști SSM.',
    'Legislația citată în documente este urmărită zilnic pe Portalul Legislativ.',
    'Fiecare document emis își păstrează revizia și PDF-ul de la data emiterii.',
  ],
  faq: [
    {
      q: 'Pot să îmi creez un cont acum?',
      a: 'Încă nu. Lasă-ne adresa de email și te anunțăm când se deschid înregistrările.',
    },
    {
      q: 'Cui i se adresează SSM Ușor?',
      a: 'Serviciilor externe SSM din România. Angajatorii și angajații participă prin serviciul lor extern.',
    },
    {
      q: 'Cum funcționează semnătura electronică?',
      a: 'Printr-un furnizor autorizat. Semnatarul primește documentul pe email și îl semnează de pe telefon sau laptop.',
    },
    {
      q: 'Pot să îmi aduc angajații dintr-un fișier existent?',
      a: 'Da, din Excel sau CSV, cu verificare înainte de import.',
    },
    {
      q: 'Faceți și documentația PSI?',
      a: 'Da. Pe lângă dosarul SSM, fiecare client are dosarul de apărare împotriva incendiilor: decizii, instrucțiuni proprii, tematică, teste, lista mijloacelor și registrele, generate din aceleași date.',
    },
    {
      q: 'Ce metodă de evaluare a riscurilor folosiți?',
      a: 'Metoda I.N.C.D.P.M. București. Tu alegi clasele de gravitate și de probabilitate ale fiecărui factor; nivelurile, media postului și lista factorilor inacceptabili le calculează platforma.',
    },
    {
      q: 'Cât costă?',
      a: 'Prețurile nu sunt publicate încă. Vizăm un abonament lunar per serviciu extern, în funcție de angajații gestionați.',
    },
  ] satisfies Faq[],
};

export const packs = {
  title: 'Dosarul SSM și dosarul PSI, din aceleași date.',
  intro:
    'Firma, punctele de lucru, posturile, angajații, responsabilii și mijloacele de stingere se introduc o singură dată. Din ele, platforma generează ambele dosare, document cu document, și îți spune ce date lipsesc înainte să genereze.',
  ssm: {
    title: 'Dosarul SSM',
    count: '24 de documente în 12 secțiuni',
    sections: [
      'Deciziile interne: instruire, echipa de evaluare, prim ajutor, pericol grav și iminent, reprezentanții lucrătorilor',
      'Materialul de instruire introductiv-generală',
      'Instrucțiunile proprii, asamblate din modulele tale',
      'Tematica și programul de instruire',
      'Testul la angajare',
      'Lista internă de dotare cu echipament individual de protecție',
      'Registrele de evidență a evenimentelor',
      'Referatul de control',
      'Evaluarea riscurilor de accidentare și îmbolnăvire profesională',
      'Planul de prevenire și protecție',
      'Materialul de informare a angajatorului',
      'Regulamentul intern privind controlul propriu',
    ],
  } satisfies Pack,
  psi: {
    title: 'Dosarul PSI',
    count: '24 de documente în 6 secțiuni',
    sections: [
      'Nouă decizii: organizarea apărării, instruire, foc deschis, fumat, caniculă și sezon rece, cadrul tehnic, instrucțiuni, deșeuri, control propriu',
      'Instrucțiunile proprii în domeniul situațiilor de urgență',
      'Tematica de instruire',
      'Testele la angajare și anuale',
      'Lista mijloacelor de apărare împotriva incendiilor și organizarea apărării la fiecare loc de muncă',
      'Registrele: exerciții, controale, permise de lucru cu foc, instalații, stingătoare',
    ],
  } satisfies Pack,
  note: 'Documentele condiționate de numărul de angajați apar singure când clientul trece pragul. Dosarul PSI este semnat pentru furnizor de cadrul tehnic PSI.',
};

export const risk = {
  title: 'Evaluarea riscurilor, după metoda I.N.C.D.P.M.',
  points: [
    'Pentru fiecare factor de risc alegi clasa de gravitate, de la 1 la 7, și clasa de probabilitate, de la 1 la 6. Nivelul de risc se citește din grila metodei.',
    'Un factor peste nivelul 3 este inacceptabil și cere măsuri. Nivelul global al postului este media ponderată a metodei, Σ R² / Σ R, cu limita acceptată 3,5.',
    'Din aceeași evaluare ies evaluarea riscurilor și planul de prevenire și protecție, cu coloanele anexei 7 la H.G. 1425/2006.',
    'Un post evaluat se salvează în biblioteca ta și se aplică la alți clienți, cu clasele ajustate pe loc.',
  ],
  caption: 'Grila metodei: clasa de gravitate pe rânduri, clasa de probabilitate pe coloane.',
};
