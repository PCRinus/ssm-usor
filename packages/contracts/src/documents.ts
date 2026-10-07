import { z } from 'zod';

import { riskEvaluationKindSchema } from './risk-evaluations';

/**
 * The built-in documents of the occupational safety set, in the order of the provider's pack.
 * Mirrors the manifest of `packages/document-engine/templates`.
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
] as const;

export const documentTypeKeySchema = z.enum(documentTypeKeys);

export type DocumentTypeKey = z.infer<typeof documentTypeKeySchema>;

/** The built-in documents of the fire-safety set, in the order of the provider's binder. */
export const fireSafetyDocumentTypeKeys = [
  'fire_cover_registers',
  'fire_registers',
  'fire_work_permit',
  'fire_installation_register',
  'fire_extinguisher_register',
] as const;

export const fireSafetyDocumentTypeKeySchema = z.enum(fireSafetyDocumentTypeKeys);

export type FireSafetyDocumentTypeKey = z.infer<typeof fireSafetyDocumentTypeKeySchema>;

export const builtInDocumentTypeKeySchema = z.enum([
  ...documentTypeKeys,
  ...fireSafetyDocumentTypeKeys,
]);

export type BuiltInDocumentTypeKey = z.infer<typeof builtInDocumentTypeKeySchema>;

export const documentSets = ['occupational_safety', 'fire_safety'] as const;

export const documentSetSchema = z.enum(documentSets);

export type DocumentSet = z.infer<typeof documentSetSchema>;

export const documentSetTypeKeys = {
  occupational_safety: documentTypeKeys,
  fire_safety: fireSafetyDocumentTypeKeys,
} as const satisfies Record<DocumentSet, readonly BuiltInDocumentTypeKey[]>;

/** Fire-safety type keys start with `fire_` (ADR 016), so a type no list names has a set too. */
export function documentSetOf(typeKey: string): DocumentSet {
  return typeKey.startsWith('fire_') ? 'fire_safety' : 'occupational_safety';
}

/** Left out, the set is the occupational safety one, which was the only one before ADR 016. */
export const documentSetQuerySchema = z.object({
  set: documentSetSchema.default('occupational_safety'),
});

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
 * the client's responsible persons, one entry per role nobody holds. Each set asks its own part
 * of the list.
 */
export const missingDocumentData = [
  'provider.legalName',
  'provider.representativeName',
  'provider.representativeRole',
  // The same code as a service contract's: the name, kept with the organization's authorizations.
  'provider.fireSafetyTechnician',
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
  // A current position without an evaluation, or with one that has no factor (ADR 015).
  'positions.risk_evaluation',
  'risk_evaluations.sensitive_groups',
  // An unacceptable factor without a prevention measure.
  'risk_evaluations.measures',
  // A factor with prevention measures but without a deadline or a person responsible.
  'risk_evaluations.plan',
  // Only for generating the training themes again: they cite the own instructions (ADR 014).
  'documents.own_instructions',
] as const;

export const missingDocumentDataSchema = z.enum(missingDocumentData);

export type MissingDocumentData = z.infer<typeof missingDocumentDataSchema>;

/** What the fire-safety set can be missing: what its documents print. */
export const fireSafetyMissingDocumentData = [
  'provider.legalName',
  'provider.fireSafetyTechnician',
  'client.representativeName',
  'client.representativeRole',
] as const satisfies readonly MissingDocumentData[];

export const jobPositionDecisions = ['equipment', 'instructions'] as const;

export const jobPositionDecisionSchema = z.enum(jobPositionDecisions);

export type JobPositionDecision = z.infer<typeof jobPositionDecisionSchema>;

export const riskEvaluationGaps = ['factors', 'measures', 'plan'] as const;

export const riskEvaluationGapSchema = z.enum(riskEvaluationGaps);

export type RiskEvaluationGap = z.infer<typeof riskEvaluationGapSchema>;

