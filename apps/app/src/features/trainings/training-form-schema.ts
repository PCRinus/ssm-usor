import {
  supplementaryTrainingReasons,
  trainingDomains,
  trainingPhases,
  trainingSources,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import type {
  TrainingProposal,
  TrainingRequest,
  TrainingResponseTraining,
} from '@/api/generated/api';
import { todayIso } from '@/features/employees/employee-format';

const personText = (missing: string) =>
  z.string().trim().min(1, missing).max(160, 'Cel mult 160 de caractere.');
const optionalPersonText = z.string().trim().max(160, 'Cel mult 160 de caractere.');

export const trainingFormSchema = z
  .object({
    domain: z.enum(trainingDomains),
    phase: z.enum(trainingPhases),
    heldOn: z
      .string()
      .min(1, 'Alege ziua instruirii.')
      .refine((day) => day <= todayIso(), 'O instruire se înregistrează după ce a avut loc.'),
    source: z.enum(trainingSources),
    jobPositionId: z.string(),
    employeeIds: z.array(z.string()).min(1, 'Alege cel puțin un participant.'),
    durationMinutes: z
      .string()
      .trim()
      .min(1, 'Completează durata, în minute.')
      .refine(
        (value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 600,
        'Durata este un număr întreg de minute, între 1 și 600.'
      ),
    material: z
      .string()
      .trim()
      .min(1, 'Completează materialul predat.')
      .max(4000, 'Materialul are cel mult 4000 de caractere.'),
    trainerName: personText('Completează numele instructorului.'),
    trainerJobTitle: personText('Completează funcția instructorului.'),
    verifierName: optionalPersonText,
    verifierJobTitle: optionalPersonText,
    supplementaryReason: z.union([z.literal(''), z.enum(supplementaryTrainingReasons)]),
    admittedOn: z.string(),
    admittedByName: optionalPersonText,
    admittedByJobTitle: optionalPersonText,
    notes: z.string().trim().max(2000, 'Observațiile au cel mult 2000 de caractere.'),
    themesRevisionId: z.string().nullable(),
    // An account id, or empty for a slot signed on paper.
    trainerSignerId: z.string(),
    verifierSignerId: z.string(),
    admitterSignerId: z.string(),
  })
  .superRefine((values, ctx) => {
    const issue = (path: keyof typeof values, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (values.phase !== 'introductory_general' && !values.jobPositionId) {
      issue('jobPositionId', 'Alege postul: de el depind participanții și materialul propus.');
    }
    if (values.phase === 'supplementary' && !values.supplementaryReason) {
      issue('supplementaryReason', 'Alege motivul instruirii suplimentare.');
    }
    if (values.domain === 'ssm') {
      const name = values.verifierName.trim();
      const jobTitle = values.verifierJobTitle.trim();
      if (jobTitle && !name) issue('verifierName', 'Completează numele celui care verifică.');
      if (name && !jobTitle) issue('verifierJobTitle', 'Completează funcția celui care verifică.');
    }
    if (values.phase === 'workplace') {
      const filled = [
        values.admittedOn,
        values.admittedByName.trim(),
        values.admittedByJobTitle.trim(),
      ];
      if (filled.some(Boolean)) {
        if (!values.admittedOn) issue('admittedOn', 'Alege ziua admiterii la lucru.');
        if (!filled[1]) issue('admittedByName', 'Completează cine admite la lucru.');
        if (!filled[2]) issue('admittedByJobTitle', 'Completează funcția celui care admite.');
      }
    }
  });

export type TrainingFormValues = z.infer<typeof trainingFormSchema>;

export const signerFields = ['trainerSignerId', 'verifierSignerId', 'admitterSignerId'] as const;

export type SignerField = (typeof signerFields)[number];

export const emptySigners: Pick<TrainingFormValues, SignerField> = {
  trainerSignerId: '',
  verifierSignerId: '',
  admitterSignerId: '',
};

export const proposedFields = [
  'durationMinutes',
  'material',
  'trainerName',
  'trainerJobTitle',
  'verifierName',
  'verifierJobTitle',
  'admittedOn',
  'admittedByName',
  'admittedByJobTitle',
] as const satisfies readonly (keyof TrainingFormValues)[];

export type ProposedField = (typeof proposedFields)[number];

export function proposedValues(
  proposal: TrainingProposal,
  heldOn: string
): Record<ProposedField, string> {
  return {
    durationMinutes: proposal.durationMinutes === null ? '' : String(proposal.durationMinutes),
    material: proposal.material ?? '',
    trainerName: proposal.trainer?.name ?? '',
    trainerJobTitle: proposal.trainer?.jobTitle ?? '',
    verifierName: proposal.verifier?.name ?? '',
    verifierJobTitle: proposal.verifier?.jobTitle ?? '',
    admittedOn: proposal.admittedBy ? heldOn : '',
    admittedByName: proposal.admittedBy?.name ?? '',
    admittedByJobTitle: proposal.admittedBy?.jobTitle ?? '',
  };
}

export function toTrainingForm(
  training: TrainingResponseTraining,
  jobPositionId: string
): TrainingFormValues {
  const admission = training.records.find((record) => record.admission)?.admission ?? null;
  return {
    domain: training.domain,
    phase: training.phase,
    heldOn: training.heldOn,
    source: training.source,
    jobPositionId,
    employeeIds: training.records.map((record) => record.employee.id),
    durationMinutes: String(training.durationMinutes),
    material: training.material,
    trainerName: training.trainer.name,
    trainerJobTitle: training.trainer.jobTitle,
    verifierName: training.verifier?.name ?? '',
    verifierJobTitle: training.verifier?.jobTitle ?? '',
    supplementaryReason: training.supplementaryReason ?? '',
    admittedOn: admission?.admittedOn ?? '',
    admittedByName: admission?.name ?? '',
    admittedByJobTitle: admission?.jobTitle ?? '',
    notes: training.notes ?? '',
    themesRevisionId: training.themesRevisionId,
    ...emptySigners,
  };
}

export function toTrainingRequest(values: TrainingFormValues): TrainingRequest {
  const verifier =
    values.domain === 'ssm' && values.verifierName.trim()
      ? { name: values.verifierName.trim(), jobTitle: values.verifierJobTitle.trim() }
      : null;
  const admission =
    values.phase === 'workplace' && values.admittedByName.trim()
      ? {
          admittedOn: values.admittedOn,
          name: values.admittedByName.trim(),
          jobTitle: values.admittedByJobTitle.trim(),
        }
      : null;
  return {
    domain: values.domain,
    phase: values.phase,
    heldOn: values.heldOn,
    durationMinutes: Number(values.durationMinutes),
    material: values.material.trim(),
    trainer: { name: values.trainerName.trim(), jobTitle: values.trainerJobTitle.trim() },
    verifier,
    supplementaryReason:
      values.phase === 'supplementary' && values.supplementaryReason
        ? values.supplementaryReason
        : null,
    source: values.source,
    themesRevisionId: values.themesRevisionId,
    notes: values.notes.trim() || null,
    employeeIds: values.employeeIds,
    admission,
    // `signers` present asks the trainee too, whom the API finds; a training typed from paper
    // asks nobody.
    ...(values.source === 'app'
      ? {
          signers: {
            trainer: values.trainerSignerId || null,
            ...(verifier ? { verifier: values.verifierSignerId || null } : {}),
            ...(admission ? { admitter: values.admitterSignerId || null } : {}),
          },
        }
      : {}),
  };
}

export const fieldOfIssue: Partial<Record<string, keyof TrainingFormValues>> = {
  domain: 'domain',
  phase: 'phase',
  heldOn: 'heldOn',
  durationMinutes: 'durationMinutes',
  material: 'material',
  'trainer.name': 'trainerName',
  'trainer.jobTitle': 'trainerJobTitle',
  'verifier.name': 'verifierName',
  'verifier.jobTitle': 'verifierJobTitle',
  supplementaryReason: 'supplementaryReason',
  source: 'source',
  notes: 'notes',
  employeeIds: 'employeeIds',
  admission: 'admittedByName',
  'admission.admittedOn': 'admittedOn',
  'admission.name': 'admittedByName',
  'admission.jobTitle': 'admittedByJobTitle',
  'signers.trainer': 'trainerSignerId',
  'signers.verifier': 'verifierSignerId',
  'signers.admitter': 'admitterSignerId',
};
