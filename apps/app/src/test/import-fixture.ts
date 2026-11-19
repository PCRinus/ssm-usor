import type { BillingCreditsUsage } from '@ssm-usor/contracts';

import type { MeResponse } from '@/api/generated/api';
import type { Proposal } from '@/features/imports/review-model';

import { activeSubscription, summaryOf as subscriptionSummaryOf } from './billing-fixture';
import { clientId, meResponse } from './records';

export { bodyOf, fetchMock, mockApi, requestsTo, type Route } from './api';
export { clientId, meResponse };

export const importId = '6f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';

let fileNumber = 0;

export function importFile(overrides: Record<string, unknown> = {}) {
  fileNumber += 1;
  const name = (overrides.fileName as string | undefined) ?? `Fisier ${fileNumber}.docx`;
  return {
    id: `f0000000-0000-4000-8000-${String(fileNumber).padStart(12, '0')}`,
    uploadPath: `dosar-ssm.zip/${name}`,
    fileName: name,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sizeBytes: 1000,
    state: 'read',
    documentKind: 'decision',
    reason: null,
    companyName: null,
    companyCui: null,
    pageCount: 2,
    isScan: false,
    hasDerived: false,
    ...overrides,
  };
}

export function importDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: importId,
    kind: 'client',
    status: 'reading',
    client: null,
    intoExistingClient: false,
    companyName: 'Brutăria Spicul Auriu SRL',
    companyCui: '31458207',
    sourceImportId: null,
    failureReason: null,
    fileCount: 0,
    createdBy: { id: 'user-one', fullName: 'Radu Pop' },
    createdAt: '2026-10-28T09:00:00+00:00',
    startedAt: '2026-10-28T09:01:00+00:00',
    readyAt: null,
    failedAt: null,
    confirmedAt: null,
    abandonedAt: null,
    version: 0,
    files: [] as unknown[],
    progress: { files: 0, prepared: 0, scans: 0, scansRead: 0 },
    otherCompanies: [] as unknown[],
    registeredCompany: null,
    changes: null,
    blockers: [] as unknown[],
    proposalDroppedAt: null,
    proposal: null,
    libraryParts: [] as unknown[],
    ...overrides,
  };
}

export const summaryOf = (detail: ReturnType<typeof importDetail>) => {
  const { files, ...rest } = detail;
  return {
    id: rest.id,
    kind: rest.kind,
    status: rest.status,
    client: rest.client,
    intoExistingClient: rest.intoExistingClient,
    companyName: rest.companyName,
    companyCui: rest.companyCui,
    sourceImportId: rest.sourceImportId,
    failureReason: rest.failureReason,
    fileCount: files.length,
    createdBy: rest.createdBy,
    createdAt: rest.createdAt,
    startedAt: rest.startedAt,
    readyAt: rest.readyAt,
    failedAt: rest.failedAt,
    confirmedAt: rest.confirmedAt,
    abandonedAt: rest.abandonedAt,
    libraryParts: rest.libraryParts,
  };
};

export function meWithCredits(
  credits: Partial<BillingCreditsUsage> = {},
  subscription = subscriptionSummaryOf(activeSubscription({ interval: 'month' }))
): MeResponse {
  const creditsThisMonth: BillingCreditsUsage = {
    used: 230,
    included: 1500,
    allowance: 1500,
    granted: 0,
    shortfall: 0,
    left: 1270,
    giftLeft: 7840,
    extra: 0,
    extraLeft: 0,
    extrasOn: false,
    period: 'month',
    periodStart: '2026-10-14T08:00:00.000Z',
    periodEnd: '2026-11-14T08:00:00.000Z',
    state: 'ok',
    ...credits,
  };
  return { ...meResponse, subscription, creditsThisMonth };
}

const src = (file: string, quote: string) => [{ file, quote }];
const one = <T extends string | number>(value: T, file = 'dosar-ssm.zip/Decizie 1.docx') => ({
  options: [{ value, sources: src(file, String(value)), otherCompanyName: null }],
});
const none = { options: [] };

