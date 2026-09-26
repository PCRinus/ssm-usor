import { z } from 'zod';

/**
 * The built-in documents that can be generated, in the order of the provider's pack. Mirrors
 * the manifest of `packages/document-engine/templates`, without the templates whose content
 * is still pending.
 */
export const documentTypeKeys = [
  'cover_decisions',
  'decision_training',
  'decision_risk_evaluation_team',
  'decision_first_aid',
  'decision_imminent_danger',
  'decision_workers_representative',
  'cover_general_training_material',
  'general_training_material',
  'cover_own_instructions',
  'own_instructions',
  'cover_training_themes',
  'cover_tests',
  'test_hiring',
  'test_periodic',
  'protective_equipment_list',
  'cover_event_registers',
  'event_registers',
  'control_report',
  'cover_employer_briefing',
  'employer_briefing',
  'control_regulation',
] as const;

export const documentTypeKeySchema = z.enum(documentTypeKeys);

export type DocumentTypeKey = z.infer<typeof documentTypeKeySchema>;

/**
 * The documents of the pack the app cannot write yet, because their content follows the
 * client's job titles or is the risk assessment itself (ADR 005, stages 2 and 3). Until it
 * can, the provider writes them elsewhere and uploads the file, so the set is complete.
 */
export const uploadedDocumentTypes = {
  training_themes: 'Tematica și programul de instruire',
  risk_assessment: 'Evaluarea riscurilor de accidentare și îmbolnăvire profesională',
  prevention_plan: 'Planul de prevenire și protecție',
} as const;

export type UploadedDocumentTypeKey = keyof typeof uploadedDocumentTypes;

export const isUploadedDocumentType = (typeKey: string): typeKey is UploadedDocumentTypeKey =>
  Object.hasOwn(uploadedDocumentTypes, typeKey);

/** Every document of the pack, generated or uploaded, in the pack's order. */
export const packDocumentTypeKeys = [
  'cover_decisions',
  'decision_training',
  'decision_risk_evaluation_team',
  'decision_first_aid',
  'decision_imminent_danger',
  'decision_workers_representative',
  'cover_general_training_material',
  'general_training_material',
  'cover_own_instructions',
  'own_instructions',
  'cover_training_themes',
  'training_themes',
  'cover_tests',
  'test_hiring',
  'test_periodic',
  'protective_equipment_list',
  'cover_event_registers',
  'event_registers',
  'control_report',
  'risk_assessment',
  'prevention_plan',
  'cover_employer_briefing',
  'employer_briefing',
  'control_regulation',
] as const satisfies readonly (DocumentTypeKey | UploadedDocumentTypeKey)[];

export const packDocumentTypeKeySchema = z.enum(packDocumentTypeKeys);

export type PackDocumentTypeKey = z.infer<typeof packDocumentTypeKeySchema>;

/** The decisions, in the order they are numbered from the first decision number. */
export const decisionTypeKeys = [
  'decision_training',
  'decision_risk_evaluation_team',
  'decision_first_aid',
  'decision_imminent_danger',
  'decision_workers_representative',
] as const satisfies readonly DocumentTypeKey[];

/**
 * What a client's documentation cannot be generated without, by where it is filled in: the
 * organization's legal details, the specialist's profile, the client's document details, and
 * the client's responsible persons, one entry per role nobody holds.
 */
export const missingDocumentData = [
  'provider.legalName',
  'provider.representativeName',
  'provider.representativeRole',
  'specialist.name',
  'specialist.professionalTitle',
  'client.representativeName',
  'client.representativeRole',
  'client.trainingSchedule',
  'responsible.workplace_manager',
  'responsible.first_aid',
  'responsible.risk_evaluation_team',
  'responsible.imminent_danger',
  'responsible.workers_representative',
  'responsible.workers_representatives_two',
  'responsible.workers_representative_is_legal_representative',
  'positions.any',
  'positions.equipment',
  'positions.instructions',
] as const;

export const missingDocumentDataSchema = z.enum(missingDocumentData);

export type MissingDocumentData = z.infer<typeof missingDocumentDataSchema>;

export const documentReadinessResponseSchema = z.object({
  ready: z.boolean(),
  missing: z.array(missingDocumentDataSchema),
  // What decides whether decision 1.5 is part of the set (ADR 010).
  currentEmployeeCount: z.int().min(0),
  // The two names behind `responsible.workers_representative_is_legal_representative`.
  workersRepresentativeClash: z
    .object({ representativeName: z.string(), legalRepresentativeName: z.string() })
    .nullable(),
  // The positions behind `positions.equipment` and `positions.instructions`, so the form can
  // send someone to each.
  undecidedJobPositions: z.array(z.object({ id: z.uuid(), name: z.string() })),
});

export type DocumentReadinessResponse = z.infer<typeof documentReadinessResponseSchema>;

/** Mirrors the `document_revision_status` enum in the database. */
export const documentRevisionStatuses = ['draft', 'issued', 'superseded'] as const;

