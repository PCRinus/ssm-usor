import {
  equipmentAllocations,
  fireEquipmentKinds,
  fireExtinguishingAgents,
  fireInstallationKinds,
  responsiblePersonRoles,
  staffCategories,
} from '@ssm-usor/contracts';
import { z } from 'zod';

// A blank file or quote is kept rather than refused, for the checks to flag.
export const sourceSchema = z.object({
  file: z.string(),
  quote: z.string(),
});

export type Source = z.infer<typeof sourceSchema>;

const traced = {
  sources: z.array(sourceSchema).min(1),
  // The company whose copied passages are the only place the value appears; proposed unticked.
  otherCompanyName: z.string().min(1).nullable(),
};

export function optionSchema<T extends z.ZodType>(value: T) {
  return z.object({ value, ...traced });
}

export type Option<T> = { value: T; sources: Source[]; otherCompanyName: string | null };

// No option is a missing value, one is proposed, several are a choice between documents that disagree.
export function fieldSchema<T extends z.ZodType>(value: T) {
  return z.object({ options: z.array(optionSchema(value)) });
}

export type Field<T> = { options: Option<T>[] };

const textField = fieldSchema(z.string().min(1));
const integerField = fieldSchema(z.int());

export const clientFieldNames = [
  'legalName',
  'cui',
  'tradeRegisterNumber',
  'caenCode',
  'countyCode',
  'locality',
  'addressLine',
  'legalRepresentativeName',
  'legalRepresentativeRole',
  'contactName',
  'contactPhone',
  'contactEmail',
] as const;

export type ClientFieldName = (typeof clientFieldNames)[number];

export const trainingScheduleFieldNames = [
  'periodicTrainingMinutes',
  'administrativeTrainingIntervalMonths',
  'workerTrainingIntervalMonths',
  'trainingFirstMonth',
  'trainingDayFrom',
  'trainingDayTo',
] as const;

export type TrainingScheduleFieldName = (typeof trainingScheduleFieldNames)[number];

export const fireSafetyIntegerFieldNames = [
  'periodicTrainingHours',
  'administrativeTrainingIntervalMonths',
  'workerTrainingIntervalMonths',
] as const;

export const fireSafetyTextFieldNames = [
  'smokingPolicy',
  'smokingPlace',
  'wasteContractor',
] as const;

export type FireSafetyFieldName =
  (typeof fireSafetyIntegerFieldNames)[number] | (typeof fireSafetyTextFieldNames)[number];

function fields<const K extends string, T extends z.ZodType>(names: readonly K[], field: T) {
  return z.object(Object.fromEntries(names.map((name) => [name, field])) as Record<K, T>);
}

// The county is the vehicle registration code when the written one could be recognised, and
// the smoking policy a `fire_smoking_policy` value; otherwise as written, which the checks flag.
export const proposedClientSchema = fields(clientFieldNames, textField);

export const proposedTrainingScheduleSchema = fields(trainingScheduleFieldNames, integerField);

export const proposedFireSafetySchema = fields(fireSafetyIntegerFieldNames, integerField).extend(
  fields(fireSafetyTextFieldNames, textField).shape
);

const item = { id: z.string().min(1), ...traced };

export const proposedWorkplaceSchema = z.object({
  ...item,
  name: z.string().min(1),
  countyCode: z.string().nullable(),
  locality: z.string().nullable(),
  addressLine: z.string().nullable(),
  isRegisteredOffice: z.boolean(),
  activity: z.string().nullable(),
  // Where fire-safety means stand at this address: a workplace is an address, not a room.
  rooms: z.array(z.string().min(1)),
});

export type ProposedWorkplace = z.infer<typeof proposedWorkplaceSchema>;

export const proposedJobPositionSchema = z.object({
  ...item,
  name: z.string().min(1),
  staffCategory: z.enum(staffCategories).nullable(),
  trainingIntervalMonths: z.int().nullable(),
  workZone: z.string().nullable(),
  activities: z.string().nullable(),
});

export type ProposedJobPosition = z.infer<typeof proposedJobPositionSchema>;

// A reference keeps the name as written, and the id of the item it names when one matches.
const reference = (name: z.ZodType<string | null>) => ({ name, id: z.string().nullable() });

export const proposedResponsiblePersonSchema = z.object({
  ...item,
  fullName: z.string().min(1),
  jobTitle: z.string().nullable(),
  roles: z.array(z.enum(responsiblePersonRoles)).min(1),
  // Without a name, the person stands for every workplace, as `workplace_id` null does.
  workplace: z.object(reference(z.string().nullable())),
});

export type ProposedResponsiblePerson = z.infer<typeof proposedResponsiblePersonSchema>;

