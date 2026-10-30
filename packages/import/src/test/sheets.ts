// Invented training sheets and the answers a model would give for their pages; no name or code
// here is real. The CNPs are made valid with the contracts' control digit.

import type { SheetPageInput, TrainingThemes } from '../employee-import';
import type { ExistingEmployee } from '../employee-match';
import type { SheetPage, SheetRow } from '../sheet-page';

export const today = '2026-10-31';

export const cnps = {
  coman: '2850615320013',
  toma: '1990303123453',
  rusu: '2751201407896',
  pop: '2900720350112',
};

export const positions = [
  { id: '00000000-0000-4000-8000-000000000101', name: 'Patiser' },
  { id: '00000000-0000-4000-8000-000000000102', name: 'Brutar' },
  { id: '00000000-0000-4000-8000-000000000103', name: 'Vânzător' },
];

export const workplaces = [
  { id: '00000000-0000-4000-8000-000000000201', name: 'Sediu', addressLine: 'Str. Morii nr. 4' },
  {
    id: '00000000-0000-4000-8000-000000000202',
    name: 'Magazin Centru',
    addressLine: 'Piața Mare nr. 1',
  },
];

type PageParts = {
  pageKind?: SheetPage['pageKind'];
  person?: Partial<SheetPage['person']>;
  fields?: Partial<SheetPage['fields']>;
  admission?: Partial<SheetPage['admission']>;
  trainings?: SheetRow[];
  unreadable?: string[];
  notes?: string[];
};

export function page(parts: PageParts): SheetPage {
  return {
    pageKind: parts.pageKind ?? 'ssm_periodic',
    person: { lastName: null, firstName: null, cnp: null, employeeNumber: null, ...parts.person },
    fields: {
      birthDate: null,
      birthPlace: null,
      homeAddress: null,
      education: null,
      qualification: null,
      bloodGroup: null,
      rhFactor: null,
      jobTitle: null,
      hiredAt: null,
      leftOn: null,
      workplace: null,
      commuteRoute: null,
      commuteMinutes: null,
      ...parts.fields,
    },
    admission: {
      admittedOn: null,
      admittedByName: null,
      admittedByJobTitle: null,
      ...parts.admission,
    },
    trainings: parts.trainings ?? [],
    unreadable: parts.unreadable ?? [],
    notes: parts.notes ?? [],
  };
}

export function row(parts: Partial<SheetRow>): SheetRow {
  return {
    domain: 'ssm',
    phase: 'periodic',
    annualTest: false,
    heldOn: '2025-07-14',
    durationMinutes: 120,
    trainerName: 'Barbu Ionuț',
    trainerJobTitle: 'Inspector SSM',
    verifierName: null,
    verifierJobTitle: null,
    material: 'Riscuri la cuptor și malaxor',
    supplementaryReason: null,
    traineeSignature: 'present',
    trainerSignature: 'present',
    verifierSignature: 'absent',
    ...parts,
  };
}

const hiringRows = (
  domain: SheetRow['domain'],
  verifierSignature: SheetRow['verifierSignature']
) => [
  row({
    domain,
    phase: 'introductory_general',
    heldOn: '2021-01-18',
    durationMinutes: domain === 'ssm' ? 480 : 120,
    trainerJobTitle: domain === 'ssm' ? 'Inspector SSM' : 'Cadru tehnic PSI',
    material: 'Instruire introductiv-generală',
    verifierName: domain === 'ssm' ? 'Mureșan Ioana' : null,
    verifierJobTitle: domain === 'ssm' ? 'Administrator' : null,
    verifierSignature: domain === 'ssm' ? verifierSignature : 'absent',
  }),
  row({
    domain,
    phase: 'workplace',
    heldOn: '2021-01-19',
    durationMinutes: domain === 'ssm' ? 480 : 120,
    trainerName: 'Matei Sorin',
    trainerJobTitle: 'Șef de tură',
    material: 'Instruire la locul de muncă',
    verifierName: domain === 'psi' ? 'Barbu Ionuț' : null,
    verifierJobTitle: domain === 'psi' ? 'Cadru tehnic PSI' : null,
    verifierSignature: domain === 'psi' ? verifierSignature : 'absent',
  }),
];

const admission = {
  admittedOn: '2021-01-20',
  admittedByName: 'Mureșan Ioana',
  admittedByJobTitle: 'Administrator',
};

// Coman Daniela: three photographs, the second a periodic page with no name.
export const comanFront = page({
  pageKind: 'ssm_sheet_front',
  person: { lastName: 'Coman', firstName: 'Daniela', cnp: cnps.coman, employeeNumber: '12' },
  fields: {
    birthDate: '1985-06-15',
    birthPlace: 'Sibiu',
    homeAddress: 'Str. Fabricii nr. 21, Sibiu',
    bloodGroup: 'A II Rh+',
    jobTitle: 'Patiseră',
    hiredAt: '2021-01-18',
    workplace: 'Sediu',
  },
  admission,
  trainings: hiringRows('ssm', 'present'),
});

