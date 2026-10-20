// Merge data for the two individual training sheets (ADR 021), in the shape
// apps/api/src/modules/trainings/sheet.ts builds: an employee with every training of the domain
// recorded, and a new hire with none, whose sheet prints the hiring blocks blank.

export type SheetDomain = 'ssm' | 'psi';

const blank = (count: number) => Array.from({ length: count }, () => ({}));
const materialFieldLines = (count: number) =>
  Array.from({ length: count }, () => '\u2002'.repeat(57)).join('\n');

/** The paper sheet's choice of every form variant (ADR 023): the template prints as on paper. */
export function paperForm(domain: SheetDomain) {
  const rows: Record<string, boolean> = {};
  for (const table of domain === 'ssm' ? ['p', 's'] : ['p']) {
    for (let index = 1; index <= 17; index++) rows[`${table}${index}`] = false;
  }
  return {
    on: false,
    continuation: '',
    h1: { paper: false, materialPlaceholder: '' },
    h2: { paper: false, materialPlaceholder: '' },
    rows,
  };
}

const unrecorded = {
  heldOn: '',
  hours: '',
  trainer: '',
  trainerJobTitle: '',
  material: '',
  occupation: '',
  place: '',
};

const identity = {
  name: 'CONSTANTINESCU-MUNTEANU Alexandra-Ioana',
  employeeNumber: '0042',
  bloodGroup: 'A(II) Rh+',
  homeAddress: 'Str. Lungă nr. 12, bl. A3, sc. 2, ap. 14, Timișoara, jud. Timiș',
  birth: '14.03.1988, Lugoj',
  qualification: 'Sudor autorizat',
  education: 'Liceu tehnic',
  contractTitle: 'Sudor',
  workplace: 'Punct de lucru Str. Fabricii 3 – Atelier, teren',
  authorizations: 'ISCIR – macaragiu',
  commute: 'Str. Lungă – Calea Aradului – Str. Fabricii, cu autobuzul 33 (25 de minute)',
};

const ssmRecords = {
  hiring: {
    introductory: {
      ...unrecorded,
      heldOn: '05.01.2026',
      hours: '4',
      trainer: 'Dan MARIN',
      trainerJobTitle: 'Inspector SSM',
      material:
        'Conform MISSMIG Art. 1 – 325; Legislația de securitate și sănătate în muncă; Măsuri de acordare a primului ajutor, de prevenire și stingere a incendiilor și evacuarea lucrătorilor.',
      occupation: 'Sudor',
    },
    workplace: {
      ...unrecorded,
      heldOn: '06.01.2026',
      hours: '4',
      trainer: 'Ion POP',
      trainerJobTitle: 'Șef atelier',
      material: 'I.P.S.S.M. Art. 1 – 290; IP Sudură Art. 1 – 42; demonstrații practice.',
      occupation: 'Sudor',
      place: 'Punct de lucru Str. Fabricii 3 – Atelier, teren',
    },
  },
  admission: { admittedOn: '06.01.2026', name: 'Ion POP', jobTitle: 'Șef atelier' },
  signers: {
    introductory: { trainer: 'Dan MARIN', verifier: 'Dan MARIN' },
    workplace: { trainer: 'Ion POP', verifier: 'Dan MARIN' },
  },
};

const periodicRow = (heldOn: string, material: string) => ({
  heldOn,
  hours: '1,5',
  occupation: 'Sudor',
  material,
  trainer: 'Ion POP',
  verifier: 'Dan MARIN',
});

