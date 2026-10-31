import {
  bloodGroups,
  type EmployeeImportFieldName,
  knowledgeTests,
  rhFactors,
  supplementaryTrainingReasons,
  trainingDomains,
  trainingPhases,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import { sheetPageKinds, signatureStates, verifierSignatureStates } from './sheet-page';

// How a page came to its person (ADR 032): by the CNP, the folded name, a near name, as the first
// page of someone new, after the page before it in the upload, or not at all.
export const pagePlacements = [
  'cnp',
  'name',
  'near_name',
  'employee_number',
  'new_person',
  'placed_by_order',
  'unplaced',
] as const;

export type PagePlacement = (typeof pagePlacements)[number];

const sourced = <T extends z.ZodType>(value: T) =>
  z.object({ value, pageIds: z.array(z.string()).min(1) });

// No option is a missing value, one is proposed, several are a choice between pages that
// disagree. `app` is an existing employee's value, null when the app has none; absent for
// someone new.
const personField = <T extends z.ZodType>(value: T) =>
  z.object({ options: z.array(sourced(value)), app: value.nullable().optional() });

export type PersonField<T> = { options: { value: T; pageIds: string[] }[]; app?: T | null };

const textField = personField(z.string().min(1));
const dateField = personField(z.iso.date());

export const sheetPersonFieldsSchema = z.object({
  lastName: textField,
  firstName: textField,
  cnp: textField,
  employeeNumber: textField,
  birthDate: dateField,
  birthPlace: textField,
  homeAddress: textField,
  education: textField,
  qualification: textField,
  bloodGroup: personField(z.enum(bloodGroups)),
  rhFactor: personField(z.enum(rhFactors)),
  jobTitle: textField,
  hiredAt: dateField,
  leftOn: dateField,
  workplace: textField,
  commuteRoute: textField,
  commuteMinutes: personField(z.int()),
}) satisfies z.ZodType<Record<EmployeeImportFieldName, PersonField<unknown>>>;

export type SheetPersonFields = z.infer<typeof sheetPersonFieldsSchema>;

export const personFlagCodes = [
  'invalid_cnp',
  'cnp_birth_date_mismatch',
  // A digit of the CNP the birth date fixes: `cnpCorrection` is offered to accept.
  'cnp_correction',
  'blood_group_not_read',
  'month_only',
  'no_contact',
  'leaver',
  // The employee proposed has left the client, on the date in `detail`.
  'former_employee',
  // The sheet's hire date is after that leave date. In the app a rehire is a new employee, so
  // confirming blocks while the person stays matched to the former one.
  'rehire',
] as const;

export const personFlagSchema = z.object({
  code: z.enum(personFlagCodes),
  field: z.string().optional(),
  detail: z.string().optional(),
});

export type PersonFlag = z.infer<typeof personFlagSchema>;

export const rowFlagCodes = [
  // Doar luna pe fișă: the first of the month stands for it.
  'month_only',
  // Din tematica clientului: `fromThemes` names the values.
  'from_client_themes',
  // Nesemnat pe fișă: the trainee's box is empty.
  'unsigned',
  'signature_unclear',
  // A periodic duration other than 60, 90 or 120 minutes, or another training shorter than an
  // hour for occupational safety and a quarter of an hour for fire safety.
  'unusual_duration',
  'before_hire',
  'after_today',
  'admission_incomplete',
  // The same domain, phase and day as a training the app already has, or as an earlier row of
  // the same person's sheets.
  'in_app',
  'repeated',
] as const;

export type RowFlagCode = (typeof rowFlagCodes)[number];

export const themeFillableFields = [
  'trainerName',
  'trainerJobTitle',
  'material',
  'durationMinutes',
] as const;

export type ThemeFillableField = (typeof themeFillableFields)[number];

export const paperTestSchema = z.object({
  test: z.enum(knowledgeTests),
  // The row's date as read: a sheet dates its test only by the row it signs.
  takenOn: z.iso.date().nullable(),
  examinerName: z.string().nullable(),
  examinerJobTitle: z.string().nullable(),
  // Verificat pe fișă: the signature that closes the test is seen. Otherwise the result is
  // proposed unticked, and without it the employee's hiring test reads "Neverificat pe fișă".
  verified: z.boolean(),
  // The employee already has a pass of this test in the app.
  inApp: z.boolean(),
});

export type PaperTest = z.infer<typeof paperTestSchema>;

export const proposedSheetRowSchema = z.object({
  id: z.string().min(1),
  domain: z.enum(trainingDomains),
  phase: z.enum(trainingPhases),
  heldOn: z.iso.date().nullable(),
  durationMinutes: z.int().nullable(),
  trainerName: z.string().nullable(),
  trainerJobTitle: z.string().nullable(),
  verifierName: z.string().nullable(),
  verifierJobTitle: z.string().nullable(),
  material: z.string().nullable(),
  supplementaryReason: z.enum(supplementaryTrainingReasons).nullable(),
  signatures: z.object({
    trainee: z.enum(signatureStates),
    trainer: z.enum(signatureStates),
    verifier: z.enum(verifierSignatureStates),
  }),
  // Admis la lucru, on a workplace row only.
  admission: z
    .object({
      admittedOn: z.iso.date().nullable(),
      admittedByName: z.string().nullable(),
      admittedByJobTitle: z.string().nullable(),
    })
    .nullable(),
  fromThemes: z.array(z.enum(themeFillableFields)),
  // A row that records a test and no training: the fire-safety annual test.
  testOnly: z.boolean(),
  // The paper test the row records: the annual one, or the hiring test on every row of a phase
  // the test closes, of which `hiringTestRowIds` picks the one written.
  test: paperTestSchema.nullable(),
  flags: z.array(z.enum(rowFlagCodes)),
  proposedIncluded: z.boolean(),
});

export type ProposedSheetRow = z.infer<typeof proposedSheetRowSchema>;

export const proposedSheetPageSchema = z.object({
  // The caller's id for a photograph or a PDF's page.
  id: z.string().min(1),
  fileId: z.string().min(1),
  // A PDF's page, from 1; null for a photograph.
  page: z.int().min(1).nullable(),
  label: z.string(),
  // Null for a page that could not be read.
  kind: z.enum(sheetPageKinds).nullable(),
  personId: z.string().nullable(),
  placement: z.enum(pagePlacements),
  rows: z.array(proposedSheetRowSchema),
  unreadable: z.array(z.string()),
  notes: z.array(z.string()),
});

export type ProposedSheetPage = z.infer<typeof proposedSheetPageSchema>;

// `name_only`, for a person with no CNP and no birth date, is asked: the member confirms or
// declines it.
export const existingMatches = ['cnp', 'name_birth_date', 'name_only'] as const;

export type ExistingMatch = (typeof existingMatches)[number];

export const proposedSheetPersonSchema = z.object({
  id: z.string().min(1),
  pageIds: z.array(z.string()),
  fields: sheetPersonFieldsSchema,
  // Offered when one digit of the CNP was unreadable or misread and the birth date fixes it.
  cnpCorrection: z.string().nullable(),
  existing: z.object({ employeeId: z.string(), matchedBy: z.enum(existingMatches) }).nullable(),
  // Null for an existing employee, who keeps their post, and for a title no sheet gives.
  jobTitleId: z.string().nullable(),
  // Null where nothing is asked: an existing employee with a workplace, or a client with at
  // most one.
  workplaceId: z.string().nullable(),
  // The rows hidden since the app already has a training of the same domain, phase and day.
  rowsInApp: z.int().min(0),
  flags: z.array(personFlagSchema),
  // A leaver is proposed unticked.
  proposedIncluded: z.boolean(),
});

export type ProposedSheetPerson = z.infer<typeof proposedSheetPersonSchema>;

export const referenceMatches = ['exact', 'near', 'none'] as const;

export type ReferenceMatch = (typeof referenceMatches)[number];

// Exact is assigned quietly, near proposed to confirm, none asked. A client's one workplace is
// never asked, so it has no group.
const referenceGroup = {
  id: z.string().min(1),
  match: z.enum(referenceMatches),
  // The client's row proposed, exact or near.
  proposedId: z.string().nullable(),
  // With no match, the closest of the client's rows, to suggest first.
  closestId: z.string().nullable(),
  personIds: z.array(z.string()),
};

export const jobTitleGroupSchema = z.object({ ...referenceGroup, title: z.string().min(1) });

export type JobTitleGroup = z.infer<typeof jobTitleGroupSchema>;

// An empty text is everyone whose sheets name no workplace, asked once at a client with several.
export const workplaceGroupSchema = z.object({ ...referenceGroup, text: z.string() });

export type WorkplaceGroup = z.infer<typeof workplaceGroupSchema>;

export const employeeImportProposalSchema = z.object({
  // In the upload's order.
  pages: z.array(proposedSheetPageSchema),
  people: z.array(proposedSheetPersonSchema),
  jobTitles: z.array(jobTitleGroupSchema),
  workplaces: z.array(workplaceGroupSchema),
  // A client without posts: the import suggests the client import first.
  clientHasPositions: z.boolean(),
});

export type EmployeeImportProposal = z.infer<typeof employeeImportProposalSchema>;
