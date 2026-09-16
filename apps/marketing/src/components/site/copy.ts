/**
 * Copy for the landing page and the shared header and footer.
 *
 * Narrative: an external SSM service adds a client, adds its employees, creates the documents,
 * contracts and tests for them, and gets everything signed by the right people, in one place.
 * Portfolio, deadlines, visits and evidence exist but stay secondary.
 *
 * Romanian, sentence case, with diacritics; one short line per item outside the hero.
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
    'Șabloane revizuite cu specialiști SSM.',
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
      q: 'Cât costă?',
      a: 'Prețurile nu sunt publicate încă. Vizăm un abonament lunar per serviciu extern, în funcție de angajații gestionați.',
    },
  ] satisfies Faq[],
};