// For the fire-safety set, only `missing` and `ready` say anything: the lists about positions,
// evaluations and the workers' representative are empty.
export const documentReadinessResponseSchema = z.object({
  ready: z.boolean(),
  missing: z.array(missingDocumentDataSchema),
  // What decides whether decision 1.5 is part of the set (ADR 010).
  currentEmployeeCount: z.int().min(0),
  // The two names behind `responsible.workers_representative_is_legal_representative`.
  workersRepresentativeClash: z
    .object({ representativeName: z.string(), legalRepresentativeName: z.string() })
    .nullable(),
  // The positions behind `positions.equipment` and `positions.instructions`, each with what it
  // has not decided yet, so the form can send someone to each section of each position.
  undecidedJobPositions: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      undecided: z.array(jobPositionDecisionSchema).min(1),
    })
  ),
  // The evaluations behind `positions.risk_evaluation` and `risk_evaluations.*`, each with
  // what it lacks. `evaluationId` is null for a position or the sensitive groups not evaluated
  // yet; `jobPositionId` is null for an evaluation that is not a position's.
  incompleteRiskEvaluations: z.array(
    z.object({
      evaluationId: z.uuid().nullable(),
      kind: riskEvaluationKindSchema,
      jobPositionId: z.uuid().nullable(),
      name: z.string(),
      missing: z.array(riskEvaluationGapSchema).min(1),
    })
  ),
});

export type DocumentReadinessResponse = z.infer<typeof documentReadinessResponseSchema>;

/** Mirrors the `document_revision_status` enum in the database. */
export const documentRevisionStatuses = ['draft', 'issued', 'superseded'] as const;

export const documentRevisionStatusSchema = z.enum(documentRevisionStatuses);

export type DocumentRevisionStatus = z.infer<typeof documentRevisionStatusSchema>;

/**
 * An instruction module the own instructions annex (ADR 012), as the revision printed it: the
 * version it cites, not the library's current one.
 */
export const documentAnnexSchema = z.object({
  number: z.int().min(1),
  title: z.string(),
  moduleId: z.uuid(),
  version: z.object({
    id: z.uuid(),
    number: z.int().min(1),
    createdAt: z.iso.datetime({ offset: true }),
  }),
  // The library's current version when it is not the annexed one; regenerating would take it.
  newerVersion: z
    .object({ number: z.int().min(1), createdAt: z.iso.datetime({ offset: true }) })
    .nullable(),
});

export type DocumentAnnex = z.infer<typeof documentAnnexSchema>;

/** Mirrors the check on `document_template_versions.kind` (ADR 017). */
export const templateVersionKinds = ['legal', 'correction', 'layout'] as const;

export const templateVersionKindSchema = z.enum(templateVersionKinds);

export type TemplateVersionKind = z.infer<typeof templateVersionKindSchema>;

export const templateVersionSchema = z.object({
  version: z.int().min(1),
  kind: templateVersionKindSchema,
  // Null for the versions registered before notes existed.
  note: z.string().nullable(),
});

export type TemplateVersion = z.infer<typeof templateVersionSchema>;

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
  // The template version it was generated from; null for a file that was uploaded instead.
  templateVersion: templateVersionSchema.nullable(),
  // Empty for every document but the own instructions.
  annexes: z.array(documentAnnexSchema),
  createdAt: z.iso.datetime({ offset: true }),
});

export type DocumentRevision = z.infer<typeof documentRevisionSchema>;

/** Mirrors the `document_group` enum in the database. */
export const documentGroups = ['documentation_set', 'fire_safety_set', 'other'] as const;

export type DocumentGroup = (typeof documentGroups)[number];

export const documentSetGroups = {
  occupational_safety: 'documentation_set',
  fire_safety: 'fire_safety_set',
} as const satisfies Record<DocumentSet, DocumentGroup>;

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

/** One set's documents, in its order. A client has a few dozen at most: not paginated. */
export const clientDocumentListResponseSchema = z.object({
  items: z.array(clientDocumentSchema),
  // What the set's last generation asked, to fill the form in again. The fire-safety set has
  // no decisions yet, so no first number.
  lastGeneration: z
    .object({ issueDate: z.iso.date(), firstDecisionNumber: z.int().min(1).max(9999).nullable() })
    .nullable(),
  // Documents of the set this client does not need, such as decision 1.5 under 10 employees.
  // Always empty for the fire-safety set.
  notApplicable: z.array(documentTypeKeySchema),
  currentEmployeeCount: z.int().min(0),
});

export type ClientDocumentListResponse = z.infer<typeof clientDocumentListResponseSchema>;

export const generateDocumentsRequestSchema = z.object({
  // The date the documents carry, usually the start of the contract.
  issueDate: z.iso.date(),
  // Decisions are numbered from here: "Decizia nr. 1 SSM". Not read for the fire-safety set.
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
