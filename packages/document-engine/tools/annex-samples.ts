import type { AnnexBody } from '../src/annex';

// Invented instructions for the annex template's tests and previews; no client wrote them.

const article = (...paragraphs: string[]) => ({ kind: 'article' as const, paragraphs });
const heading = (text: string) => ({ kind: 'heading' as const, text });

export const ssmAnnexSample: AnnexBody = {
  blocks: [
    heading('Domeniul de aplicare'),
    article(
      'Prezenta instrucțiune se aplică lucrătorilor din bucătărie care pregătesc, gătesc și porționează alimente și care folosesc echipamentele din dotarea bucătăriei: plite, cuptoare, friteuze, mașina de tocat carne, feliatorul și mașina de spălat vase.'
    ),
    article(
      'Instrucțiunea completează instructajul la locul de muncă și nu înlocuiește instrucțiunile de utilizare ale producătorilor echipamentelor, care se păstrează la locul de muncă și se respectă întocmai.'
    ),
    heading('Calificarea necesară'),
    article(
      'La lucrul în bucătărie sunt admiși numai lucrătorii care:',
      'a) au fost declarați apți din punct de vedere medical pentru postul ocupat;',
      'b) au efectuat instructajul introductiv general și instructajul la locul de muncă;',
      'c) cunosc modul de folosire a echipamentelor pe care le utilizează;',
      'd) au fost instruiți în acordarea primului ajutor și în folosirea stingătoarelor din bucătărie.'
    ),
    heading('Înainte de începerea lucrului'),
    article(
      'Înainte de începerea lucrului, bucătarul verifică:',
      '1. starea pardoselii, care trebuie să fie curată, uscată și fără obstacole pe căile de circulație;',
      '2. starea cablurilor de alimentare, a ștecherelor și a prizelor echipamentelor electrice;',
      '3. funcționarea instalației de ventilare de deasupra plitelor și a cuptoarelor;',
      '4. existența și starea apărătorilor de protecție ale echipamentelor cu părți tăietoare, astfel:',
      'a) la mașina de tocat carne, apărătoarea gurii de alimentare și împingătorul;',
      'b) la feliator, apărătoarea discului și limitatorul de grosime;',
      'c) la mixerul planetar, grătarul de protecție al vasului;',
      'd) la robotul de bucătărie, capacul cu blocare.'
    ),
    article(
      'Defecțiunile constatate se anunță conducătorului locului de muncă. Echipamentul defect nu se folosește până la remedierea defecțiunii de către personal autorizat.'
    ),
    article(
      'Bucătarul își îmbracă echipamentul de lucru și echipamentul individual de protecție înainte de a intra în zona de preparare.'
    ),
    heading('În timpul lucrului'),
    article(
      'Mașina de tocat carne se alimentează numai cu împingătorul din dotare. Se interzice introducerea mâinii în gura de alimentare, chiar și cu mașina oprită, cât timp aceasta este conectată la rețea.'
    ),
    article(
      'Feliatorul se folosește numai cu apărătoarea discului montată. La feliere, bucata de aliment se fixează în suportul cu gheare, iar mâna se ține pe mânerul suportului.'
    ),
    article(
      'Vasele cu lichide fierbinți se manipulează cu mănuși termorezistente sau cu lavete uscate. Vasele mari, de peste 15 litri, se mută de către două persoane sau cu căruciorul din dotare.'
    ),
    article(
      'La lucrul cu friteuza:',
      '– uleiul se schimbă numai după răcire, cu friteuza scoasă din priză;',
      '– alimentele se scurg de apă înainte de a fi introduse în ulei;',
      '– coșul se coboară încet, pentru a evita stropirea cu ulei fierbinte;',
      '– nivelul uleiului se păstrează între reperele minim și maxim marcate pe cuvă.'
    ),
    article(
      'Cuțitele se folosesc numai pentru operațiile pentru care sunt destinate, se țin cu tăișul spre placa de tăiat și se depozitează în suportul lor, niciodată în chiuveta cu apă.'
    ),
    article(
      'Pardoseala se curăță imediat ce pe ea s-a vărsat ulei, apă sau resturi de alimente. Până la curățare, zona se semnalizează cu panoul „Atenție, pardoseală alunecoasă”.'
    ),
    heading('La terminarea lucrului'),
    article(
      'La terminarea lucrului, bucătarul:',
      'a) oprește echipamentele și le deconectează de la rețea;',
      'b) închide robinetele de gaz ale plitelor și ale cuptoarelor;',
      'c) curăță echipamentele numai după oprirea completă a părților în mișcare și după răcire;',
      'd) depozitează ustensilele și materialele de curățenie în locurile stabilite.'
    ),
    heading('Echipament de protecție necesar'),
    article(
      'Bucătarul poartă în timpul lucrului:',
      '• încălțăminte de lucru cu talpă antiderapantă;',
      '• șorț și mănuși termorezistente la lucrul cu vase fierbinți și la cuptor;',
      '• mănușă din plasă metalică la dezosare și la tranșarea cărnii.'
    ),
    heading('Acțiuni interzise'),
    article(
      'Se interzice:',
      '– folosirea echipamentelor fără apărătorile de protecție sau cu dispozitivele de siguranță scoase din funcțiune;',
      '– lăsarea nesupravegheată a vaselor cu ulei pe plita aprinsă;',
      '– stingerea cu apă a uleiului aprins;',
      '– alergarea în bucătărie și transportul cuțitelor neprotejate printre lucrători.'
    ),
    heading('Situații de urgență'),
    article(
      'În caz de accidentare, lucrătorul anunță imediat conducătorul locului de muncă, iar persoana instruită acordă primul ajutor cu materialele din trusa sanitară. La nevoie se apelează numărul unic de urgență 112.'
    ),
    article(
      'La aprinderea uleiului dintr-un vas, se oprește sursa de căldură, se acoperă vasul cu capacul sau cu pătura de incendiu și se folosește stingătorul pentru clasa F aflat lângă plite.'
    ),
    article(
      'La simțirea mirosului de gaz, se închide robinetul general de gaz, se aerisesc încăperile, nu se acționează întrerupătoare electrice și se anunță conducătorul locului de muncă.'
    ),
  ],
};