export function proposalFixture(): Proposal {
  return {
    client: {
      legalName: one('Brutăria Spicul Auriu SRL'),
      cui: one('31458207'),
      tradeRegisterNumber: one('J32/412/2013'),
      caenCode: one('1071'),
      countyCode: one('SB'),
      locality: one('Sibiu'),
      addressLine: one('Str. Morilor nr. 14'),
      legalRepresentativeName: {
        options: [
          {
            value: 'Ioana Mureșan',
            sources: src('dosar-ssm.zip/Decizie 1.docx', 'Ioana Mureșan'),
            otherCompanyName: null,
          },
          {
            value: 'Dorin Mureșan',
            sources: src('Contract prestari SSM 2019.pdf', 'Dorin Mureșan'),
            otherCompanyName: null,
          },
        ],
      },
      legalRepresentativeRole: one('administrator'),
      contactName: none,
      contactPhone: one('0269 214 377', 'Contract prestari SSM 2019.pdf'),
      contactEmail: {
        options: [
          {
            value: 'office@lactate.ro',
            sources: src('dosar-ssm.zip/Fise post.doc', 'office@lactate.ro'),
            otherCompanyName: 'Lactate Câmpia SRL',
          },
        ],
      },
    },
    trainingSchedule: {
      periodicTrainingMinutes: none,
      administrativeTrainingIntervalMonths: one(12),
      workerTrainingIntervalMonths: one(6),
      trainingFirstMonth: none,
      trainingDayFrom: none,
      trainingDayTo: none,
    },
    fireSafety: {
      periodicTrainingHours: none,
      administrativeTrainingIntervalMonths: none,
      workerTrainingIntervalMonths: none,
      smokingPolicy: one('designated_places'),
      smokingPlace: one('curte'),
      wasteContractor: {
        options: [
          { value: 'Salubris SA', sources: src('a.pdf', 'Salubris SA'), otherCompanyName: null },
          { value: 'Eco Sud SRL', sources: src('b.pdf', 'Eco Sud SRL'), otherCompanyName: null },
        ],
      },
    },
    workplaces: [
      {
        id: 'workplace-1',
        sources: src('dosar-ssm.zip/Decizie 1.docx', 'Str. Morilor nr. 14'),
        otherCompanyName: null,
        name: 'Sediu',
        countyCode: 'SB',
        locality: 'Sibiu',
        addressLine: 'Str. Morilor nr. 14',
        isRegisteredOffice: true,
        activity: 'Brutărie',
        rooms: ['Laborator', 'Magazin'],
      },
    ],
    jobPositions: [
      {
        id: 'position-1',
        sources: src('dosar-ssm.zip/Fise post.doc', 'Brutar'),
        otherCompanyName: null,
        name: 'Brutar',
        staffCategory: 'execution',
        trainingIntervalMonths: null,
        workZone: 'Laborator',
        activities: 'Frământare și coacere',
        managementOnly: false,
      },
      {
        id: 'position-2',
        sources: src('dosar-ssm.zip/Fise post.doc', 'Stivuitorist'),
        otherCompanyName: 'Lactate Câmpia SRL',
        name: 'Stivuitorist',
        staffCategory: 'execution',
        trainingIntervalMonths: null,
        workZone: null,
        activities: 'Conduce motostivuitorul',
        managementOnly: false,
      },
    ],
    responsiblePersons: [
      {
        id: 'person-1',
        sources: src('dosar-ssm.zip/Decizie 1.docx', 'Radu Lazăr'),
        otherCompanyName: null,
        fullName: 'Radu Lazăr',
        jobTitle: 'Brutar',
        roles: ['workers_representative', 'first_aid'],
        workplace: { name: null, id: null },
      },
    ],
    fireEquipment: [
      {
        id: 'extinguisher-1',
        sources: src('b.pdf', 'stingătoare P6'),
        otherCompanyName: null,
        workplace: { name: 'Sediu', id: 'workplace-1' },
        room: 'Laborator',
        kind: 'extinguisher',
        agent: 'powder',
        capacity: 6,
        wheeled: false,
        count: 6,
      },
    ],
    fireInstallations: [],
    protectiveEquipment: [],
    employees: [
      {
        id: 'employee-1',
        sources: src('dosar-ssm.zip/Decizie 1.docx', 'Radu Lazăr'),
        otherCompanyName: null,
        role: 'workers_representative',
        lastName: 'Lazăr',
        firstName: 'Radu',
        cnp: null,
        birthDate: null,
        jobTitle: 'Brutar',
        hiredAt: null,
      },
    ],
    notes: [],
    flags: [],
  };
}

