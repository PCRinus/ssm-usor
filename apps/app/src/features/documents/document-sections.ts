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

// `after`: the built document it follows in the binder; without one, it closes the section.
type PlannedDocument = { id: string; title: string; after?: string };

// The whole binder, so a specialist sees what the documentation will hold. A document the app
// cannot write yet is planned; once it is built, its entry moves to the type keys.
export const fireSafetyDocumentSections = [
  {
    id: 'decisions',
    number: '1',
    title: 'Decizii interne',
    typeKeys: [
      'fire_cover_decisions',
      'fire_decision_organization',
      'fire_decision_training',
      'fire_decision_open_fire',
      'fire_decision_seasons',
      'fire_decision_waste',
    ],
    planned: [
      {
        id: 'decision-smoking',
        title: 'Decizia privind fumatul',
        after: 'fire_decision_open_fire',
      },
      {
        id: 'decision-technician',
        title: 'Decizia privind cadrul tehnic PSI',
        after: 'fire_decision_seasons',
      },
      {
        id: 'decision-instructions',
        title: 'Decizia privind instrucțiunile de apărare împotriva incendiilor',
        after: 'decision-technician',
      },
      { id: 'decision-control', title: 'Decizia privind controlul propriu' },
    ],
  },
  {
    id: 'own-instructions',
    number: '2',
    title: 'Instrucțiuni proprii în domeniul situațiilor de urgență',
    typeKeys: [],
    planned: [
      {
        id: 'cover-own-instructions',
        title: 'Copertă – Instrucțiunile proprii în domeniul situațiilor de urgență',
      },
      { id: 'own-instructions', title: 'Instrucțiuni proprii în domeniul situațiilor de urgență' },
    ],
  },
  {
    id: 'training-themes',
    number: '3',
    title: 'Tematica de instruire',
    typeKeys: [],
    planned: [
      {
        id: 'cover-training-themes',
        title: 'Copertă – Tematica de instruire în domeniul situațiilor de urgență',
      },
      {
        id: 'training-themes',
        title: 'Tematica de instruire în domeniul situațiilor de urgență',
      },
    ],
  },
  {
    id: 'tests',
    number: '4',
    title: 'Teste de verificare a cunoștințelor',
    typeKeys: [],
    planned: [
      { id: 'cover-tests', title: 'Copertă – Testele de verificare a cunoștințelor' },
      { id: 'test-hiring', title: 'Test la angajare' },
      { id: 'test-annual', title: 'Test anual' },
    ],
  },
  {
    id: 'means',
    number: '5',
    title: 'Mijloace de apărare și organizarea la locul de muncă',
    typeKeys: ['fire_means_list', 'fire_workplace_organization'],
    planned: [],
  },
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
    planned: [],
  },
] as const satisfies readonly {
  id: string;
  number: string;
  title: string;
  typeKeys: readonly FireSafetyDocumentTypeKey[];
  planned: readonly PlannedDocument[];
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
  planned?: readonly PlannedDocument[];
}[];

// `listsWholePack`: every document of the set is listed, existing or not, and nothing
// generated yet is no reason for an empty state.
export const setSections: Record<
  DocumentSet,
  { sections: SectionList; other: { id: 'other'; title: string }; listsWholePack: boolean }
> = {
  occupational_safety: { sections: documentSections, other: otherSection, listsWholePack: false },
  fire_safety: {
    sections: fireSafetyDocumentSections,
    other: fireSafetyOtherSection,
    listsWholePack: true,
  },
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

/** The section's rows in binder order: each planned document right after the one it follows. */
export function inBinderOrder<Row extends { key: string }>(
  built: readonly Row[],
  planned: readonly (PlannedDocument & { row: Row })[]
) {
  const rows: Row[] = [];
  const follow = (key: string) => {
    for (const item of planned.filter((each) => each.after === key)) {
      rows.push(item.row);
      follow(item.id);
    }
  };
  for (const row of built) {
    rows.push(row);
    follow(row.key);
  }
  rows.push(...planned.filter((item) => !rows.includes(item.row)).map((item) => item.row));
  return rows;
}

export type SectionRow =
  | { kind: 'document'; key: string; title: string; document: ClientDocument }
  | {
      kind: 'notApplicable' | 'notGenerated' | 'planned';
      key: string;
      title: string;
      document: null;
    };

export function sectionSummary(rows: readonly Pick<SectionRow, 'kind' | 'document'>[]) {
  const documents = rows.flatMap((row) => (row.document ? [row.document] : []));
  const missing = rows.filter((row) => row.kind === 'notGenerated').length;
  if (documents.length === 0) {
    if (rows.length === 0 || missing > 0) return 'negenerat';
    return rows.every((row) => row.kind === 'planned') ? 'în pregătire' : 'nu se aplică';
  }
  const issued = documents.filter((document) => document.issued).length;
  const drafts = documents.filter((document) => document.draft).length;
  const dataChanged = documents.filter((document) => document.draft?.dataChanged).length;
  return [
    issued > 0 && counted(issued, 'emis', 'emise'),
    drafts > 0 && counted(drafts, 'ciornă', 'ciorne'),
    dataChanged > 0 && `${dataChanged} cu date modificate`,
    missing > 0 && counted(missing, 'negenerat', 'negenerate'),
  ]
    .filter((part) => part !== false)
    .join(' · ');
}
