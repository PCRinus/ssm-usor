import { z } from 'zod';

// The organization's own instructions, one Word file each, which the own instructions
// document annexes (ADR 012).

export const instructionModuleGroups = [
  'work_activity',
  'work_equipment',
  'protective_equipment',
] as const;

export const instructionModuleGroupSchema = z.enum(instructionModuleGroups);

export type InstructionModuleGroup = z.infer<typeof instructionModuleGroupSchema>;

/**
 * The set whose own instructions annex a module: the occupational safety one (3.2) or the
 * fire-safety one (2.1). A position decides about each apart (ADR 012, amendment of 2026-10-11).
 */
export const instructionDomains = ['ssm', 'psi'] as const;

export const instructionDomainSchema = z.enum(instructionDomains);

export type InstructionDomain = z.infer<typeof instructionDomainSchema>;

const domainOrSsm = instructionDomainSchema.default('ssm');

const title = z.string().trim().min(2).max(200);

export const instructionModuleVersionSchema = z.object({
  id: z.uuid(),
  number: z.int().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  sizeBytes: z.int().min(1),
  // The top-level numbered items of the file, what the training themes cite as "Art. 1–N".
  articleCount: z.int().min(0),
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

export const instructionModuleResponseSchema = z.object({ module: instructionModuleSchema });

export type InstructionModuleResponse = z.infer<typeof instructionModuleResponseSchema>;

/** A module written in the app starts from the skeleton. */
export const createInstructionModuleRequestSchema = z.object({
  title,
  group: instructionModuleGroupSchema,
  domain: domainOrSsm,
});

export type CreateInstructionModuleRequest = z.infer<typeof createInstructionModuleRequestSchema>;

/** The title and the group proposed for an uploaded file travel as query parameters, since the body is the file. */
export const uploadInstructionModuleQuerySchema = z.object({
  title: title.optional(),
  group: instructionModuleGroupSchema.default('work_activity'),
  domain: domainOrSsm,
});

export type UploadInstructionModuleQuery = z.infer<typeof uploadInstructionModuleQuerySchema>;

export const updateInstructionModuleRequestSchema = z.object({
  title: title.optional(),
  group: instructionModuleGroupSchema.optional(),
  // Refused while a position applies the module, whose decision belongs to the other set.
  domain: instructionDomainSchema.optional(),
  // True archives, false restores.
  archived: z.boolean().optional(),
});

export type UpdateInstructionModuleRequest = z.infer<typeof updateInstructionModuleRequestSchema>;

export const instructionModuleFileLinkQuerySchema = z.object({
  // Left out, the current version: an earlier one is what a document annexed.
  versionId: z.uuid().optional(),
});

export type InstructionModuleFileLinkQuery = z.infer<typeof instructionModuleFileLinkQuerySchema>;

export const instructionModuleFileLinkResponseSchema = z.object({
  url: z.url(),
  fileName: z.string(),
  expiresAt: z.iso.datetime({ offset: true }),
  version: z.object({
    id: z.uuid(),
    number: z.int().min(1),
    createdAt: z.iso.datetime({ offset: true }),
  }),
});

export type InstructionModuleFileLinkResponse = z.infer<
  typeof instructionModuleFileLinkResponseSchema
>;

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
  'instruction_module_applied',
  'instruction_module_archived',
  'instruction_module_domain_applied',
  'instruction_module_other_domain',
  'instructions_applied',
  'instructions_decided_by_modules',
] as const;

export type InstructionModuleErrorReason = (typeof instructionModuleErrorReasons)[number];