function ssmSample(recorded: boolean) {
  if (!recorded) {
    return {
      form: paperForm('ssm'),
      branding: true,
      client: { legalName: 'S.C. INSTALAȚII TERMICE ȘI SANITARE BANAT CONSTRUCT S.R.L.' },
      employee: { ...identity, authorizations: '', qualification: '', commute: identity.commute },
      hiring: { introductory: unrecorded, workplace: unrecorded },
      admission: { admittedOn: '', name: '', jobTitle: '' },
      periodic: [],
      supplementary: [],
      blankRows: { periodic: blank(17), supplementary: blank(17) },
      signers: {
        introductory: { trainer: '', verifier: '' },
        workplace: { trainer: '', verifier: '' },
      },
    };
  }
  return {
    form: paperForm('ssm'),
    branding: true,
    client: { legalName: 'S.C. INSTALAȚII TERMICE ȘI SANITARE BANAT CONSTRUCT S.R.L.' },
    employee: identity,
    ...ssmRecords,
    periodic: [
      periodicRow('03.04.2026', 'I.P.S.S.M. Art. 1 – 60; IP Sudură Art. 1 – 10'),
      periodicRow(
        '02.07.2026',
        'I.P.S.S.M. Art. 61 – 120; IP Sudură Art. 11 – 20; utilizarea echipamentului individual de protecție la sudarea în spații închise'
      ),
      periodicRow('05.10.2026', 'I.P.S.S.M. Art. 121 – 180; IP Sudură Art. 21 – 30'),
    ],
    supplementary: [
      {
        ...periodicRow(
          '18.05.2026',
          'IP Sudură Art. 31 – 42 (motivul: introducerea unui echipament de muncă sau modificarea celui existent)'
        ),
        hours: '1',
      },
    ],
    blankRows: { periodic: blank(13), supplementary: blank(16) },
  };
}

function psiSample(recorded: boolean) {
  const base = { ...ssmSample(recorded), form: paperForm('psi') };
  if (!recorded) return { ...base, blankRows: { periodic: blank(17), supplementary: [] } };
  return {
    ...base,
    hiring: {
      introductory: {
        ...base.hiring.introductory,
        hours: '8',
        trainer: 'Radu STAN',
        trainerJobTitle: 'Cadru tehnic PSI',
        material:
          'IPSU art. 1–104, 131–139, 150–152; Legea 307/2006; OMAI 712/2005; modul de acțiune în cazul unei situații de urgență; testare.',
      },
      workplace: {
        ...base.hiring.workplace,
        hours: '8',
        material:
          'IPSU art. 105–130; instrucțiunile afișate la locul de muncă; utilizarea stingătorului.',
      },
    },
    signers: {
      introductory: { trainer: 'Radu STAN', verifier: 'Radu STAN' },
      workplace: { trainer: 'Ion POP', verifier: 'Ion POP' },
    },
    periodic: [
      { ...base.periodic[0]!, hours: '2', material: 'IPSU art. 1–40', verifier: '' },
      {
        ...base.supplementary[0]!,
        material: 'IPSU art. 81–90 (motivul: reluarea activității după un accident de muncă)',
        verifier: '',
      },
      { ...base.periodic[1]!, hours: '2', material: 'IPSU art. 41–80', verifier: '' },
    ],
    supplementary: [],
    blankRows: { periodic: blank(14), supplementary: [] },
  };
}

export function trainingSheetSamples(domain: SheetDomain) {
  const sample = domain === 'ssm' ? ssmSample : psiSample;
  return [
    { label: 'records', data: sample(true) },
    { label: 'empty', data: sample(false) },
  ];
}

/**
 * The first page of a signed sheet (ADR 023): the introductory training and the first two
 * periodic rows recorded from a paper sheet, every other row a field.
 */
export function trainingSheetFormSample(domain: SheetDomain) {
  const { data } = trainingSheetSamples(domain)[0]!;
  const form = paperForm(domain);
  for (const key of Object.keys(form.rows)) form.rows[key] = !['p1', 'p2'].includes(key);
  return {
    ...data,
    periodic: data.periodic.slice(0, 2),
    supplementary: [],
    blankRows: { periodic: [], supplementary: [] },
    form: {
      ...form,
      on: true,
      h1: { paper: true, materialPlaceholder: '' },
      // Two lines of the field's width, as the API draws it for the sample's workplace material.
      h2: { paper: false, materialPlaceholder: materialFieldLines(2) },
    },
  };
}