export const proposedFireEquipmentSchema = z.object({
  ...item,
  workplace: z.object(reference(z.string().nullable())),
  room: z.string().nullable(),
  kind: z.enum(fireEquipmentKinds),
  agent: z.enum(fireExtinguishingAgents).nullable(),
  // Kilograms or litres, as `fire_equipment.capacity`.
  capacity: z.int().nullable(),
  wheeled: z.boolean(),
  // Units alike; confirming writes one `fire_equipment` row for each.
  count: z.int().nullable(),
});

export type ProposedFireEquipment = z.infer<typeof proposedFireEquipmentSchema>;

export const proposedFireInstallationSchema = z.object({
  ...item,
  workplace: z.object(reference(z.string().nullable())),
  kind: z.enum(fireInstallationKinds),
  description: z.string().nullable(),
});

export type ProposedFireInstallation = z.infer<typeof proposedFireInstallationSchema>;

export const proposedProtectiveEquipmentSchema = z.object({
  ...item,
  // Without a name when the document names no post for the entry, for the member to choose.
  jobPosition: z.object(reference(z.string().min(1).nullable())),
  risk: z.string().nullable(),
  item: z.string().min(1),
  quantity: z.int().nullable(),
  durationMonths: z.int().nullable(),
  allocation: z.enum(equipmentAllocations).nullable(),
});

export type ProposedProtectiveEquipment = z.infer<typeof proposedProtectiveEquipmentSchema>;

// The client import creates an employee only for a role that needs one (ADR 030); everyone
// else comes from the employee import.
export const importedEmployeeRoles = ['workers_representative', 'legal_representative'] as const;

export type ImportedEmployeeRole = (typeof importedEmployeeRoles)[number];

export const proposedEmployeeSchema = z.object({
  ...item,
  role: z.enum(importedEmployeeRoles),
  lastName: z.string().nullable(),
  firstName: z.string().nullable(),
  cnp: z.string().nullable(),
  birthDate: z.iso.date().nullable(),
  jobTitle: z.string().nullable(),
  hiredAt: z.iso.date().nullable(),
});

export type ProposedEmployee = z.infer<typeof proposedEmployeeSchema>;

// Unticked, an item is written only when the member ticks it: what only another company's
// passages give, and the legal representative as an employee, who is one only when the
// documents show them on the staff (ADR 030), which a reading too often assumes.
export function proposedIncluded(item: { otherCompanyName: string | null; role?: string }) {
  return item.otherCompanyName === null && item.role !== 'legal_representative';
}

export const flagCodes = [
  'file_not_found',
  'quote_not_found',
  'value_not_in_quote',
  'invalid_cui',
  'invalid_cnp',
  'cnp_birth_date_mismatch',
  'value_not_allowed',
  'duplicate',
  'missing',
  'unknown_reference',
  'cui_not_registered',
  'legal_name_differs',
] as const;

export type FlagCode = (typeof flagCodes)[number];

export const flagSchema = z.object({
  // Dot-separated, as `client.cui.options.0` or `jobPositions.2.sources.0`.
  path: z.string(),
  code: z.enum(flagCodes),
  detail: z.string().optional(),
});

export type Flag = z.infer<typeof flagSchema>;

export const proposalSchema = z.object({
  client: proposedClientSchema,
  trainingSchedule: proposedTrainingScheduleSchema,
  fireSafety: proposedFireSafetySchema,
  workplaces: z.array(proposedWorkplaceSchema),
  jobPositions: z.array(proposedJobPositionSchema),
  responsiblePersons: z.array(proposedResponsiblePersonSchema),
  fireEquipment: z.array(proposedFireEquipmentSchema),
  fireInstallations: z.array(proposedFireInstallationSchema),
  protectiveEquipment: z.array(proposedProtectiveEquipmentSchema),
  employees: z.array(proposedEmployeeSchema),
  notes: z.array(z.string()),
  // Empty until the checks ran, as well as when they found nothing.
  flags: z.array(flagSchema),
});

export type Proposal = z.infer<typeof proposalSchema>;

export interface Choice<T> {
  path: string;
  options: Option<T>[];
}

export function proposalChoices(proposal: Proposal): Choice<string | number>[] {
  const groups = {
    client: proposal.client,
    trainingSchedule: proposal.trainingSchedule,
    fireSafety: proposal.fireSafety,
  } as Record<string, Record<string, Field<string | number>>>;
  return Object.entries(groups).flatMap(([group, values]) =>
    Object.entries(values)
      .filter(([, field]) => field.options.length > 1)
      .map(([name, field]) => ({ path: `${group}.${name}`, options: field.options }))
  );
}