export const comanPeriodic = page({
  pageKind: 'ssm_periodic',
  trainings: [
    row({ heldOn: '2024-07-15', durationMinutes: 180 }),
    row({ heldOn: '2025-01', material: null, trainerJobTitle: null }),
    row({ heldOn: '2025-07-14', material: 'Prim ajutor, arsuri', traineeSignature: 'absent' }),
    row({ heldOn: '2026-07', material: 'Instrucțiuni proprii cuptor gaz' }),
  ],
});

export const comanFire = page({
  pageKind: 'psi_sheet_front',
  person: { lastName: 'Coman', firstName: 'Daniela' },
  admission,
  trainings: [
    ...hiringRows('psi', 'present'),
    row({
      domain: 'psi',
      heldOn: '2026-03-12',
      durationMinutes: 60,
      annualTest: true,
      material: 'Testare anuală',
      trainerJobTitle: 'Cadru tehnic PSI',
      verifierSignature: 'no_box',
    }),
  ],
});

// Toma Andrei: his name misread on the second page, and a verifier's box left empty.
export const tomaFront = page({
  pageKind: 'ssm_sheet_front',
  person: { lastName: 'Toma', firstName: 'Andrei Mihai', cnp: cnps.toma },
  fields: {
    birthDate: '1999-03-03',
    jobTitle: 'Vânzătoare',
    hiredAt: '2023-05-02',
    workplace: 'Magazin Centru',
  },
  trainings: hiringRows('ssm', 'absent').map((each) => ({
    ...each,
    heldOn: each.phase === 'workplace' ? '2023-05-03' : '2023-05-02',
  })),
});

export const tomaPeriodic = page({
  pageKind: 'ssm_periodic',
  person: { lastName: 'Tomma', firstName: 'Andrei' },
  trainings: [row({ heldOn: '2025-07-14' })],
});

// Rusu Alina: a leaver, a title the client has no post for, and one unreadable CNP digit.
export const rusuFront = page({
  pageKind: 'ssm_sheet_front',
  person: {
    lastName: 'Rusu',
    firstName: 'Alina',
    cnp: `${cnps.rusu.slice(0, 9)}?${cnps.rusu.slice(10)}`,
  },
  fields: {
    birthDate: '1975-12-01',
    jobTitle: 'Contabil',
    hiredAt: '2019-02-01',
    leftOn: '2024-12-31',
    bloodGroup: '0 I',
    rhFactor: 'negativ',
  },
});

export const otherPhoto = page({ pageKind: 'other' });

export const existingPop: ExistingEmployee & { jobPositionId: string | null } = {
  id: '00000000-0000-4000-8000-000000000301',
  lastName: 'Pop',
  firstName: 'Elena',
  cnp: cnps.pop,
  employeeNumber: '8',
  birthDate: '1990-07-20',
  birthPlace: 'Sibiu',
  homeAddress: 'Str. Viitorului nr. 3, Sibiu',
  education: null,
  qualification: null,
  bloodGroup: null,
  rhFactor: null,
  jobTitle: 'Brutar',
  hiredAt: '2019-04-03',
  terminatedAt: null,
  workplaceId: workplaces[0]!.id,
  commuteRoute: null,
  commuteMinutes: null,
  hasContact: true,
  trainings: [{ domain: 'ssm', phase: 'introductory_general', heldOn: '2019-04-03' }],
  testResults: [],
  jobPositionId: positions[1]!.id,
};

export const popFront = page({
  pageKind: 'ssm_sheet_front',
  person: { lastName: 'Pop', firstName: 'Elena', cnp: cnps.pop, employeeNumber: '8' },
  fields: {
    birthDate: '1990-07-20',
    homeAddress: 'Str. Fabricii nr. 21, Sibiu',
    bloodGroup: '0 I, Rh +',
    jobTitle: 'Brutar',
    hiredAt: '2019-04-03',
  },
  trainings: [
    row({
      phase: 'introductory_general',
      heldOn: '2019-04-03',
      durationMinutes: 480,
      verifierSignature: 'unclear',
    }),
    row({
      phase: 'workplace',
      heldOn: '2019-04-04',
      durationMinutes: 480,
      trainerName: 'Matei Sorin',
      trainerJobTitle: 'Șef de tură',
    }),
  ],
});

export const themes: TrainingThemes = ({ domain, phase }) =>
  domain === 'ssm' && phase === 'periodic'
    ? {
        trainerName: 'Barbu Ionuț',
        trainerJobTitle: 'Inspector SSM',
        material: 'Tematica semestrului',
        durationMinutes: 120,
      }
    : null;

export function pagesOf(...readings: (SheetPage | null)[]): SheetPageInput[] {
  return readings.map((reading, index) => ({
    id: `page-${index + 1}`,
    fileId: `00000000-0000-4000-8000-0000000004${String(index + 1).padStart(2, '0')}`,
    page: null,
    label: `IMG_31${String(index + 1).padStart(2, '0')}.HEIC`,
    reading,
  }));
}
