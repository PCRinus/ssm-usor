// Invented documents and model answers for the tests; no name or number here is real.

export const provider = {
  name: 'SERVICIUL EXTERN EXEMPLU S.R.L.',
  cui: '76543210',
  people: ['Marinescu Elena'],
};

export const decisionText = [
  'BRUTĂRIA FICTIVĂ S.R.L.',
  'CUI 12345674, J35/123/2015, cod CAEN 1071',
  'Sediul social: Timișoara, str. Exemplului nr. 5, jud. Timiș',
  'DECIZIA nr. 1 din 10.01.2025',
  'Administratorul societății, dl. Vasilescu Andrei, numește pe dna. Ionescu Maria, brutar,',
  'conducător al locului de muncă și lucrător desemnat pentru acordarea primului ajutor.',
  'Instruirea periodică se face la 6 luni pentru personalul de execuție, cu durata de 60 de minute.',
  'Pentru personalul tehnico-administrativ instruirea periodică nu se aplică.',
  '| Post | Riscuri | Echipament | Durata |',
  '| Brutar, Vânzător | Arsuri | Mănuși termorezistente | 6 luni |',
  'Punct de lucru: Magazin, Timișoara, str. Piața Mică nr. 2',
  'Reprezentantul lucrătorilor: Georgescu Dan, vânzător, admis la lucru 01.03.2020',
].join('\n');

export const fireText = [
  'BRUTĂRIA FICTIVĂ S.R.L.',
  'Lista mijloacelor de stingere',
  '| Loc | Tip | Număr |',
  '| Sediu – laborator | stingător P6 | 2 |',
  '| Sediu – birou | stingător G2 | 1 |',
  'Fumatul este interzis în toate spațiile societății.',
  'Instrucțiuni afișate – Sediu: suprafața utilă 1.250 mp, normă de dotare: clădiri comerciale.',
  'Punct de adunare: parcarea din spatele clădirii.',
  'Materiale combustibile: făină, ambalaje din carton.',
  'Deșeuri colectate: deșeuri menajere; carton și hârtie. Le colectează vânzătorii de serviciu.',
  'În sediu își desfășoară activitatea și chiriașul DEPOZITUL FICTIV S.R.L.',
  'Copiat din: ATELIERUL INVENTAT S.R.L. – Administrator Petrescu Ion',
].join('\n');

export const files = {
  'Dosar/Decizia 1.docx': decisionText,
  'Dosar/PSI/Lista mijloace.doc': fireText,
};

const decision = 'Dosar/Decizia 1.docx';
const fire = 'Dosar/PSI/Lista mijloace.doc';

const fact = (field: string, value: string, quote: string, file = decision, otherCompany = '') => ({
  field,
  value,
  file,
  quote,
  otherCompany,
});

const workplaceFact = (workplace: string, field: string, value: string, quote: string) => ({
  workplace,
  field,
  value,
  file: fire,
  quote,
  otherCompany: '',
});

