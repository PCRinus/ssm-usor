import { z } from 'zod';

import { countyCodeSchema } from './counties';
import { isValidCuiInput, normalizeCui } from './cui';
import { searchWithoutLegalForms } from './legal-forms';
import {
  listQuerySchema,
  listSearchSchema,
  pageSchema,
  repeatedQueryValue,
  searchTerms,
} from './list';

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
// last send is not sent yet, and likewise "signed": the signed copy of the revision in force.
// "received" is a copy that came through the return link and waits for an owner to confirm.
export const serviceContractStates = [
  'none',
  'draft',
  'issued',
  'sent',
  'received',
  'signed',
] as const;
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
  // What a lead declares; a client goes by its employee list instead.
  declaredEmployeeCount: z.int().nullable(),
  currentEmployeeCount: z.int().min(0),
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

export const clientResponseSchema = z.object({
  client: clientSchema,
  // Whether the caller may delete the client outright: an archived client, outside production
  // or for a platform admin only.
  canDelete: z.boolean(),
});

export type ClientResponse = z.infer<typeof clientResponseSchema>;

// Where one of a client's documentation sets stands: nothing generated yet, some of it, or
// every document that applies issued.
export const documentationStates = ['none', 'in_progress', 'issued'] as const;
export type DocumentationState = (typeof documentationStates)[number];

