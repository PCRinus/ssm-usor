import type { SheetIdentity, SheetRecord, SheetTestResult } from '../trainings/sheet';
import type { SheetTrainingRecord } from './form';

const workshop = { id: 'w1', name: 'Punct de lucru Str. Fabricii 3' };

export const sheetFacts: SheetIdentity = {
  branding: true,
  client: { legalName: 'S.C. CLIENT DEMO S.R.L.', activeWorkplaces: [workshop] },
  employee: {
    lastName: 'Ștefănescu',
    firstName: 'Ana Maria',
    employeeNumber: '0042',
    contractTitle: 'Sudor',
    homeAddress: 'Str. Lungă 12, Timișoara',
    birthDate: '1988-03-14',
    birthPlace: 'Lugoj',
    bloodGroup: 'A(II)',
    rhFactor: '+',
    qualification: null,
    education: 'Liceu',
    authorizations: null,
    commuteRoute: 'Str. Lungă – Str. Fabricii, cu autobuzul 33.',
    commuteMinutes: 25,
    workplace: workshop,
    position: { name: 'Sudor', workZone: 'Atelier' },
  },
};

let count = 0;

export function sheetRecord(
  phase: SheetRecord['training']['phase'],
  heldOn: string,
  overrides: Omit<Partial<SheetTrainingRecord>, 'training'> & {
    training?: Partial<SheetRecord['training']>;
  } = {}
): SheetTrainingRecord {
  count += 1;
  const { training, ...rest } = overrides;
  return {
    id: `7a7a7a7a-0000-4000-8000-${String(count).padStart(12, '0')}`,
    employeeId: 'e1e1e1e1-0000-4000-8000-000000000001',
    domain: 'ssm',
    source: 'app',
    occupation: 'Sudor',
    admission: null,
    ...rest,
    training: {
      phase,
      heldOn,
      durationMinutes: 120,
      material: `I.P.S.S.M. Art. 1 – 60 (${heldOn})`,
      trainer: { name: 'Ion POP', jobTitle: 'Șef atelier' },
      verifier: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
      supplementaryReason: null,
      createdAt: `${heldOn}T10:00:00+00:00`,
      ...training,
    },
  };
}

export function sheetResult(
  test: SheetTestResult['test'],
  takenOn: string,
  overrides: Partial<SheetTestResult> = {}
): SheetTestResult {
  return {
    test,
    takenOn,
    material:
      test === 'annual'
        ? 'Verificare anuală pe bază de test (TPSU)'
        : 'Test de verificare a cunoștințelor la angajare (TASSM)',
    examiner: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
    createdAt: `${takenOn}T12:00:00+00:00`,
    ...overrides,
  };
}
