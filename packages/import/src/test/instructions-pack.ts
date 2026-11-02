// An invented own-instructions pack; no text here comes from a real one.
import type { InstructionsFile } from '../instructions-cut';
import { type DocxParagraph, paragraphLine } from '../instructions-docx';

export const article = (number: number, text: string): DocxParagraph => ({
  text,
  numbered: { level: 0, label: `Art. ${number}.` },
});

export const point = (label: string, text: string): DocxParagraph => ({
  text,
  numbered: { level: 1, label },
});

export const line = (text: string): DocxParagraph => ({ text });

export function packFile(path: string, paragraphs: DocxParagraph[]): InstructionsFile {
  return { path, paragraphs, text: paragraphs.map(paragraphLine).join('\n') };
}

export const grinderHeading =
  'Subcapitolul XIII.I. Instrucțiuni proprii privind utilizarea mașinii de tocat carne la brutăria din curte';
export const tillHeading =
  'Subcapitolul XIII.II. Instrucțiuni proprii privind lucrul la casa de marcat și la cântarul electronic din magazin';
export const bakerHeading =
  'I.P.S.S.M. 1. Instrucțiuni proprii privind activitățile desfășurate de brutarii care lucrează în schimbul de noapte';

export const sharedEnding =
  'Ambalajele goale se strâng la sfârșitul fiecărei zile și se duc la containerul pentru hârtie și carton din spatele clădirii.';

export const ipssm = packFile('SSM/3.2._IPSSM.docx', [
  line('CUPRINS'),
  line(`${grinderHeading} ........ 12`),
  line(`${tillHeading} ........ 14`),
  line('Capitolul I. Informații generale'),
  article(1, 'Prezentele instrucțiuni se aplică tuturor lucrătorilor brutăriei.'),
  article(2, 'Fiecare lucrător își însușește instrucțiunile la angajare.'),
  article(3, 'Conducătorul locului de muncă verifică respectarea instrucțiunilor zilnic.'),
  line('Capitolul XIII. Instrucțiuni specifice activităților'),
  line(grinderHeading),
  article(4, 'Mașina de tocat se pornește numai cu capacul de protecție montat și închis.'),
  point('a)', 'carnea se împinge numai cu împingătorul din lemn livrat cu mașina;'),
  point('b)', 'mâinile nu se introduc niciodată în gura de alimentare a mașinii.'),
  article(5, 'Înainte de curățare mașina se oprește și se scoate ștecherul din priză.'),
  article(6, sharedEnding),
  line(tillHeading),
  article(
    7,
    'Casa de marcat se folosește numai de lucrătorii instruiți de furnizorul ei autorizat.'
  ),
  article(8, 'Cântarul electronic se verifică metrologic la termenele prevăzute de lege.'),
  article(9, sharedEnding),
  line(bakerHeading),
  article(1, 'Brutarul verifică la începutul schimbului starea cuptorului și a malaxorului.'),
  article(2, 'Tăvile fierbinți se scot din cuptor numai cu mănușile termorezistente din dotare.'),
  article(3, 'La sfârșitul schimbului brutarul predă locul de muncă curat schimbului de zi.'),
]);

export const ipsu = packFile('PSI/2.2._IPSU.docx', [
  line('Capitolul I. Dispoziții generale'),
  article(1, 'Prezentele instrucțiuni stabilesc regulile de apărare împotriva incendiilor.'),
  article(2, 'Fumatul este interzis în toate spațiile societății, cu excepția locului amenajat.'),
  article(3, 'Căile de evacuare se păstrează libere în permanență și sunt semnalizate.'),
  line(
    'Anexa nr. 1 INSTRUCȚIUNI DE APĂRARE ÎMPOTRIVA INCENDIILOR SPECIFICE ACTIVITĂȚILOR DESFĂȘURATE ÎN BRUTĂRII'
  ),
  article(1, 'Cuptoarele se exploatează numai de personal instruit și autorizat pentru ele.'),
  article(2, 'Făina se depozitează departe de sursele de căldură, în saci pe paleți de lemn.'),
  line(
    'Anexa nr. 2 INSTRUCȚIUNI DE APĂRARE ÎMPOTRIVA INCENDIILOR SPECIFICE ACTIVITĂȚILOR DESFĂȘURATE ÎN MAGAZINE'
  ),
  article(1, 'În magazin nu se folosesc aparate electrice improvizate sau cu cabluri deteriorate.'),
  article(2, 'Stingătoarele se păstrează la vedere, lângă ieșire, și se verifică anual.'),
]);
