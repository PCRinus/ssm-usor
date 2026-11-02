import { z } from 'zod';

import {
  instructionBodySchema,
  instructionCategories,
  type InstructionCategory,
  instructionCategorySchema,
} from './instruction-body';

// The organization's own instructions, each a body of headings and articles that the own
// instructions document annexes (ADR 012, ADR 034).

// The category, called `group` on the wire since ADR 012.
export const instructionModuleGroups = instructionCategories;

export const instructionModuleGroupSchema = instructionCategorySchema;

export type InstructionModuleGroup = InstructionCategory;

/**
 * The set whose own instructions annex a module: the occupational safety one (3.2) or the
 * fire-safety one (2.1). A position decides about each apart (ADR 012, amendment of 2026-10-11).
 */
export const instructionDomains = ['ssm', 'su'] as const;

export const instructionDomainSchema = z.enum(instructionDomains);

export type InstructionDomain = z.infer<typeof instructionDomainSchema>;

const domainOrSsm = instructionDomainSchema.default('ssm');

const title = z.string().trim().min(2).max(200);

export const instructionModuleVersionSchema = z.object({
  id: z.uuid(),
  number: z.int().min(1),
  textHash: z.string().regex(/^[0-9a-f]{64}$/),
  // What the training themes cite as "Art. 1–N".
  articleCount: z.int().min(1),
  createdAt: z.iso.datetime({ offset: true }),
});

export type InstructionModuleVersion = z.infer<typeof instructionModuleVersionSchema>;

export const instructionModuleSchema = z.object({
  id: z.uuid(),
  title,
  group: instructionModuleGroupSchema,
  domain: instructionDomainSchema,
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
  version: instructionModuleVersionSchema,
  // Current positions applying it, across the organization's clients.
  appliedCount: z.int().min(0),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type InstructionModule = z.infer<typeof instructionModuleSchema>;

export const instructionModuleListQuerySchema = z.object({
  // Archived modules leave the list unless asked for.
  archived: z.enum(['true', 'false']).default('false'),
  // Left out, both domains.
  domain: instructionDomainSchema.optional(),
});

export type InstructionModuleListQuery = z.infer<typeof instructionModuleListQuerySchema>;

export const instructionModuleListResponseSchema = z.object({
  items: z.array(instructionModuleSchema),
});

export type InstructionModuleListResponse = z.infer<typeof instructionModuleListResponseSchema>;

export const instructionModuleResponseSchema = z.object({
  module: instructionModuleSchema,
  body: instructionBodySchema,
});

export type InstructionModuleResponse = z.infer<typeof instructionModuleResponseSchema>;

/** A module is created with its first version: nothing is stored before its first save. */
export const createInstructionModuleRequestSchema = z.object({
  title,
  // Of the module's domain (`categoryFitsDomain`).
  group: instructionModuleGroupSchema,
  domain: domainOrSsm,
  body: instructionBodySchema,
});

export type CreateInstructionModuleRequest = z.infer<typeof createInstructionModuleRequestSchema>;

export const updateInstructionModuleRequestSchema = z.object({
  title: title.optional(),
  // The category of the domain the module has after the change.
  group: instructionModuleGroupSchema.optional(),
  // Refused while a position applies the module, whose decision belongs to the other set; a
  // category of the other domain comes with it.
  domain: instructionDomainSchema.optional(),
  // True archives, false restores.
  archived: z.boolean().optional(),
});

export type UpdateInstructionModuleRequest = z.infer<typeof updateInstructionModuleRequestSchema>;

export const saveInstructionBodyResponseSchema = instructionModuleResponseSchema.extend({
  // False when the body differs from the current one only in whitespace: nothing was stored.
  changed: z.boolean(),
});

export type SaveInstructionBodyResponse = z.infer<typeof saveInstructionBodyResponseSchema>;

export const instructionModuleVersionResponseSchema = z.object({
  version: instructionModuleVersionSchema,
  body: instructionBodySchema,
});

export type InstructionModuleVersionResponse = z.infer<
  typeof instructionModuleVersionResponseSchema
>;

export const instructionModuleDownloadQuerySchema = z.object({
  // Left out, the current version: an earlier one is what a document annexed.
  versionId: z.uuid().optional(),
});

export type InstructionModuleDownloadQuery = z.infer<typeof instructionModuleDownloadQuerySchema>;

/** The annex as it will print, for a body not saved yet: "Scrie o instrucțiune" saves later. */
export const instructionPreviewRequestSchema = z.object({
  title,
  domain: domainOrSsm,
  body: instructionBodySchema,
});

export type InstructionPreviewRequest = z.infer<typeof instructionPreviewRequestSchema>;

export const appliedInstructionSchema = z.object({
  moduleId: z.uuid(),
  title: z.string(),
  group: instructionModuleGroupSchema,
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type AppliedInstruction = z.infer<typeof appliedInstructionSchema>;

export const positionInstructionsQuerySchema = z.object({ domain: domainOrSsm });

export type PositionInstructionsQuery = z.infer<typeof positionInstructionsQuerySchema>;

export const positionInstructionsResponseSchema = z.object({
  domain: instructionDomainSchema,
  items: z.array(appliedInstructionSchema),
  // The domain's decision: null until decided; false when the post needs none; true while it
  // applies modules of the domain.
  needsInstructions: z.boolean().nullable(),
});

export type PositionInstructionsResponse = z.infer<typeof positionInstructionsResponseSchema>;

/** Replaces the set: the modules the position applies from now on. */
export const applyInstructionsRequestSchema = z.object({
  // Every module must be of this domain; the other domain's set is left as it is.
  domain: domainOrSsm,
  moduleIds: z.array(z.uuid()).max(100),
});

export type ApplyInstructionsRequest = z.infer<typeof applyInstructionsRequestSchema>;

export const instructionStates = ['undecided', 'none', 'applied'] as const;

export type InstructionState = (typeof instructionStates)[number];

export function instructionState(needsInstructions: boolean | null): InstructionState {
  if (needsInstructions === null) return 'undecided';
  return needsInstructions ? 'applied' : 'none';
}

// Applied modules decide "needs instructions" by themselves, so only "needs none" and taking
// that back are said in words.
export const instructionsDecisionSchema = z.object({
  domain: domainOrSsm,
  needsInstructions: z.boolean().nullable(),
});

export type InstructionsDecision = z.infer<typeof instructionsDecisionSchema>;

export const copyInstructionsRequestSchema = z.object({
  fromJobPositionId: z.uuid(),
  domain: domainOrSsm,
});

export type CopyInstructionsRequest = z.infer<typeof copyInstructionsRequestSchema>;

/** `reason` values on instruction module errors, so the SPA can word them itself. */
export const instructionModuleErrorReasons = [
  'instruction_module_title_taken',
  'instruction_module_category_domain',
  'instruction_module_applied',
  'instruction_module_archived',
  'instruction_module_domain_applied',
  'instruction_module_other_domain',
  'instructions_applied',
  'instructions_decided_by_modules',
] as const;

export type InstructionModuleErrorReason = (typeof instructionModuleErrorReasons)[number];
