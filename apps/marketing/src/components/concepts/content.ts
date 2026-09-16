/**
 * Copy shared by the landing-page concepts under /concepte.
 * Grounded in docs/product-scope.md and docs/go-to-market-validation.md.
 * Everything here is in Romanian, sentence case, with diacritics.
 */

export const contact = {
  pilotHref:
    'mailto:pilot@ssmusor.ro?subject=Program%20pilot%20SSM%20U%C8%99or&body=Bun%C4%83%2C%0A%0AReprezint%20un%20serviciu%20extern%20SSM%20%C8%99i%20a%C8%99%20vrea%20s%C4%83%20discut%C4%83m%20despre%20programul%20pilot.%0A%0AFirma%3A%20%0ANum%C4%83r%20de%20clien%C8%9Bi%20activi%3A%20%0AEchipa%3A%20%0AInstrumentele%20folosite%20azi%3A%20',
  launchHref:
    'mailto:pilot@ssmusor.ro?subject=Anun%C8%9B%C4%83-m%C4%83%20la%20lansare&body=Bun%C4%83%2C%0A%0AVreau%20s%C4%83%20fiu%20anun%C8%9Bat%20c%C3%A2nd%20se%20lanseaz%C4%83%20SSM%20U%C8%99or.%0A%0AFirma%3A%20%0ARol%3A%20',
  email: 'pilot@ssmusor.ro',
};

export const cta = {
  pilot: 'Aplică pentru programul pilot',
  launch: 'Anunță-mă la lansare',
  talk: 'Programează o discuție de 20 de minute',
};

export const audience =
  'Pentru servicii externe de prevenire și protecție: de la specialistul care lucrează singur la echipe cu zeci de clienți din industrii diferite.';

export const status = {
  short: 'Platformă în dezvoltare. Căutăm parteneri de design.',
  long: 'SSM Ușor este în dezvoltare. Nu avem încă clienți plătitori și nu afișăm logo-uri sau statistici pe care nu le putem dovedi. Pagina descrie produsul pe care îl construim împreună cu primii furnizori.',
};

export interface Pillar {
  title: string;
  text: string;
  states: string[];
}

export const pillars: Pillar[] = [
  {
    title: 'Portofoliu de clienți',
    text: 'Firmele, punctele de lucru, contactele, responsabilii și serviciile contractate stau într-o singură structură. Vezi ce este de făcut, întârziat, blocat sau în așteptarea clientului, pentru toți clienții odată.',
    states: ['de făcut', 'întârziat', 'blocat', 'așteaptă clientul'],
  },
  {
    title: 'Studio de documente',
    text: 'Imporți fișierele existente, lucrezi din șabloane și clauze proprii, iar datele clientului se completează singure. Fiecare revizie rămâne în istoric, cu autor, motiv și aprobări.',
    states: ['ciornă', 'în revizuire', 'aprobat', 'semnat'],
  },
  {
    title: 'Angajați și obligații',
    text: 'Import de angajați cu validare și reconciliere, evenimente de angajare, mutare sau plecare, și sarcini recurente cu responsabil, termen și dependențe clare.',
    states: ['import', 'reconciliere', 'termen', 'reminder'],
  },
  {
    title: 'Instruire, testare și semnare',
    text: 'Programe pe grupuri de expunere, sesiuni cu termen, testare de pe telefon și fișa corectă generată automat din sesiunea încheiată, gata pentru fluxul de semnare.',
    states: ['invitat', 'în curs', 'promovat', 'semnat'],
  },
  {
    title: 'Vizite și măsuri corective',
    text: 'Planifici vizita, notezi constatările cu fotografii de pe telefon, atribui măsuri cu responsabil și termen, iar clientul încarcă dovada remedierii înainte de închidere.',
    states: ['constatare', 'măsură', 'dovadă', 'închis'],
  },
  {
    title: 'Dovezi și rapoarte',
    text: 'Versiuni, aprobări, semnături și acțiuni rămân legate între ele. Exporți dosarul unui angajat, raportul lunar pentru client sau pachetul pentru un control ITM în câteva minute.',
    states: ['jurnal', 'dosar', 'raport', 'export'],
  },
];

export const todayFlow = [
  { tool: 'Word', pain: 'Deschizi șablonul, înlocuiești manual datele firmei și ale angajatului.' },
  { tool: 'PDF', pain: 'Exporți, verifici paginarea, refaci exportul după fiecare corectură.' },
  { tool: 'Email', pain: 'Trimiți la client, aștepți răspuns, cauți ultima versiune în fir.' },
  {
    tool: 'Aplicație de semnare',
    pain: 'Încarci din nou fișierul, adaugi semnatarii, urmărești starea în alt loc.',
  },
  { tool: 'Dosar', pain: 'Salvezi în cloud sau la dosarul fizic și speri că e versiunea corectă.' },
  { tool: 'Excel', pain: 'Notezi manual termenul următor și pui un reminder în calendar.' },
];