const equipmentEntry = (
  id: string,
  item: string,
  jobPosition: { name: string; id: string },
  risk = 'Accidentare'
) => ({
  id,
  sources: src('dosar-ssm.zip/Evaluare riscuri.docx', item),
  otherCompanyName: null,
  jobPosition,
  risk,
  item,
  quantity: 1,
  durationMonths: 12,
  allocation: 'personal_inventory',
});

export function managementPostProposal(): Proposal {
  const proposal = proposalFixture();
  proposal.jobPositions.push({
    ...proposal.jobPositions[0]!,
    id: 'position-3',
    sources: src('dosar-ssm.zip/Evaluare riscuri.docx', 'Administrator'),
    name: 'Administrator',
    staffCategory: 'technical_administrative',
    workZone: null,
    activities: 'Conducerea firmei, conduce autoturismul în interes de serviciu',
    managementOnly: true,
  } as Proposal['jobPositions'][number]);
  (proposal as { protectiveEquipment: unknown[] }).protectiveEquipment = [
    equipmentEntry('equipment-entry-1', 'Mănuși termorezistente', {
      name: 'Brutar',
      id: 'position-1',
    }),
    equipmentEntry('equipment-entry-2', 'Vestă reflectorizantă', {
      name: 'Administrator',
      id: 'position-3',
    }),
  ];
  return proposal;
}

export function secondPostProposal(): Proposal {
  const proposal = proposalFixture();
  proposal.jobPositions.push({
    ...proposal.jobPositions[0]!,
    id: 'position-3',
    sources: src('dosar-ssm.zip/Fise post.doc', 'Vânzător'),
    name: 'Vânzător',
    workZone: 'Magazin',
    activities: 'Vânzarea produselor de panificație',
  } as Proposal['jobPositions'][number]);
  (proposal as { protectiveEquipment: unknown[] }).protectiveEquipment = [
    equipmentEntry(
      'equipment-entry-1',
      'Mănuși termorezistente',
      { name: 'Brutar', id: 'position-1' },
      'Murdărire'
    ),
    equipmentEntry(
      'equipment-entry-2',
      'Halat de protecție',
      { name: 'Vânzător', id: 'position-3' },
      'Murdărire'
    ),
  ];
  return proposal;
}

export function suggestedValuesProposal(): Proposal {
  const proposal = proposalFixture();
  const evaluation = 'dosar-ssm.zip/Evaluare riscuri.docx';
  Object.assign(proposal.workplaces[0]!, {
    activity: null,
    rooms: [],
    officeHasActivity: false,
    suggested: { officeHasActivity: src('dosar-ssm.zip/Decizie 1.docx', 'Atelier: Str. Gării 3') },
  });
  proposal.workplaces.push({
    ...proposal.workplaces[0]!,
    id: 'workplace-2',
    name: 'Atelier',
    isRegisteredOffice: false,
    addressLine: 'Str. Gării nr. 3',
    activity: 'Brutărie',
    officeHasActivity: true,
    combustibleMaterials: 'făină, ambalaje din hârtie și carton, lăzi din lemn',
    ignitionSources: 'cuptorul electric, instalația electrică',
    extinguisherNorm: 'commercial_200',
    suggested: {
      combustibleMaterials: [
        { file: evaluation, quote: 'Materii prime: făină, drojdie' },
        { file: 'dosar-psi.zip/Decizie deseuri.docx', quote: 'deșeuri de hârtie și carton' },
      ],
      ignitionSources: src(evaluation, 'cuptor electric cu vatră'),
      extinguisherNorm: src(evaluation, 'Cod CAEN 1071'),
    },
  } as Proposal['workplaces'][number]);
  return proposal;
}

