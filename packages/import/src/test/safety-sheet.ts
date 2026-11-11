import type { SafetySheetAnswer } from '../safety-sheet';

// An invented product of an invented supplier, laid out as pdftotext lays out a sheet.
export const sheetText = `FIȘA CU DATE DE SECURITATE
conform Regulamentului (CE) nr. 1907/2006 (REACH), anexa II
Degresant Rapid DX-40                                   Versiunea 3.1   Data revizuirii: 02.03.2026

SECȚIUNEA 1: Identificarea substanței/amestecului și a societății/întreprinderii
1.1. Element de identificare a produsului
     Denumire comercială: Degresant Rapid DX-40
1.2. Utilizări relevante identificate: degresant pentru suprafețe metalice, uz profesional
1.3. Furnizor: Chimica Nordvest SRL, Str. Fabricii nr. 12, Bistrița
1.4. Telefon de urgență: 021 000 0000

SECȚIUNEA 2: Identificarea pericolelor
2.1. Clasificarea substanței sau a amestecului
     Regulamentul (CE) nr. 1272/2008: Flam. Liq. 2, H225; Eye Irrit. 2, H319; STOT SE 3, H336
2.2. Elemente pentru etichetă
     Fraze de pericol: H225 Lichid și vapori foarte inflamabili. H319 Provoacă o iritare gravă a ochilor.
     H336 Poate provoca somnolență sau amețeală.
2.3. Alte pericole: vaporii pot forma amestecuri explozive cu aerul.

SECȚIUNEA 3: Compoziție/informații privind componenții
3.2. Amestecuri
     Etanol          CAS 64-17-5    CE 200-578-6   50–70 %   Flam. Liq. 2, H225; Eye Irrit. 2, H319
     Propan-2-ol     CAS 67-63-0    CE 200-661-7   10–20 %   Flam. Liq. 2, H225; STOT SE 3, H336

SECȚIUNEA 4: Măsuri de prim ajutor
4.1. Inhalare: se scoate persoana la aer liber. Contact cu ochii: se clătește cu apă 15 minute.
     Ingestie: nu se provoacă voma; se cere sfatul medicului.

SECȚIUNEA 5: Măsuri de combatere a incendiilor
5.1. Mijloace de stingere corespunzătoare: spumă rezistentă la alcool, pulbere, CO2.
     Mijloace de stingere necorespunzătoare: jet de apă compact.
5.2. Pericole speciale: vaporii sunt mai grei decât aerul și se pot aprinde de la distanță.
5.3. Recomandări pentru pompieri: aparat de respirat autonom; se răcesc recipientele cu apă pulverizată.

SECȚIUNEA 6: Măsuri de luat în caz de dispersie accidentală
6.1. Se îndepărtează sursele de aprindere și se aerisește zona.
6.3. Se absoarbe cu nisip sau cu un absorbant inert; nu se deversează în canalizare.

SECȚIUNEA 7: Manipularea și depozitarea
7.1. Se manipulează departe de surse de aprindere; se folosesc unelte care nu produc scântei.
7.2. Se păstrează în recipientul original închis, într-un spațiu răcoros și ventilat, ferit de oxidanți.

SECȚIUNEA 8: Controale ale expunerii/protecția personală
8.2. Ochelari de protecție; mănuși din cauciuc nitrilic; ventilație locală.

SECȚIUNEA 9: Proprietățile fizice și chimice
9.1. Stare fizică: lichid. Culoare: incolor. Miros: alcoolic. Punct de inflamabilitate: 13 °C.
     Punct de fierbere: 78 °C. Limite de explozie: 3,1–19 % vol.

SECȚIUNEA 10: Stabilitate și reactivitate
10.1. Stabil în condiții normale.

SECȚIUNEA 11: Informații toxicologice
11.1. Iritant pentru ochi; vaporii pot provoca somnolență.

SECȚIUNEA 12: Informații ecologice
12.1. Nu există date.

SECȚIUNEA 13: Considerații privind eliminarea
13.1. Se elimină ca deșeu periculos.

SECȚIUNEA 14: Informații referitoare la transport
14.1. Numărul ONU: UN 1993

SECȚIUNEA 15: Informații de reglementare
15.1. Regulamentul (CE) nr. 1907/2006; Regulamentul (CE) nr. 1272/2008.

SECȚIUNEA 16: Alte informații
16.1. Fișa a fost revizuită la secțiunile 2 și 9.`;

export const datasheetText = `FIȘĂ TEHNICĂ
Degresant Rapid DX-40
Aplicare: se pulverizează pe suprafață și se șterge după 2 minute.
Ambalaj: flacon de 1 l, bidon de 5 l.`;

export const answer = (overrides: Partial<SafetySheetAnswer> = {}): SafetySheetAnswer => ({
  isSafetyDataSheet: true,
  productName: 'Degresant Rapid DX-40',
  notClassified: false,
  hazards: [
    { hazardClass: 'Flam. Liq. 2', statements: ['H225'] },
    { hazardClass: 'Eye Irrit. 2', statements: ['H319'] },
    { hazardClass: 'STOT SE 3', statements: ['H336'] },
  ],
  components: [
    { name: 'Etanol', cas: '64-17-5', ec: '200-578-6' },
    { name: 'Propan-2-ol', cas: '67-63-0', ec: '200-661-7' },
  ],
  unNumber: '1993',
  physicalChemicalProperties:
    'Lichid incolor, miros alcoolic; punct de inflamabilitate 13 °C; punct de fierbere 78 °C; limite de explozie 3,1–19 % vol.',
  healthEnvironmentRisks:
    'Lichid și vapori foarte inflamabili; iritare gravă a ochilor; poate provoca somnolență sau amețeală.',
  protectionMeans: 'Ochelari de protecție; mănuși din cauciuc nitrilic; ventilație locală.',
  interventionMeasures:
    'Inhalare: la aer liber; ochi: clătire cu apă 15 minute; ingestie: nu se provoacă voma, se cere sfatul medicului; pompierii poartă aparat de respirat autonom și răcesc recipientele cu apă pulverizată; la scurgere se îndepărtează sursele de aprindere și se aerisește.',
  extinguishingAgents:
    'Spumă rezistentă la alcool, pulbere, CO2; nu se folosește jet de apă compact; scurgerile se absorb cu nisip sau absorbant inert.',
  handling:
    'Departe de surse de aprindere, cu unelte care nu produc scântei; în recipientul original închis, în spațiu răcoros și ventilat, ferit de oxidanți.',
  ...overrides,
});
