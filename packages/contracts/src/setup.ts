import { z } from 'zod';

export const setupMemberStepIds = [
  'client',
  'workplaces-positions',
  'employees',
  'responsible-persons',
  'risk-evaluation',
  'fire-safety-data',
  'generate-sets',
  'issue-document',
  'portal-invitation',
  'training',
  'signature',
] as const;

export const setupStepIds = [
  'account',
  'company',
  'authorizations',
  'professional-title',
  ...setupMemberStepIds,
] as const;

export const setupStepIdSchema = z.enum(setupStepIds);

export type SetupStepId = z.infer<typeof setupStepIdSchema>;

export const setupMemberStepIdSchema = z.enum(setupMemberStepIds);

export type SetupMemberStepId = z.infer<typeof setupMemberStepIdSchema>;

export const setupStepStateSchema = z.enum(['done', 'skipped', 'locked', 'open']);

export type SetupStepState = z.infer<typeof setupStepStateSchema>;

export const setupLockSchema = z.enum([
  'needs-client',
  'needs-workplace-and-position',
  'needs-position',
  'needs-organization-data',
  'needs-professional-title',
  'needs-basic-data',
  'needs-draft',
  'needs-employee',
  'needs-training-record',
]);

export type SetupLock = z.infer<typeof setupLockSchema>;

// Focus keys the SPA's Date firmă and Abilitări pages accept, in their forms' order: the CUI
// first, because its ANAF lookup fills the name and the address.
export const setupCompanyFields = [
  'cui',
  'legal-name',
  'address',
  'representative-name',
  'representative-role',
] as const;

export const setupAuthorizationsFields = ['certificate', 'fire-safety-technician'] as const;

export const setupFieldSchema = z.enum([...setupCompanyFields, ...setupAuthorizationsFields]);

export type SetupField = z.infer<typeof setupFieldSchema>;

export const setupStepSchema = z
  .object({
    id: setupStepIdSchema,
    state: setupStepStateSchema,
    // False for an organization step when the caller is not an owner, who can only wait for it.
    canDo: z.boolean(),
    lock: setupLockSchema.optional(),
    missing: z.array(setupFieldSchema).optional(),
  })
  .meta({ id: 'SetupStep' });

export type SetupStep = z.infer<typeof setupStepSchema>;

export const setupGuideSchema = z.object({
  steps: z.array(setupStepSchema),
  next: setupStepIdSchema.nullable(),
  // The active client furthest along, which the steps on a client open; null without one.
  clientId: z.uuid().nullable(),
  // Null unless the organization has exactly one owner, so the app names no one among several.
  ownerName: z.string().nullable(),
  // The member steps drop «primul» once the organization has a client, whoever added it.
  organizationHasClients: z.boolean(),
  closed: z.boolean(),
  finished: z.boolean(),
});

export type SetupGuide = z.infer<typeof setupGuideSchema>;

export const updateSetupGuideRequestSchema = z.object({
  closed: z.boolean().optional(),
  finished: z.boolean().optional(),
});

export type UpdateSetupGuideRequest = z.infer<typeof updateSetupGuideRequestSchema>;

export const setupErrorReasons = ['profile_missing'] as const;

export type SetupErrorReason = (typeof setupErrorReasons)[number];