export const documentRevisionStatusSchema = z.enum(documentRevisionStatuses);

export type DocumentRevisionStatus = z.infer<typeof documentRevisionStatusSchema>;

export const documentRevisionSchema = z.object({
  id: z.uuid(),
  revision: z.int().min(1),
  status: documentRevisionStatusSchema,
  // The date the document carries; null for a file that was uploaded instead of generated.
  issueDate: z.iso.date().nullable(),
  // Whether the stored facts differ from what a draft was generated from. Always false for
  // an issued revision, which records what it was built from and does not follow the data.
  dataChanged: z.boolean(),
  // When the file was last saved from the editor or uploaded; null while it is as generated.
  editedAt: z.iso.datetime({ offset: true }).nullable(),
  issuedAt: z.iso.datetime({ offset: true }).nullable(),
  // Whether a PDF was made when the revision was issued. Never for a draft.
  hasPdf: z.boolean(),
  // Whether the copy that came back signed was attached and confirmed by an owner (ADR 007).
  // The app knows that a file was attached, not that it is signed. Never for a draft.
  hasSignedCopy: z.boolean(),
  // A copy that came through the return link and that no owner has confirmed yet; the
  // contract is not signed by it. Null once confirmed, when `hasSignedCopy` takes over.
  receivedCopy: z.object({ uploadedAt: z.iso.datetime({ offset: true }) }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

export type DocumentRevision = z.infer<typeof documentRevisionSchema>;

/** Mirrors the `document_group` enum in the database. */
export const documentGroups = ['documentation_set', 'other'] as const;

export type DocumentGroup = (typeof documentGroups)[number];

export const clientDocumentSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  // A provider's own templates may add types later, so this is not limited to the built-in list.
  typeKey: z.string(),
  title: z.string(),
  // Set for decisions.
  decisionNumber: z.int().nullable(),
  draft: documentRevisionSchema.nullable(),
  issued: documentRevisionSchema.nullable(),
});

export type ClientDocument = z.infer<typeof clientDocumentSchema>;

/** In the order of the documentation set. A client has a few dozen at most: not paginated. */
export const clientDocumentListResponseSchema = z.object({
  items: z.array(clientDocumentSchema),
  // What the last generation asked, to fill the form in again.
  lastGeneration: z
    .object({ issueDate: z.iso.date(), firstDecisionNumber: z.int().min(1).max(9999) })
    .nullable(),
  // Documents of the set this client does not need, such as decision 1.5 under 10 employees.
  notApplicable: z.array(documentTypeKeySchema),
  currentEmployeeCount: z.int().min(0),
});

export type ClientDocumentListResponse = z.infer<typeof clientDocumentListResponseSchema>;

export const generateDocumentsRequestSchema = z.object({
  // The date the documents carry, usually the start of the contract.
  issueDate: z.iso.date(),
  // Decisions are numbered from here: "Decizia nr. 1 SSM".
  firstDecisionNumber: z.int().min(1).max(9995).default(1),
});

export type GenerateDocumentsRequest = z.infer<typeof generateDocumentsRequestSchema>;

/** Types the client already has are left as they are. */
export const generateDocumentsResponseSchema = z.object({
  created: z.array(clientDocumentSchema),
  skipped: z.array(z.string()),
});

export type GenerateDocumentsResponse = z.infer<typeof generateDocumentsResponseSchema>;

// `signed` is the signed copy, a PDF that was attached, not made.
export const documentFileFormats = ['docx', 'pdf', 'signed'] as const;

export type DocumentFileFormat = (typeof documentFileFormats)[number];

export const documentDownloadQuerySchema = z.object({
  format: z.enum(documentFileFormats).default('docx'),
});

export const documentDownloadResponseSchema = z.object({
  url: z.url(),
  fileName: z.string(),
  expiresInSeconds: z.int(),
});

export type DocumentDownloadResponse = z.infer<typeof documentDownloadResponseSchema>;

export const clientDocumentResponseSchema = z.object({ document: clientDocumentSchema });

export type ClientDocumentResponse = z.infer<typeof clientDocumentResponseSchema>;

export const regenerateDocumentRequestSchema = z.object({
  // Left out, the document keeps the date it carries now.
  issueDate: z.iso.date().optional(),
});

export type RegenerateDocumentRequest = z.infer<typeof regenerateDocumentRequestSchema>;

/**
 * What a generated file says where the app has nothing to print yet, and what a person is
 * meant to replace before the document is issued.
 */
export const unfilledMark = 'DE COMPLETAT';

/** `reason` values on document errors, so the SPA can word them itself. */
export const documentErrorReasons = [
  'missing_document_data',
  'unfilled_text',
  'not_generated_yet',
  'pdf_unavailable',
  'not_issued',
] as const;

export const issueDocumentRequestSchema = z.object({
  // Issue the draft although its file still reads `unfilledMark` somewhere.
  acceptUnfilled: z.boolean().optional(),
});

export type IssueDocumentRequest = z.infer<typeof issueDocumentRequestSchema>;
