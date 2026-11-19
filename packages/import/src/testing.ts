import type { Reading } from './reading';
import type { SheetPage, SheetRow } from './sheet-page';

export function emptyReading(overrides: Partial<Reading> = {}): Reading {
  return {
    facts: [],
    workplaces: [],
    workplaceFacts: [],
    workplaceSuggestions: [],
    jobPositions: [],
    jobPositionFacts: [],
    responsiblePersons: [],
    fireEquipment: [],
    fireInstallations: [],
    substances: [],
    protectiveEquipment: [],
    employees: [],
    notes: [],
    ...overrides,
  };
}

type PageParts = {
  pageKind?: SheetPage['pageKind'];
  person?: Partial<SheetPage['person']>;
  fields?: Partial<SheetPage['fields']>;
  admission?: Partial<SheetPage['admission']>;
  trainings?: SheetRow[];
  handovers?: SheetPage['handovers'];
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
      residenceAddress: null,
      education: null,
      qualification: null,
      bloodGroup: null,
      rhFactor: null,
      jobTitle: null,
      hiredAt: null,
      leftOn: null,
      workplace: null,
      commuteRoute: null,
      commuteMeans: [],
      commuteMeansOther: null,
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
    handovers: parts.handovers ?? [],
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