export const platformFlow = [
  {
    step: 'Date client',
    text: 'Firma, punctul de lucru, funcția și grupul de expunere, o singură dată.',
  },
  { step: 'Document', text: 'Ciorna se generează din șablonul tău, cu datele deja completate.' },
  {
    step: 'Revizuire',
    text: 'Comentarii, modificări propuse și aprobarea clientului, în același document.',
  },
  {
    step: 'Semnare',
    text: 'PDF-ul final pleacă la semnat în ordinea stabilită, prin furnizor calificat.',
  },
  {
    step: 'Dovadă',
    text: 'Revizia se blochează, termenul următor apare singur, istoricul rămâne.',
  },
];

export const lifecycle = [
  { step: 'Șablon', text: 'Al tău sau importat din DOCX, cu raport despre ce s-a păstrat.' },
  {
    step: 'Clauze și variabile',
    text: 'Blocuri reutilizabile și câmpuri tipizate, cu sursa vizibilă.',
  },
  {
    step: 'Ciornă pentru client',
    text: 'Generată individual sau în lot din aceeași versiune de șablon.',
  },
  {
    step: 'Editare și revizuire',
    text: 'Modifici ciorna clientului fără să atingi șablonul comun.',
  },
  {
    step: 'Aprobare',
    text: 'Revizuire internă, apoi aprobarea clientului, cu decizii înregistrate.',
  },
  {
    step: 'PDF și semnături',
    text: 'Randare previzibilă, ancore de semnătură, ordine de semnare.',
  },
  {
    step: 'Revizie blocată',
    text: 'Distribuită, arhivată, cu termen de valabilitate și revizuire ulterioară.',
  },
];

export const studioDifferences = [
  {
    title: 'Ciorna clientului nu modifică șablonul',
    text: 'Editezi liber documentul unui client. Șablonul comun rămâne neatins și nu se creează copii care se rup unele de altele.',
  },
  {
    title: 'O modificare de șablon creează sarcini, nu suprascrie',
    text: 'Când publici o revizie nouă a unui șablon sau a unei clauze, platforma îți arată documentele afectate și deschide ciorne de revizuire. Niciun document emis sau semnat nu se schimbă pe ascuns.',
  },
  {
    title: 'Variabilele au sursă',
    text: 'Adresa punctului de lucru, funcția sau grupul de expunere vin din fișa clientului. Vezi de unde vine fiecare valoare și dacă a fost suprascrisă local.',
  },
  {
    title: 'Ieșirea e mereu deschisă',
    text: 'Export DOCX pentru cazurile excepționale și PDF cu amprentă pentru dovadă. Datele și documentele rămân ale tale, inclusiv la încetarea contractului.',
  },
];

export const dueSources = [
  {
    source: 'Recurență configurată',
    example: 'Instruire periodică la 6 luni pentru grupul „producție”.',
  },
  {
    source: 'Eveniment de angajat',
    example: 'Angajare, mutare la alt punct de lucru, revenire din suspendare.',
  },
  { source: 'Valabilitatea unui document', example: 'Fișa de aptitudine expiră în 30 de zile.' },
  {
    source: 'Constatare la vizită',
    example: 'Măsură corectivă cu termen și responsabil la client.',
  },
  {
    source: 'Livrabil contractual',
    example: 'Raport trimestrial de activitate promis în contract.',
  },
  {
    source: 'Revizuire legislativă',
    example: 'Un act modificat afectează trei șabloane și 40 de documente.',
  },
];

export const responsibilityMatrix = {
  columns: ['Furnizor', 'Administrator client', 'Conducător loc de muncă'],
  rows: [
    { task: 'Actualizează lista de angajați', owners: [false, true, false] },
    { task: 'Pregătește tematica și fișa', owners: [true, false, false] },
    { task: 'Face instruirea la locul de muncă', owners: [false, false, true] },
    { task: 'Semnează fișa de instruire', owners: [true, false, true] },
    { task: 'Încarcă dovada remedierii', owners: [false, true, true] },
    { task: 'Închide măsura corectivă', owners: [true, false, false] },
  ],
};

export const outcomes = [
  {
    title: 'Preiei un client nou',
    text: 'Imporți structura, oamenii și documentele existente, aplici pachetul de servicii convenit și vezi de la început ce lipsește.',
  },
  {
    title: 'Procesezi un angajat nou',
    text: 'Clientul introduce angajarea cu data efectivă, platforma propune pachetul de documente și instruire, iar tu îl confirmi.',
  },
  {
    title: 'Rulezi instruirea periodică',
    text: 'Îngheți materialul și populația eligibilă într-o sesiune, urmărești progresul și primești fișele corecte, gata de semnat.',
  },
  {
    title: 'Închizi o măsură corectivă',
    text: 'Clientul trimite dovada, o accepți sau o respingi cu motiv, iar raportul de vizită semnat intră în dosarul de dovezi.',
  },
];