export const suAnnexSample: AnnexBody = {
  blocks: [
    heading('Domeniul de aplicare'),
    article(
      'Prezenta instrucțiune se aplică tuturor lucrătorilor care își desfășoară activitatea în birourile societății, precum și vizitatorilor însoțiți de aceștia.'
    ),
    heading('Surse de aprindere și materiale combustibile'),
    article(
      'Se interzice fumatul în birouri, pe holuri și în grupurile sanitare. Fumatul este permis numai în locul amenajat și semnalizat cu indicatorul „Loc pentru fumat”.'
    ),
    article(
      'Hârtiile, dosarele și ambalajele se păstrează în dulapuri sau pe rafturi, la cel puțin 1 m de radiatoare, de aparatele de încălzire și de corpurile de iluminat.'
    ),
    heading('Reguli în timpul lucrului'),
    article(
      'La folosirea aparatelor electrice:',
      'a) se folosesc numai aparate în stare bună, cu cablurile și ștecherele nedeteriorate;',
      'b) nu se conectează mai multe aparate de putere mare la aceeași priză multiplă;',
      'c) radiatoarele electrice portabile se folosesc numai cu acordul conducătorului locului de muncă.'
    ),
    heading('La terminarea programului'),
    article(
      'Ultimul lucrător care părăsește biroul oprește calculatoarele, imprimantele și aparatele de climatizare, scoate din priză aparatele care nu trebuie să rămână în funcțiune și stinge iluminatul.'
    ),
    heading('Dacă izbucnește un incendiu'),
    article(
      'Cel care observă un început de incendiu:',
      '1. anunță imediat colegii și conducătorul locului de muncă și apelează numărul unic de urgență 112;',
      '2. încearcă stingerea cu stingătorul din dotare, numai dacă nu își pune viața în pericol;',
      '3. părăsește încăperea pe calea de evacuare marcată și închide ușa în urma sa.'
    ),
    heading('Mijloacele de stingere și evacuarea'),
    article(
      'Stingătoarele se păstrează în locurile marcate, la vedere și ușor accesibile. Căile de evacuare și ușile de ieșire se păstrează libere, fără obiecte depozitate pe ele.'
    ),
  ],
};

const header = {
  branding: true,
  issueDate: '14.10.2026',
  provider: {
    legalName: 'PREVENT CONSULT S.R.L.',
    representativeRole: 'Administrator',
    representativeName: 'Andrei MUNTEANU',
  },
  client: {
    legalName: 'BISTRO GRĂDINA VERDE S.R.L.',
    representativeRole: 'Administrator',
    representativeName: 'Elena DRĂGHICI',
  },
};

export const ssmAnnexData = {
  ...header,
  number: 2,
  title: 'Bucătar',
  versionDate: '14.10.2026',
};

export const suAnnexData = {
  ...header,
  fireSafetyTechnician: { name: 'Mihai STANCU', certificate: 'seria B nr. 4321/2025' },
  number: 1,
  title: 'Birouri',
  versionDate: '02.11.2026',
};
