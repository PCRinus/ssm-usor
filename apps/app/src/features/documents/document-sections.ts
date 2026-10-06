import type { DocumentSet, DocumentTypeKey, FireSafetyDocumentTypeKey } from '@ssm-usor/contracts';

import type { ClientDocument } from './document-labels';

// The chapters of the provider's binder, numbered as the templates are and named after their
// covers, so the list reads like the printed documentation.
export const documentSections = [
  {
    id: 'decisions',
    number: '1',
    title: 'Decizii interne',
    typeKeys: [
      'cover_decisions',
      'decision_training',
      'decision_risk_evaluation_team',
      'decision_first_aid',
      'decision_imminent_danger',
      'decision_workers_representative',
    ],
  },
  {
    id: 'general-training',
    number: '2',
    title: 'Material de instruire introductiv-generală',
    typeKeys: ['cover_general_training_material', 'general_training_material'],
  },
  {
    id: 'own-instructions',
    number: '3',
    title: 'Instrucțiuni proprii',
    typeKeys: ['cover_own_instructions', 'own_instructions'],
  },
  {
    id: 'training-themes',
    number: '4',
    title: 'Tematica de instruire',
    typeKeys: ['cover_training_themes', 'training_themes'],
  },
  {
    id: 'tests',
    number: '5',
    title: 'Teste de verificare a cunoștințelor',
    typeKeys: ['cover_tests', 'test_hiring', 'test_periodic'],
  },
  {
    id: 'protective-equipment',
    number: '6',
    title: 'Lista internă de dotare cu echipament individual de protecție',
    typeKeys: ['protective_equipment_list'],
  },
  {
    id: 'event-registers',
    number: '7',
    title: 'Registrele de evidență a evenimentelor',
    typeKeys: ['cover_event_registers', 'event_registers'],
  },
  { id: 'control-report', number: '8', title: 'Referat de control', typeKeys: ['control_report'] },
  {
    id: 'risk-assessment',
    number: '9',
    title: 'Evaluarea riscurilor de accidentare și îmbolnăvire profesională',
    typeKeys: ['risk_assessment'],
  },
  {
    id: 'prevention-plan',
    number: '10',
    title: 'Planul de prevenire și protecție',
    typeKeys: ['prevention_plan'],
  },
  {
    id: 'employer-briefing',
    number: '11',
    title: 'Material de informare a angajatorului',
    typeKeys: ['cover_employer_briefing', 'employer_briefing'],
  },
  {
    id: 'control-regulation',
    number: '12',
    title: 'Regulament intern privind controlul propriu',
    typeKeys: ['control_regulation'],
  },
] as const satisfies readonly {
  id: string;
  number: string;
  title: string;
  typeKeys: readonly DocumentTypeKey[];
}[];

// The binder's chapters are decisions, own instructions, training themes, tests and the list of
// fire-fighting means before the registers; each is listed once one of its documents is built.
export const fireSafetyDocumentSections = [
  {
    id: 'registers',
    number: '6',
    title: 'Registre și formulare PSI',
    typeKeys: [
      'fire_cover_registers',
      'fire_registers',
      'fire_work_permit',
      'fire_installation_register',
      'fire_extinguisher_register',
    ],
  },
] as const satisfies readonly {
  id: string;
  number: string;
  title: string;
  typeKeys: readonly FireSafetyDocumentTypeKey[];
}[];

// A document type the API knows before this build of the app does.
export const otherSection = { id: 'other', title: 'Alte documente SSM' } as const;

export const fireSafetyOtherSection = { id: 'other', title: 'Alte documente PSI' } as const;

export type DocumentSectionId = (typeof documentSections)[number]['id'] | typeof otherSection.id;

export type FireSafetyDocumentSectionId =
  (typeof fireSafetyDocumentSections)[number]['id'] | typeof fireSafetyOtherSection.id;

export const documentSectionIds: [DocumentSectionId, ...DocumentSectionId[]] = [
  otherSection.id,
  ...documentSections.map((section) => section.id),
];

export const fireSafetyDocumentSectionIds: [
  FireSafetyDocumentSectionId,
  ...FireSafetyDocumentSectionId[],
] = [fireSafetyOtherSection.id, ...fireSafetyDocumentSections.map((section) => section.id)];

export type SectionIdOf<Set extends DocumentSet> = {
  occupational_safety: DocumentSectionId;
  fire_safety: FireSafetyDocumentSectionId;
}[Set];

type SectionList = readonly {
  id: string;
  number: string;
  title: string;
  typeKeys: readonly string[];
}[];

export const setSections: Record<
  DocumentSet,
  { sections: SectionList; other: { id: 'other'; title: string } }
> = {
  occupational_safety: { sections: documentSections, other: otherSection },
  fire_safety: { sections: fireSafetyDocumentSections, other: fireSafetyOtherSection },
};

export function sectionOf<Set extends DocumentSet = 'occupational_safety'>(
  typeKey: string,
  set: Set = 'occupational_safety' as Set
): SectionIdOf<Set> {
  const { sections, other } = setSections[set];
  return (sections.find((section) => section.typeKeys.includes(typeKey))?.id ??
    other.id) as SectionIdOf<Set>;
}

const counted = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

// A row without a document is one that does not apply to the client.
export function sectionSummary(rows: readonly { document: ClientDocument | null }[]) {
  if (rows.length === 0) return 'negenerat';
  const documents = rows.flatMap((row) => (row.document ? [row.document] : []));
  const issued = documents.filter((document) => document.issued).length;
  const drafts = documents.filter((document) => document.draft).length;
  const dataChanged = documents.filter((document) => document.draft?.dataChanged).length;
  const parts = [
    issued > 0 && counted(issued, 'emis', 'emise'),
    drafts > 0 && counted(drafts, 'ciornă', 'ciorne'),
    dataChanged > 0 && `${dataChanged} cu date modificate`,
  ].filter((part) => part !== false);
  return parts.length > 0 ? parts.join(' · ') : 'nu se aplică';
}