export const principles = [
  {
    title: 'Furnizorul conduce, angajatul termină repede',
    text: 'Tu ai nevoie de control asupra portofoliului. Angajatul are nevoie de un flux de două minute, de pe telefon, fără instalări.',
  },
  {
    title: 'Dovada înaintea comodității',
    text: 'Fiecare acțiune importantă are autor, moment, versiune și rezultat. Un „conform” fără istoric nu există.',
  },
  {
    title: 'Omul aprobă',
    text: 'Automatizarea pregătește și rutează. Specialistul autorizat și angajatorul decid și semnează.',
  },
  {
    title: 'Reguli configurate, nu deducții opace',
    text: 'Platforma aplică regulile și șabloanele revizuite de tine și arată de ce există o obligație. Nu ghicește din codul CAEN.',
  },
  {
    title: 'O sursă, multe documente',
    text: 'Datele despre firmă, punct de lucru, funcție și angajat alimentează documentele, instruirile, sarcinile și rapoartele.',
  },
];

export const pilotOffer = {
  give: [
    'Acces la primele fluxuri, înaintea lansării publice.',
    'Migrarea unui client real, cu șabloanele tale, inclusă în pilot.',
    'Influență directă asupra documentelor și fluxurilor pe care le construim primele.',
    'Preț de partener pe durata pilotului și după.',
  ],
  ask: [
    'Ne arăți, anonimizat, cum lucrezi azi: șabloane, foldere, foaia de termene.',
    'Migrezi un client real și rulezi cu el două cicluri recurente.',
    'Ne spui sincer ce nu merge, într-o discuție scurtă la două săptămâni.',
  ],
};

export const trust = [
  {
    title: 'Revizuire de specialist',
    text: 'Șabloanele, regulile și fluxurile de semnare sunt validate cu specialiști SSM și consultanță juridică înainte de fiecare lansare.',
  },
  {
    title: 'Semnătură prin furnizor calificat',
    text: 'Nu construim un click cu cod OTP pe care să îl numim semnătură. Orchestrăm fluxul unui furnizor de servicii de încredere și păstrăm dovada validării.',
  },
  {
    title: 'Datele rămân ale tale',
    text: 'Export DOCX, PDF și pachete structurate oricând, inclusiv la încetarea contractului. Fără blocare în platformă.',
  },
  {
    title: 'Confidențialitate din construcție',
    text: 'Găzduire în UE, izolare strictă între furnizori și între clienți, CNP opțional și mascat, fără date personale în loguri sau în modele AI.',
  },
];

export const faq = [
  {
    q: 'Ce există azi și ce este încă în lucru?',
    a: 'Azi avem direcția de produs validată cu documentație și prototipuri clicabile pentru studioul de documente, tabloul de portofoliu și fluxul de instruire. Fluxul complet de la șablon la document semnat se construiește cu partenerii pilot. Nu afișăm capturi de ecran ale unor funcții care nu există.',
  },
  {
    q: 'Cui i se adresează SSM Ușor?',
    a: 'Serviciilor externe de prevenire și protecție autorizate, care gestionează mai multe firme client. Angajatorii și angajații folosesc platforma ca participanți, prin furnizorul lor.',
  },
  {
    q: 'Ce documente pot fi create în platformă?',
    a: 'Începem cu un set restrâns, agreat cu specialiști: tematici și programe de instruire, fișe individuale de instruire, fișa de testare anuală, decizii și declarații frecvente, procese-verbale de predare și rapoarte de vizită. Restul documentelor pot fi importate, versionate și urmărite ca valabilitate.',
  },
  {
    q: 'Cum funcționează semnarea electronică?',
    a: 'Integrăm un furnizor calificat de servicii de încredere și păstrăm PDF-ul final, rezultatul validării, amprenta documentului și jurnalul fluxului. Tipul de semnătură pentru fiecare categorie de document se stabilește cu consultanță juridică.',
  },
  {
    q: 'Există integrare cu REGES-ONLINE?',
    a: 'Nu promitem o integrare pe care nu am verificat-o. Începem cu import de angajați din CSV sau XLSX, cu previzualizare, validare și reconciliere. Integrări suplimentare urmează după ce sunt confirmate oficial.',
  },
  {
    q: 'Cât costă?',
    a: 'Nu avem încă o listă de prețuri. Ipoteza pe care o testăm este un abonament de bază per furnizor plus un nivel pentru angajații gestionați, cu semnăturile facturate transparent. Partenerii pilot primesc un preț de partener.',
  },
  {
    q: 'Când începe pilotul?',
    a: 'Selectăm 2–3 furnizori pentru primul pilot. Discuțiile de calificare încep imediat, iar migrarea primului client se face împreună cu echipa noastră.',
  },
];