export const clientDocumentationSchema = z.object({
  state: z.enum(documentationStates),
  issuedCount: z.int().min(0),
  // The documents of the set that apply to the client, as its tab ("Documentație SSM" or
  // "Documentație SU") lists them.
  totalCount: z.int().min(0),
  lastGeneratedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type ClientDocumentation = z.infer<typeof clientDocumentationSchema>;

// The current employees of a client by their training (ADR 021), each counted once in every
// state they are in, in either domain. An archived client counts none.
export const clientTrainingSchema = z.object({
  employeeCount: z.int().min(0),
  untrainedCount: z.int().min(0),
  overdueCount: z.int().min(0),
  dueCount: z.int().min(0),
  // Untrained or overdue: "de instruit".
  attentionCount: z.int().min(0),
  // The nearest due date not yet passed, in either domain.
  nextDueOn: z.iso.date().nullable(),
});

export type ClientTraining = z.infer<typeof clientTrainingSchema>;

// What the list of clients adds to each, to show which still need work. A lead has no
// documentation set and is not a client yet, so the work fields are null for a lead.
export const clientListItemSchema = clientSchema.extend({
  // When the company became a client: its promotion for a former lead, otherwise its creation.
  clientSince: z.iso.datetime({ offset: true }).nullable(),
  // The occupational safety set.
  documentation: clientDocumentationSchema.nullable(),
  fireSafetyDocumentation: clientDocumentationSchema.nullable(),
  training: clientTrainingSchema.nullable(),
  // Whether the caller may delete the client outright, as on clientResponseSchema.
  canDelete: z.boolean(),
  // A lead's only: when its contract was issued, last sent, its copy received or that copy
  // confirmed, by its state; null with no contract or a draft.
  serviceContractStateAt: z.iso.datetime({ offset: true }).nullable(),
  // When the last return link sent for the contract stops working; null once a copy came back.
  serviceContractReturnExpiresAt: z.iso.datetime({ offset: true }).nullable(),
});

export type ClientListItem = z.infer<typeof clientListItemSchema>;

export const clientSortKeys = [
  'legalName',
  'cui',
  'currentEmployeeCount',
  // Both by their state, then the number of issued documents, so that ascending puts the least
  // done first.
  'documentation',
  'fireSafetyDocumentation',
  // The most urgent first: someone to train, then someone due, then everyone current, then
  // nobody to train; the most people first within each.
  'training',
  // Clients with no date come last either way.
  'nextTrainingDueOn',
  'clientSince',
] as const;
export type ClientSortKey = (typeof clientSortKeys)[number];

export const leadSortKeys = [
  'legalName',
  'cui',
  // Leads that declared no number come last either way.
  'declaredEmployeeCount',
  // In the order of serviceContractStates; within a state, either way, the one that reached it
  // first leads.
  'serviceContractState',
  'createdAt',
] as const;
export type LeadSortKey = (typeof leadSortKeys)[number];

export const clientListSortKeys = [
  ...clientSortKeys,
  'declaredEmployeeCount',
  'serviceContractState',
  'createdAt',
] as const;
export type ClientListSortKey = (typeof clientListSortKeys)[number];

export const clientListStatuses = ['active', 'archived'] as const;
export type ClientListStatus = (typeof clientListStatuses)[number];

// A client matches a training state when at least one current employee is in it, in either
// domain; "current" when every one is current in both, so never a client without employees,
// and never an archived client, whose employees the training rules do not follow.
export const clientTrainingFilters = ['untrained', 'overdue', 'due', 'current'] as const;
export type ClientTrainingFilter = (typeof clientTrainingFilters)[number];

export const clientAttentionFilters = [
  'documentsBehind',
  'missingBasicData',
  'signaturesPending',
  'testsPending',
] as const;
export type ClientAttentionFilter = (typeof clientAttentionFilters)[number];

// Owners only, as the contracts are.
export const clientContractFilters = ['endingWithin60Days'] as const;
export type ClientContractFilter = (typeof clientContractFilters)[number];

// Within one filter any value matches; across filters every one must.
export const clientListFiltersSchema = z.object({
  documentation: repeatedQueryValue(z.enum(documentationStates)).optional(),
  fireSafetyDocumentation: repeatedQueryValue(z.enum(documentationStates)).optional(),
  training: repeatedQueryValue(z.enum(clientTrainingFilters)).optional(),
  attention: repeatedQueryValue(z.enum(clientAttentionFilters)).optional(),
  county: repeatedQueryValue(countyCodeSchema).optional(),
  contract: repeatedQueryValue(z.enum(clientContractFilters)).optional(),
});

export type ClientListFilters = z.infer<typeof clientListFiltersSchema>;

export const clientListFilterKeys = Object.keys(
  clientListFiltersSchema.shape
) as (keyof ClientListFilters)[];

// Not `contract`, which on the clients list is about when the contract ends.
export const leadListFiltersSchema = z.object({
  contractState: repeatedQueryValue(z.enum(serviceContractStates)).optional(),
});

export type LeadListFilters = z.infer<typeof leadListFiltersSchema>;

export const leadListFilterKeys = Object.keys(
  leadListFiltersSchema.shape
) as (keyof LeadListFilters)[];

export const listClientsQuerySchema = listQuerySchema(clientListSortKeys, 'legalName')
  .extend({
    status: z.enum(clientListStatuses).default('active'),
    stage: z.enum(clientStages).default('client'),
    q: listSearchSchema.optional(),
  })
  .extend(clientListFiltersSchema.shape)
  .extend(leadListFiltersSchema.shape);

/**
 * The terms the clients search matches against name, CUI and locality. A legal form at either
 * end, dotted or not ("S.C.", "S.R.L.", "SA") or spelled out, says nothing about which client is
 * meant, nor does the RO before a CUI. A search that is a valid CUI alone, typed in groups
 * ("RO 15 900 82", "15.900.82"), is one term; other digits stay apart, as in "24.7 Fitness".
 */
export function clientSearchTerms(q: string | undefined) {
  const typed = (q ?? '').trim();
  const asCui = isValidCuiInput(typed) ? normalizeCui(typed)?.cui : undefined;
  const kept = searchWithoutLegalForms(asCui ?? typed).flatMap((term, index, all) => {
    if (term === 'ro' && /^\d/.test(all[index + 1] ?? '')) return [];
    return [/^ro\d+$/.test(term) ? term.slice(2) : term];
  });
  return kept.length > 0 ? kept : searchTerms(typed);
}

// Reasons of a 409 that the app words itself.
export const clientConflictReasons = {
  cuiTaken: 'cui_taken',
  cuiTakenByArchived: 'cui_taken_by_archived',
  clientArchived: 'client_archived',
  cuiTakenByLead: 'cui_taken_by_lead',
  clientIsLead: 'client_is_lead',
  clientNotArchived: 'client_not_archived',
} as const;

export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;

export const clientListResponseSchema = pageSchema(clientListItemSchema).extend({
  // The count with no search and no filter, the same as total without either.
  unfilteredTotal: z.int().min(0),
});

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
  phone: z.string().nullable(),
  // Without spaces; `formatIban` prints it.
  iban: z.string().nullable(),
  registrationStatus: z.string().nullable(),
  inactive: z.boolean(),
});

export type CompanyLookup = z.infer<typeof companyLookupSchema>;

export const companyLookupResponseSchema = z.object({ company: companyLookupSchema });

export type CompanyLookupResponse = z.infer<typeof companyLookupResponseSchema>;
