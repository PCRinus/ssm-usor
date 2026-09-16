import type { DocumentGroup, Faq, Signer, Step } from './content';

/**
 * Compact copy for the merged concept (/concepte/fluxul). Same story as content.ts, far fewer
 * words: one short line per item, no paragraphs outside the hero.
 */
export const compact = {
  lede: 'Adaugi clientul și angajații, creezi documentele și testele, semnezi cu toată lumea. Într-un singur loc.',
  audience:
    'Pentru servicii externe SSM din România, de la specialistul care lucrează singur la echipe întregi.',
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