export function wireAnswer() {
  return {
    facts: [
      fact('client.legalName', 'BRUTĂRIA FICTIVĂ S.R.L.', 'BRUTĂRIA FICTIVĂ S.R.L.'),
      fact('client.legalName', 'BRUTARIA FICTIVA S.R.L.', 'BRUTĂRIA FICTIVĂ S.R.L.', fire),
      fact('client.cui', 'RO12345674', 'CUI 12345674'),
      fact('client.tradeRegisterNumber', 'J35/123/2015', 'J35/123/2015'),
      fact('client.caenCode', '1071', 'cod CAEN 1071'),
      fact('client.countyCode', 'jud. Timiș', 'jud. Timiș'),
      fact('client.locality', 'Timișoara', 'Sediul social: Timișoara'),
      fact('client.legalRepresentativeName', 'Vasilescu Andrei', 'dl. Vasilescu Andrei'),
      fact(
        'client.legalRepresentativeName',
        'Petrescu Ion',
        'ATELIERUL INVENTAT S.R.L. – Administrator Petrescu Ion',
        fire,
        'ATELIERUL INVENTAT S.R.L.'
      ),
      fact('client.legalRepresentativeRole', 'Administrator', 'Administratorul societății'),
      fact(
        'trainingSchedule.workerTrainingIntervalMonths',
        '6 luni',
        'la 6 luni pentru personalul de execuție'
      ),
      fact('trainingSchedule.periodicTrainingMinutes', '60', 'cu durata de 60 de minute'),
      fact(
        'trainingSchedule.administrativeTrainingNotApplicable',
        'da',
        'tehnico-administrativ instruirea periodică nu se aplică'
      ),
      fact(
        'fireSafety.smokingPolicy',
        'forbidden_everywhere',
        'Fumatul este interzis în toate spațiile',
        fire
      ),
      fact(
        'fireSafety.wasteKinds',
        'deșeuri menajere; carton și hârtie; Deseuri menajere',
        'Deșeuri colectate: deșeuri menajere; carton și hârtie',
        fire
      ),
      fact(
        'fireSafety.wasteCollectors',
        'vânzătorii de serviciu',
        'Le colectează vânzătorii de serviciu',
        fire
      ),
      fact('fireSafety.hasThirdParties', 'true', 'își desfășoară activitatea și chiriașul', fire),
    ],
    workplaces: [
      {
        name: 'Sediu',
        county: 'TM',
        locality: 'Timișoara',
        addressLine: 'str. Exemplului nr. 5',
        isRegisteredOffice: true,
        activity: '',
        rooms: ['laborator'],
        file: decision,
        quote: 'Sediul social: Timișoara, str. Exemplului nr. 5',
        otherCompany: '',
      },
      {
        name: 'Magazin',
        county: '',
        locality: 'Timișoara',
        addressLine: 'str. Piața Mică nr. 2',
        isRegisteredOffice: false,
        activity: 'Comerț',
        rooms: [],
        file: decision,
        quote: 'Punct de lucru: Magazin, Timișoara, str. Piața Mică nr. 2',
        otherCompany: '',
      },
    ],
    workplaceFacts: [
      workplaceFact('Sediu', 'floorAreaM2', '1.250 mp', 'suprafața utilă 1.250 mp'),
      workplaceFact(
        'Sediul',
        'extinguisherNorm',
        'commercial_200',
        'normă de dotare: clădiri comerciale'
      ),
      workplaceFact(
        'Sediu',
        'assemblyPoint',
        'parcarea din spatele clădirii',
        'Punct de adunare: parcarea din spatele clădirii'
      ),
      workplaceFact(
        'Sediu',
        'combustibleMaterials',
        'făină, ambalaje din carton',
        'Materiale combustibile: făină, ambalaje din carton'
      ),
    ],
    jobPositions: [
      {
        name: 'Brutar',
        staffCategory: 'execution',
        trainingIntervalMonths: '',
        workZone: 'Laborator',
        activities: '',
        managementOnly: false,
        needsProtectiveEquipment: 'true',
        file: decision,
        quote: 'Ionescu Maria, brutar',
        otherCompany: '',
      },
      {
        name: 'Vânzător',
        staffCategory: '',
        trainingIntervalMonths: '',
        workZone: '',
        activities: '',
        managementOnly: false,
        needsProtectiveEquipment: '',
        file: decision,
        quote: 'Georgescu Dan, vânzător',
        otherCompany: '',
      },
    ],
    responsiblePersons: [
      {
        fullName: 'Ionescu Maria',
        jobTitle: 'brutar',
        roles: ['workplace_manager', 'first_aid', 'first_aid'],
        workplace: '',
        file: decision,
        quote: 'numește pe dna. Ionescu Maria, brutar',
        otherCompany: '',
      },
    ],
    fireEquipment: [
      {
        workplace: 'Sediu',
        room: 'laborator',
        kind: 'extinguisher',
        agent: 'powder',
        capacity: '6 kg',
        wheeled: false,
        count: '2',
        file: fire,
        quote: '| Sediu – laborator | stingător P6 | 2 |',
        otherCompany: '',
      },
      {
        workplace: 'Sediul',
        room: 'birou',
        kind: 'extinguisher',
        agent: 'co2',
        capacity: '2',
        wheeled: false,
        count: '1',
        file: fire,
        quote: 'Sediu – birou | stingător G2',
        otherCompany: '',
      },
    ],
    fireInstallations: [],
    protectiveEquipment: [
      {
        jobPositions: ['Brutar', 'Vânzător', 'brutar'],
        risk: 'Arsuri',
        item: 'Mănuși termorezistente',
        quantity: '',
        durationMonths: '6',
        allocation: 'personal_inventory',
        file: decision,
        quote: '| Brutar, Vânzător | Arsuri | Mănuși termorezistente | 6 luni |',
        otherCompany: '',
      },
    ],
    employees: [
      {
        role: 'workers_representative',
        lastName: 'Georgescu',
        firstName: 'Dan',
        cnp: '',
        birthDate: '',
        jobTitle: 'vânzător',
        hiredAt: '01.03.2020',
        file: decision,
        quote: 'Reprezentantul lucrătorilor: Georgescu Dan, vânzător, admis la lucru 01.03.2020',
        otherCompany: '',
      },
    ],
    notes: ['', 'Decizia de numire a echipei de intervenție lipsește.'],
  };
}