export function fireCountProposal(): Proposal {
  const proposal = proposalFixture();
  const [laboratory] = proposal.fireEquipment;
  proposal.fireEquipment.push(
    {
      ...laboratory!,
      id: 'extinguisher-2',
      sources: src('Lista mijloacelor.docx', 'stingătoare P6 – 4 buc.'),
      room: null,
      count: 4,
    },
    {
      ...laboratory!,
      id: 'blanket-1',
      sources: src('Lista mijloacelor.docx', 'Bucătărie – pătură antifoc'),
      room: 'Bucătărie',
      kind: 'fire_blanket',
      agent: null,
      capacity: null,
      count: null,
    }
  );
  Object.assign(proposal, {
    fireEquipmentCounts: [
      {
        id: 'count-1',
        workplace: { name: 'Sediu', id: 'workplace-1' },
        kind: 'extinguisher',
        agent: 'powder',
        capacity: 6,
        wheeled: false,
        options: [
          {
            total: 6,
            sources: [
              ...laboratory!.sources,
              { file: 'Evaluarea riscului.docx', quote: '6 stingătoare P6' },
            ],
            equipmentIds: ['extinguisher-1'],
          },
          {
            total: 4,
            sources: src('Lista mijloacelor.docx', 'stingătoare P6 – 4 buc.'),
            equipmentIds: ['extinguisher-2'],
          },
        ],
      },
    ],
  });
  return proposal;
}

export function placesProposal(): Proposal {
  const proposal = proposalFixture();
  Object.assign(proposal.workplaces[0]!, {
    assemblyPoint: 'Parcarea din fața clădirii',
    fieldSources: {
      assemblyPoint: src('Instructiuni PSI.docx', 'Punct de adunare: parcarea'),
    },
    spelling: { assemblyPoint: 'PARCAREA DIN FATA CLADIRII' },
  });
  Object.assign(proposal.fireSafety.smokingPlace.options[0]!, {
    value: 'La poarta unității',
    spelling: 'LA POARTA UNITATII',
  });
  return proposal;
}

export function substancesProposal(answers: string[] = ['listed']): Proposal {
  const proposal = proposalFixture();
  const decision = 'Decizia 9 deseuri.docx';
  const named = (id: string, name: string, quote: string) => ({
    id,
    name,
    sources: src(decision, quote),
    otherCompanyName: null,
    spelling: {},
  });
  const substances = answers.includes('listed')
    ? [
        named('substance-1', 'Detergenți', 'ambalaje de la detergenți'),
        named('substance-2', 'Ulei uzat', 'uleiul uzat de la friteuză'),
      ]
    : [];
  Object.assign(proposal, { substances });
  Object.assign(proposal.fireSafety, {
    wasteContractor: { options: [] },
    substancesState: {
      options: answers.map((value) => ({
        value,
        sources:
          value === 'listed'
            ? substances.flatMap((substance) => substance.sources)
            : src('Lista mijloacelor.docx', 'Nu se utilizează substanțe periculoase'),
        otherCompanyName: null,
      })),
    },
  });
  return proposal;
}

export const readyBlockers = [
  { path: 'client.legalRepresentativeName', code: 'choice' },
  { path: 'fireSafety.wasteContractor', code: 'choice' },
  { path: 'employees.0.hiredAt', code: 'missing' },
];

export function readyDetail(overrides: Record<string, unknown> = {}) {
  return importDetail({
    status: 'ready',
    readyAt: '2026-10-28T09:20:00+00:00',
    version: 3,
    files: [
      importFile({ fileName: 'Decizie 1.docx' }),
      importFile({ fileName: 'Fise post.doc', mimeType: 'application/msword', hasDerived: true }),
      importFile({
        fileName: 'Contract prestari SSM 2019.pdf',
        uploadPath: 'Contract prestari SSM 2019.pdf',
        mimeType: 'application/pdf',
      }),
    ],
    registeredCompany: {
      cui: '31458207',
      legalName: 'BRUTĂRIA SPICUL AURIU SRL',
      vatPayer: true,
      inactive: false,
    },
    blockers: readyBlockers,
    proposal: proposalFixture(),
    ...overrides,
  });
}
