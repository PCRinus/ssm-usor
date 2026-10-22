// Merge data for the three knowledge tests (ADR 024), in the shape the API builds from the
// question bank: the sample's questions, and two more for a bank that grew.

export type KnowledgeTestCode = 'TASSM' | 'TASU' | 'TPSU';

type Question = [text: string, options: string[], correct: number[]];

const pools: Record<KnowledgeTestCode, { title: string; questions: Question[] }> = {
  TASSM: {
    title: 'Test de verificare a cunoștințelor la angajare (TASSM)',
    questions: [
      [
        'Care este legea în vigoare care reglementează securitatea și sănătatea în muncă în România?',
        ['Legea 90/2002;', 'Legea 319/2006;', 'Legea 126/1995.'],
        [1],
      ],
      [
        'În sensul Legii securității și sănătății în muncă (Legea 319/2006), accidentul de muncă este definit prin următoarele elemente:',
        [
          'vătămarea violentă a organismului, precum și intoxicația acută profesională, care au loc în timpul procesului de muncă sau în îndeplinirea îndatoririlor de serviciu și care provoacă incapacitate temporară de muncă de cel puțin 3 zile calendaristice, invaliditate ori deces;',
          'locul, momentul producerii, gravitatea;',
          'vătămarea, locul, momentul producerii și calitatea victimei.',
        ],
        [0],
      ],
      [
        'Purtarea echipamentului de protecție acolo unde acesta a fost distribuit este obligatorie sau rămâne la latitudinea dumneavoastră utilizarea lui?',
        [
          'este obligatorie purtarea echipamentului de protecție;',
          'nu este obligatorie;',
          'numai atunci când considerăm noi că este cazul.',
        ],
        [0],
      ],
      [
        'Cum se numește accidentul produs pe traseul normal dintre domiciliu și locul de muncă?',
        ['Accident de circulație;', 'Accident de muncă;', 'Accident de traseu.'],
        [2],
      ],
      [
        'În cazul producerii unui accident de muncă, suferit de propria persoană sau de alte persoane participante la procesul de muncă, cum trebuie să procedeze lucrătorul?',
        [
          'să încerce să se trateze singur fără să mai știe cineva;',
          'să plece singur la spital sau policlinică;',
          'să anunțe imediat conducătorul locului de muncă, iar în cazul producerii unor accidente mortale sau colective să nu intervină neautorizat pentru modificarea stării de fapt.',
        ],
        [2],
      ],
      [
        'Care trebuie să fie starea fizică și psihică a angajaților ce se prezintă la programul de lucru?',
        [
          'obosiți după o noapte nedormită;',
          'într-o stare fizică și psihică corespunzătoare;',
          'bolnavi sau în stare de ebrietate.',
        ],
        [1],
      ],
      [
        'Ce trebuie să facă un angajat care constată orice defecțiune tehnică sau altă situație ce constituie un pericol de accidentare sau îmbolnăvire profesională?',
        [
          'să aducă imediat la cunoștința conducătorului locului de muncă situația;',
          'să încerce să nu se apropie de zona respectivă;',
          'să trateze cu indiferență situația creată.',
        ],
        [0],
      ],
      [
        'Este permisă părăsirea locului de muncă în timpul programului, precum și deplasarea în alte sectoare fără dispoziții din partea șefilor ierarhici?',
        [
          'doar în zonele nu prea îndepărtate;',
          'nu este permisă părăsirea locului de muncă și deplasarea în alte sectoare;',
          'doar până la cel mai apropiat magazin alimentar.',
        ],
        [1],
      ],
      [
        'Este permis angajaților să intervină în cazul constatării unor defecțiuni de natură electrică la instalațiile electrice din zona de lucru?',
        ['nu este permis;', 'doar dacă se pricep;', 'dacă au mănuși de protecție.'],
        [0],
      ],
      [
        'Ce semnifică un indicator de securitate de formă rotundă, cu fond albastru și pictogramă albă?',
        ['o interdicție;', 'o obligație;', 'un avertisment.'],
        [1],
      ],
      [
        'Ce veți face când primiți o sarcină de muncă care constă în utilizarea unui echipament de muncă nou pentru dumneavoastră, despre care nu știți cum se folosește?',
        [
          'cer conducătorului locului de muncă informațiile despre măsurile de securitate și instrucțiunile de utilizare ale echipamentului, pe care mi le însușesc;',
          'încerc să utilizez echipamentul așa cum cred eu;',
          'nu utilizez echipamentul până nu primesc informațiile de care am nevoie.',
        ],
        [0, 2],
      ],
      [
        'Instruirea lucrătorilor în domeniul securității și sănătății în muncă la nivelul unității se efectuează:',
        [
          'în afara orelor de program și este considerată timp de muncă;',
          'la începutul programului de lucru și nu este considerată timp de muncă;',
          'în timpul programului de lucru și este considerată timp de muncă.',
        ],
        [2],
      ],
    ],
  },
  TASU: {
    title: 'Test de verificare a cunoștințelor la angajare (TASU)',
    questions: [
      [
        'Ce lege reglementează apărarea împotriva incendiilor?',
        [
          'Legea 307/2006 privind apărarea împotriva incendiilor;',
          'Ordinul ministrului administrației și internelor nr. 712/2005;',
          'Legea 481/2004 privind protecția civilă.',
        ],
        [0],
      ],
      [
        'Cum se marchează locurile pentru fumat?',
        ['cu scrumiere;', 'prin indicatoare „LOC PENTRU FUMAT”;', 'cu vase cu nisip.'],
        [1],
      ],
      [
        'Căile de evacuare a persoanelor în caz de incendiu se marchează cu:',
        [
          'instrucțiuni de lucru;',
          'mijloace de stingere;',
          'indicatoare standardizate iluminate sau neiluminate.',
        ],
        [2],
      ],
      [
        'Instruirea în domeniul apărării împotriva incendiilor constituie:',
        [
          'verificarea cunoștințelor;',
          'planificarea timpului de lucru;',
          'parte componentă a pregătirii profesionale.',
        ],
        [2],
      ],
      [
        'Care este durata minimă a fiecăruia dintre instructajul introductiv general și instructajul specific locului de muncă?',
        ['12 ore;', '6 ore;', '8 ore.'],
        [2],
      ],
      [
        'În faza incipientă a unui incendiu se folosesc stingătoarele din dotare. Care este prima operațiune la folosirea unui stingător?',
        [
          'se îndreaptă furtunul acestuia către focar;',
          'se anunță directorul;',
          'se scoate siguranța.',
        ],
        [2],
      ],
      [
        'Cum se reglementează modul de evacuare într-o unitate civilă?',
        ['prin planul de evacuare;', 'prin alarma de incendiu;', 'nu se reglementează.'],
        [0],
      ],
      [
        'Planurile de evacuare se afișează:',
        ['pe fiecare nivel;', 'pe căile de acces;', 'în încăperi, pe partea interioară a ușilor.'],
        [0, 1, 2],
      ],
      [
        'Exercițiile de intervenție se efectuează:',
        [
          'planificat, pe bază de grafic, astfel încât la acestea să participe eșalonat toți salariații cu atribuții de intervenție de la locurile de muncă;',
          'inopinat, de către administrator/conducător, de autoritățile de control sau de alți factori de decizie;',
          'planificat, pe bază de grafic, cu personalul serviciului privat pentru situații de urgență (dacă este cazul).',
        ],
        [0, 1, 2],
      ],
      [
        'Pentru clădirile civile cu funcțiuni mixte (comerț, birouri, reuniuni), numărul minim de stingătoare raportat la suprafața desfășurată este:',
        ['1 buc./300 m²;', '2 buc./300 m²;', '3 buc./300 m².'],
        [0],
      ],
      [
        'Controlul intern privind respectarea normelor de apărare împotriva incendiilor poate fi executat de:',
        [
          'proprietarul construcției;',
          'conducătorii locurilor de muncă;',
          'persoanele care fac dovada atestării pregătirii profesionale în domeniul apărării împotriva incendiilor.',
        ],
        [0, 1, 2],
      ],
      [
        'În caz de incendiu, este interzisă utilizarea lifturilor la evacuare?',
        ['DA;', 'NU.'],
        [0],
      ],
    ],
  },
  TPSU: {
    title: 'Test de verificare a cunoștințelor anual (TPSU)',
    questions: [
      [
        'Hidranții interiori se folosesc pentru:',
        [
          'stingerea incendiilor, inclusiv în cazul unei explozii urmate de incendiu;',
          'propagarea incendiilor;',
          'înlăturarea efectelor negative ale incendiilor.',
        ],
        [0],
      ],
      [
        'În cazul sesizării unui incendiu, persoana care l-a sesizat va acționa astfel:',
        [
          'alertează forțele proprii sau forțele cu care unitatea a încheiat un contract sau o convenție pentru intervenția la incendiu;',
          'nu are nicio obligație;',
          'anunță patronul (administratorul) sau, după caz, managerul, directorul sau șeful sectorului de activitate.',
        ],
        [0, 2],
      ],
      [
        'Exercițiile și aplicațiile vizează modul în care se execută:',
        [
          'planul de prevenire și protecție;',
          'alarmarea, evacuarea și stingerea incendiului;',
          'deciziile de organizare și regulamentul de organizare și apărare împotriva incendiilor.',
        ],
        [1],
      ],
      [
        'Care este obligația salariaților de la locurile de muncă cu privire la instrucțiunile de apărare împotriva incendiilor?',
        [
          'nu au nicio obligație cu privire la acestea;',
          'să le studieze, să le însușească și să le aplice;',
          'să le citească.',
        ],
        [1],
      ],
      [
        'Blocarea cu mărfuri sau ambalaje a căilor de evacuare, salvare și intervenție în caz de incendiu, a hidranților, precum și a celorlalte mijloace de primă intervenție:',
        ['este interzisă;', 'este permisă pentru scurt timp;', 'nu este interzisă.'],
        [0],
      ],
      [
        'Instruirea în domeniul situațiilor de urgență (instructajul introductiv general, instructajul specific locului de muncă și instructajul periodic) pe locurile de muncă și pe categorii de salariați se face în baza:',
        [
          'tematicii anuale și a graficului de instruire, aprobate de conducătorul unității;',
          'instrucțiunilor proprii;',
          'deciziei angajatorului.',
        ],
        [0],
      ],
      [
        'Instruirea salariaților în domeniul situațiilor de urgență este:',
        [
          'obligatorie;',
          'cu caracter permanent și susținut;',
          'efectuată în timpul desfășurării procesului de producție și la locul de muncă.',
        ],
        [0, 1, 2],
      ],
      [
        'Fișele individuale de instructaj se întocmesc obligatoriu:',
        [
          'pentru toate persoanele angajate;',
          'pentru toate persoanele prezente la instructaj;',
          'pentru muncitori.',
        ],
        [0],
      ],
      [
        'Ușile spre căile de evacuare, ieșirile, casele scărilor și căile special prevăzute pentru evacuarea persoanelor și bunurilor materiale:',
        [
          'nu vor fi blocate sau suprimate, chiar dacă în clădire există și alte căi de evacuare practicabile și accesibile;',
          'pot fi blocate temporar, dacă în clădire există și alte căi de evacuare;',
          'vor fi lăsate deschise în permanență.',
        ],
        [0],
      ],
      [
        'Dacă încăperile sunt puternic încălzite și inundate de fum:',
        [
          'folosiți echipamentul de protecție aferent sau, în lipsa acestuia, aplicați-vă pe față, în dreptul gurii și al nasului, o batistă umedă și mergeți aplecat, deoarece concentrația fumului este mai mică și temperatura mai scăzută la nivelul pardoselii;',
          'fugiți spre cea mai apropiată ușă;',
          'săriți pe geam.',
        ],
        [0],
      ],
      [
        'În caz de incendiu, este interzisă utilizarea lifturilor la evacuare?',
        ['DA;', 'NU.'],
        [0],
      ],
      [
        'Care este prima operațiune la folosirea unui stingător?',
        [
          'se îndreaptă furtunul acestuia către focar;',
          'se anunță directorul;',
          'se scoate siguranța;',
          'se agită stingătorul de câteva ori.',
        ],
        [2],
      ],
    ],
  },
};

const letters = 'abcd';

export function knowledgeTestData(code: KnowledgeTestCode, count: number) {
  const pool = pools[code];
  if (count > pool.questions.length) {
    throw new Error(`The ${code} sample holds ${pool.questions.length} questions, not ${count}.`);
  }
  return {
    test: { code, title: pool.title },
    questions: pool.questions.slice(0, count).map(([text, options, correct], index) => ({
      number: index + 1,
      text,
      options: options.map((option, at) => ({ letter: letters[at]!, text: option })),
      key: correct.map((at) => letters[at]!.toUpperCase()).join(', '),
    })),
  };
}

export const knowledgeTestTemplates: Record<KnowledgeTestCode, string> = {
  TASSM: '5.1_test_hiring.docx',
  TASU: 'fire/4.1_fire_test_hiring.docx',
  TPSU: 'fire/4.2_fire_test_annual.docx',
};

export function knowledgeTestSamples(code: KnowledgeTestCode) {
  return [
    { label: 'ten', data: knowledgeTestData(code, 10) },
    { label: 'twelve', data: knowledgeTestData(code, 12) },
  ];
}
