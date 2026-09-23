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
  // The last time the contract in force, the issued revision, was emailed. Null when it was
  // not, also when an earlier revision was: "sent" is about the contract in force.
  lastSend: z
    .object({
      sentTo: z.string(),
      sentAt: z.iso.datetime({ offset: true }),
      revision: z.int().min(1),
    })
    .nullable(),
  // The details or the facts changed since the draft was generated: generating again would
  // print something else. Never for an issued revision, which records what it was built from.
  draftOutdated: z.boolean(),
});

export type ServiceContractResponse = z.infer<typeof serviceContractResponseSchema>;

export const sendServiceContractRequestSchema = z.object({
  to: z.email().max(254),
  // A few words of the owner's own, above the standard text of the email.
  note: z.string().trim().max(1000).nullish(),
});

export type SendServiceContractRequest = z.infer<typeof sendServiceContractRequestSchema>;

// Reasons of a 409 that the app words itself.
export const serviceContractConflictReasons = {
  numberTaken: 'contract_number_taken',
  missingData: 'missing_contract_data',
  templateMissing: 'template_missing',
  notIssued: 'contract_not_issued',
  pdfMissing: 'contract_pdf_missing',
} as const;

// The return link (ADR 007, amended): what the public page learns from a token, and what it
// sends back. The token travels in request bodies, never in URLs the API logs.
export const contractReturnRequestSchema = z.object({
  token: z.string().min(20).max(200),
});

export type ContractReturnRequest = z.infer<typeof contractReturnRequestSchema>;

// `open`: waiting for the signed copy. `received`: one arrived and can still be replaced.
// `confirmed`: an owner confirmed a copy, and the link has done its work. `superseded`: a
// newer revision was issued since the send. `expired`: too old. An unknown token is a 404.
export const contractReturnStatuses = [
  'open',
  'received',
  'confirmed',
  'superseded',
  'expired',
] as const;

export type ContractReturnStatus = (typeof contractReturnStatuses)[number];

export const contractReturnResponseSchema = z.object({
  status: z.enum(contractReturnStatuses),
  organizationName: z.string(),
  clientName: z.string(),
  contractNumber: z.int().min(1),
  contractDate: z.iso.date(),
  revision: z.int().min(1),
  // Whom to write to: the owner who sent the contract.
  contactEmail: z.string().nullable(),
  // When the copy that is there now arrived through the link; null unless `received`.
  receivedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type ContractReturnResponse = z.infer<typeof contractReturnResponseSchema>;

export const contractReturnConflictReasons = {
  closed: 'return_link_closed',
  tooManyUploads: 'return_link_too_many_uploads',
} as const;

// A received copy that an owner accepts as the signed copy.
export const confirmSignedCopyConflictReason = 'no_received_copy';
