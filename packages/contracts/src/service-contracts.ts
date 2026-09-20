import { z } from 'zod';

import { clientDocumentSchema } from './documents';

/**
 * Documents about a client that are not part of its documentation set (ADR 007), with their
 * titles. The service contract is the first, and only owners see it.
 */
export const otherDocumentTypes = {
  service_contract: 'Contract de prestări servicii',
} as const;

export type OtherDocumentTypeKey = keyof typeof otherDocumentTypes;

export const serviceContractTypeKey = 'service_contract' satisfies OtherDocumentTypeKey;

/**
 * What the app reads about a contract. Prices are not here: they live in the file, where
 * they are binding, and the owner writes them in the editor.
 */
export const serviceContractSchema = z.object({
  // The provider's own register: "Nr. 51 din 15.02.2024". Used once a year.
  contractNumber: z.int().min(1).max(999_999),
  contractDate: z.iso.date(),
  startDate: z.iso.date(),
  durationMonths: z.int().min(1).max(120),
  renewsAutomatically: z.boolean(),
  coversOccupationalSafety: z.boolean(),
  coversFireSafety: z.boolean(),
  // The last day of the first term: the start date plus the duration, less a day.
  endDate: z.iso.date(),
});

export type ServiceContract = z.infer<typeof serviceContractSchema>;

export const saveServiceContractRequestSchema = serviceContractSchema
  .omit({ endDate: true })
  .extend({
    renewsAutomatically: z.boolean().default(true),
    coversOccupationalSafety: z.boolean().default(true),
    coversFireSafety: z.boolean().default(false),
    // Who signs for the client. They are facts about the client, kept on it, and asked here
    // because a lead has no other form for them. Left out, they stay as they are.
    clientRepresentativeName: z.string().trim().min(2).max(160).nullish(),
    clientRepresentativeRole: z.string().trim().min(2).max(80).nullish(),
  })
  .refine((body) => body.coversOccupationalSafety || body.coversFireSafety, {
    path: ['coversOccupationalSafety'],
    message: 'A contract covers occupational safety, fire safety, or both.',
  });

export type SaveServiceContractRequest = z.infer<typeof saveServiceContractRequestSchema>;

/**
 * What a contract cannot be generated without, by where it is filled in: the organization's
 * legal details and contract details, the client's data, and the contract's own details.
 * The fire-safety technician is asked only for a contract that covers fire safety.
 */
export const missingServiceContractData = [
  'provider.legalName',
  'provider.cui',
  'provider.tradeRegisterNumber',
  'provider.address',
  'provider.representativeName',
  'provider.representativeRole',
  'provider.phone',
  'provider.bankAccount',
  'provider.authorizationCertificate',
  'provider.fireSafetyTechnician',
  'client.tradeRegisterNumber',
  'client.address',
  'client.representativeName',
  'client.representativeRole',
  'contract.details',
] as const;

export const missingServiceContractDataSchema = z.enum(missingServiceContractData);

export type MissingServiceContractData = z.infer<typeof missingServiceContractDataSchema>;

export const serviceContractResponseSchema = z.object({
  // Null until the owner saves the details.
  contract: serviceContractSchema.nullable(),
  // The last number of the contract date's year plus one, the year being this one until a
  // date is saved. Null when the organization has no contract at all: its register started
  // somewhere else, and only the owner knows where.
  suggestedNumber: z.int().nullable(),
  clientRepresentative: z.object({ name: z.string().nullable(), role: z.string().nullable() }),
  readiness: z.object({ ready: z.boolean(), missing: z.array(missingServiceContractDataSchema) }),
  // Null until the contract is generated.
  document: clientDocumentSchema.nullable(),
  // The details or the facts changed since the draft was generated: generating again would
  // print something else. Never for an issued revision, which records what it was built from.
  draftOutdated: z.boolean(),
});

export type ServiceContractResponse = z.infer<typeof serviceContractResponseSchema>;

// Reasons of a 409 that the app words itself.
export const serviceContractConflictReasons = {
  numberTaken: 'contract_number_taken',
  missingData: 'missing_contract_data',
  templateMissing: 'template_missing',
} as const;
