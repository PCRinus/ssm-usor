import { z } from 'zod';

import { countyCodeSchema } from './counties';
import { isValidCuiInput } from './cui';
import { listQuerySchema, pageSchema } from './list';

const optionalText = (min: number, max: number) => z.string().trim().min(min).max(max).nullish();

export const clientStages = ['lead', 'client'] as const;
export type ClientStage = (typeof clientStages)[number];

// The CUI accepts an optional RO prefix and spacing; the API stores digits only and
// treats a present prefix as VAT registration.
export const createClientRequestSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  cui: z
    .string()
    .trim()
    .min(2)
    .max(16)
    .refine(isValidCuiInput, { message: 'Invalid CUI (format or control digit).' }),
  vatPayer: z.boolean().default(false),
  caenCode: z
    .string()
    .trim()
    .regex(/^[0-9]{4}$/, { message: 'CAEN code must have four digits.' })
    .nullish(),
  tradeRegisterNumber: optionalText(1, 40),
  countyCode: countyCodeSchema.nullish(),
  locality: optionalText(1, 120),
  addressLine: optionalText(1, 240),
  legalRepresentativeName: optionalText(2, 160),
  declaredEmployeeCount: z.int().min(0).max(1_000_000).nullish(),
  contactName: optionalText(2, 160),
  contactEmail: z.email().max(254).nullish(),
  contactPhone: optionalText(5, 20),
  stage: z.enum(clientStages).default('client'),
});

export type CreateClientRequest = z.infer<typeof createClientRequestSchema>;

// Without the representative's name: the document details edit it with the role, and a
// second route writing the same column would overwrite it from a form that never showed it.
// Without the stage: promotion is the only way from one to the other. A contact field left
// out stays as it is, so that a form without the contact does not erase it; null clears it.
export const updateClientRequestSchema = createClientRequestSchema.omit({
  legalRepresentativeName: true,
  stage: true,
});

export type UpdateClientRequest = z.infer<typeof updateClientRequestSchema>;

// Where a lead stands is where its contract stands (ADR 007). An issued contract has been
// handed over or is ready to be, and "sent" is about that one: a revision issued after the
// last send is not sent yet. "Signed" arrives with the signed copy.
export const serviceContractStates = ['none', 'draft', 'issued', 'sent'] as const;
export type ServiceContractState = (typeof serviceContractStates)[number];

export const clientSchema = z.object({
  id: z.uuid(),
  legalName: z.string(),
  cui: z.string(),
  vatPayer: z.boolean(),
  caenCode: z.string().nullable(),
  tradeRegisterNumber: z.string().nullable(),
  countyCode: countyCodeSchema.nullable(),
  locality: z.string().nullable(),
  addressLine: z.string().nullable(),
  legalRepresentativeName: z.string().nullable(),
  declaredEmployeeCount: z.int().nullable(),
  stage: z.enum(clientStages),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  promotedAt: z.iso.datetime({ offset: true }).nullable(),
  // Only in the list of leads, which is an owner's; null everywhere else.
  serviceContractState: z.enum(serviceContractStates).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type Client = z.infer<typeof clientSchema>;

export const clientResponseSchema = z.object({ client: clientSchema });

export type ClientResponse = z.infer<typeof clientResponseSchema>;

export const clientSortKeys = ['legalName', 'cui', 'declaredEmployeeCount'] as const;
export type ClientSortKey = (typeof clientSortKeys)[number];

export const clientListStatuses = ['active', 'archived'] as const;
export type ClientListStatus = (typeof clientListStatuses)[number];

export const listClientsQuerySchema = listQuerySchema(clientSortKeys, 'legalName').extend({
  status: z.enum(clientListStatuses).default('active'),
  stage: z.enum(clientStages).default('client'),
});

// Reasons of a 409 that the app words itself.
export const clientConflictReasons = {
  cuiTaken: 'cui_taken',
  cuiTakenByArchived: 'cui_taken_by_archived',
  clientArchived: 'client_archived',
  cuiTakenByLead: 'cui_taken_by_lead',
  clientIsLead: 'client_is_lead',
} as const;

export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;

export const clientListResponseSchema = pageSchema(clientSchema);

export type ClientListResponse = z.infer<typeof clientListResponseSchema>;

export const clientOwnerNotesSchema = z.object({
  body: z.string(),
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type ClientOwnerNotes = z.infer<typeof clientOwnerNotesSchema>;

export const clientOwnerNotesResponseSchema = z.object({ notes: clientOwnerNotesSchema });

export type ClientOwnerNotesResponse = z.infer<typeof clientOwnerNotesResponseSchema>;

export const saveClientOwnerNotesRequestSchema = z.object({ body: z.string().max(5000) });

export type SaveClientOwnerNotesRequest = z.infer<typeof saveClientOwnerNotesRequestSchema>;

// Public company data from ANAF, used to prefill the client form.
export const companyLookupQuerySchema = z.object({
  cui: z
    .string()
    .trim()
    .min(2)
    .max(16)
    .refine(isValidCuiInput, { message: 'Invalid CUI (format or control digit).' }),
});

export const companyLookupSchema = z.object({
  cui: z.string(),
  legalName: z.string(),
  vatPayer: z.boolean(),
  caenCode: z.string().nullable(),
  tradeRegisterNumber: z.string().nullable(),
  countyCode: countyCodeSchema.nullable(),
  locality: z.string().nullable(),
  addressLine: z.string().nullable(),
  registrationStatus: z.string().nullable(),
  inactive: z.boolean(),
});

export type CompanyLookup = z.infer<typeof companyLookupSchema>;

export const companyLookupResponseSchema = z.object({ company: companyLookupSchema });

export type CompanyLookupResponse = z.infer<typeof companyLookupResponseSchema>;
