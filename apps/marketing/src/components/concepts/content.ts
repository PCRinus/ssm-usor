/**
 * Copy shared by the landing-page concepts under /concepte.
 *
 * Narrative: an external SSM service adds a client, adds its employees, creates the documents,
 * contracts and tests for them, and gets everything signed by the right people, in one place.
 * Portfolio, deadlines, visits and evidence exist but stay secondary.
 *
 * Everything here is in Romanian, sentence case, with diacritics, and avoids internal jargon.
 */

export const links = {
  login: 'https://app.ssmusor.ro/login',
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

export const status = {
  short: 'Platformă în dezvoltare. Conturile noi se deschid în curând.',
  long: 'SSM Ușor este în dezvoltare. Dacă ai deja un cont, poți intra. Înregistrarea se deschide în curând; lasă-ne adresa și te anunțăm.',
};

export const audience =
  'Făcut pentru serviciile externe SSM din România. Dacă ești singurul specialist din firma ta, SSM Ușor este biroul tău de lucru. Dacă ai o echipă, este biroul tuturor.';

export interface Step {
  title: string;
  text: string;
}

/** The four-step flow. This is a real sequence, so numbering it is legitimate. */
export const steps: Step[] = [
  {
    title: 'Adaugi clientul',
    text: 'Datele firmei, punctele de lucru și persoana de contact. Contractul de prestări servicii se completează din aceste date și pleacă la semnat.',
  },
  {
    title: 'Adaugi angajații',
    text: 'Îi introduci unul câte unul sau îi imporți dintr-un fișier Excel. Fiecare are funcția, locul de muncă și data angajării, scrise o singură dată.',
  },
  {
    title: 'Creezi documentele și testele',
    text: 'Fișe de instruire, instrucțiuni proprii, decizii, declarații, tematici și teste. Din șabloanele tale, cu datele clientului și ale angajatului deja completate.',
  },
  {
    title: 'Semnezi cu toată lumea',
    text: 'Tu, administratorul firmei și fiecare angajat semnați electronic, de pe telefon sau laptop. Documentul semnat rămâne la client și în arhiva ta.',
  },
];

export interface DocumentGroup {
  title: string;
  items: string[];
}

export const documentGroups: DocumentGroup[] = [
  {
    title: 'Pentru firmă',
    items: [
      'Contract de prestări servicii SSM',
      'Decizii de numire a responsabililor',
      'Instrucțiuni proprii de securitate',
      'Plan de prevenire și protecție',
    ],
  },
  {
    title: 'Pentru fiecare angajat',
    items: [
      'Fișă de instruire individuală',
      'Declarații la angajare',
      'Proces-verbal de predare a echipamentului',
      'Fișă de aptitudine, la dosar',
    ],
  },
  {
    title: 'Instruire și testare',
    items: [
      'Tematici de instruire',
      'Teste cu punctaj și prag de promovare',
      'Fișa de testare anuală',
      'Proces-verbal de instruire',
    ],
  },
];

export const documentsNote =
  'Pornim cu documentele pe care le faci cel mai des și adăugăm restul împreună cu primii utilizatori. Orice document deja existent poate fi încărcat și păstrat la dosar.';

export interface Signer {
  who: string;
  signs: string;
}

export const signers: Signer[] = [
  {
    who: 'Tu, specialistul',
    signs: 'Contractul, fișele de instruire, procesele-verbale și rapoartele pe care le emiți.',
  },
  {
    who: 'Administratorul clientului',
    signs: 'Contractul, deciziile și documentele pe care firma trebuie să și le asume.',
  },
  {
    who: 'Fiecare angajat',
    signs:
      'Fișa de instruire, declarațiile și procesul-verbal de predare, de pe telefon, în două minute.',
  },
];

export const signatureNote =
  'Semnătura este furnizată de un furnizor autorizat de servicii de încredere, nu de un simplu click. Fiecare document semnat păstrează dovada validării și poate fi verificat oricând.';

export const reasons: Step[] = [
  {
    title: 'Fără date copiate de mână',
    text: 'Numele firmei, adresa punctului de lucru, funcția angajatului: le scrii o dată și apar corect în fiecare document.',
  },
  {
    title: 'Fără versiuni pierdute',
    text: 'Fiecare document are o singură versiune în vigoare, cu istoricul modificărilor și al semnăturilor.',
  },
  {
    title: 'Fără drumuri pentru o semnătură',
    text: 'Angajatul semnează de pe telefon. Administratorul, de la birou. Tu vezi în timp real cine a semnat și cine nu.',
  },
  {
    title: 'Fără fișiere împrăștiate',
    text: 'Nu mai muți documente între Word, PDF, email și aplicația de semnat. Totul se întâmplă în același loc.',
  },
];

export const alsoIncluded: Step[] = [
  {
    title: 'Toți clienții pe o singură pagină',
    text: 'Vezi dintr-o privire ce este de făcut la fiecare firmă și ce așteaptă răspunsul clientului.',
  },
  {
    title: 'Termenele apar singure',
    text: 'Instruirile periodice și documentele care expiră se programează automat și îți amintesc la timp.',
  },
  {
    title: 'Vizite și constatări',
    text: 'Notezi ce ai găsit la fața locului, cu fotografii, și urmărești remedierea până la închidere.',
  },
  {
    title: 'Dosarul pentru control',
    text: 'Exporți documentele, semnăturile și istoricul unui client sau al unui angajat în câteva minute.',
  },
];

export const trust: Step[] = [
  {
    title: 'Datele rămân ale tale',
    text: 'Exporți oricând documentele în PDF sau Word, inclusiv dacă renunți la platformă.',
  },
  {
    title: 'Găzduire în Uniunea Europeană',
    text: 'Datele clienților și ale angajaților sunt stocate în UE, separate strict între firme.',
  },
  {
    title: 'Verificat cu specialiști',
    text: 'Șabloanele și fluxurile de semnare sunt revizuite cu specialiști SSM și consultanță juridică.',
  },
];

export interface Faq {
  q: string;
  a: string;
}

export const faq: Faq[] = [
  {
    q: 'Pot să îmi creez un cont acum?',
    a: 'Încă nu. Platforma este în dezvoltare și lucrăm cu un număr mic de servicii externe. Lasă-ne adresa de email și te anunțăm când se deschid înregistrările.',
  },
  {
    q: 'Cui i se adresează SSM Ușor?',
    a: 'Serviciilor externe de prevenire și protecție din România, indiferent de mărime. Angajatorii și angajații folosesc platforma ca participanți, prin serviciul lor extern.',
  },
  {
    q: 'Ce documente pot face în platformă?',
    a: 'Contractul de prestări servicii, decizii, declarații, instrucțiuni proprii, fișe de instruire, tematici, teste și procese-verbale. Lista crește; orice alt document poate fi încărcat și păstrat la dosar.',
  },
  {
    q: 'Cum funcționează semnătura electronică?',
    a: 'Printr-un furnizor autorizat de servicii de încredere. Fiecare semnatar primește documentul pe email, îl semnează de pe telefon sau laptop, iar documentul final păstrează dovada validării.',
  },
  {
    q: 'Pot să îmi aduc angajații dintr-un fișier existent?',
    a: 'Da, din Excel sau CSV, cu verificare înainte de import. O integrare cu REGES-ONLINE nu este disponibilă și nu o promitem până nu o putem livra.',
  },
  {
    q: 'Cât costă?',
    a: 'Nu am publicat încă prețurile. Ne gândim la un abonament lunar pentru serviciul extern, în funcție de numărul de angajați gestionați, cu semnăturile incluse transparent.',
  },
];
