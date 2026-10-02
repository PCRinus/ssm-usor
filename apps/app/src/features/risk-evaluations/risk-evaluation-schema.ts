import {
  defaultExposure,
  gravityConsequence,
  isUnacceptableRiskLevel,
  maxAcceptableGlobalRiskLevel,
  type PreventionMeasureKind,
  preventionMeasureKinds,
  probabilityFrequency,
  sheetComponents,
  type WorkSystemComponent,
  workSystemComponents,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import type {
  RiskEvaluationListResponse,
  RiskEvaluationResponse,
  RiskFactorRequest,
  UpdateRiskEvaluationRequest,
} from '@/api/generated/api';

export type RiskEvaluation = RiskEvaluationResponse['evaluation'];
export type RiskFactor = RiskEvaluation['factors'][number];
export type RiskEvaluationSummary = RiskEvaluationListResponse['items'][number];

// Other pages link to this card and to these sections by hash, so renaming one breaks their
// links.
export const clientEvaluationsSection = 'client-risk-evaluations';

export const evaluationSections = {
  result: 'result',
  workSystem: 'work-system',
  factors: 'factors',
} as const;

export const componentLabels: Record<WorkSystemComponent, string> = {
  means_of_production: 'Mijloace de producție',
  work_environment: 'Mediul de muncă',
  work_task: 'Sarcina de muncă',
  executant: 'Executant',
};

export const measureKindLabels: Record<PreventionMeasureKind, string> = {
  technical: 'Tehnică',
  organizational: 'Organizatorică',
  hygienic_sanitary: 'Igienico-sanitară',
  other: 'Altă măsură',
};

export const gravityClasses = [1, 2, 3, 4, 5, 6, 7] as const;
export const probabilityClasses = [1, 2, 3, 4, 5, 6] as const;

export const gravityOptionLabel = (gravityClass: number) =>
  `${gravityClass} – ${gravityConsequence(gravityClass)}`;

export const probabilityOptionLabel = (probabilityClass: number) => {
  const { label, period } = probabilityFrequency(probabilityClass);
  return `${probabilityClass} – ${label}, ${period}`;
};

const twoDecimals = new Intl.NumberFormat('ro-RO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const upToTwoDecimals = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 });

export const formatGlobalLevel = (level: number) => twoDecimals.format(level);

export const formatShare = (share: number) => `${upToTwoDecimals.format(share)}%`;

export const acceptableLimitLabel = formatGlobalLevel(maxAcceptableGlobalRiskLevel);

/** "Un factor", "3 factori", "20 de factori". */
export function factorCountLabel(count: number) {
  if (count === 0) return 'Niciun factor';
  if (count === 1) return 'Un factor';
  const tens = count % 100;
  return tens === 0 || tens >= 20 ? `${count} de factori` : `${count} factori`;
}

/** "niciunul inacceptabil", "unul inacceptabil", "3 inacceptabili". */
export function unacceptableCountLabel(count: number) {
  if (count === 0) return 'niciunul inacceptabil';
  if (count === 1) return 'unul inacceptabil';
  const tens = count % 100;
  return tens === 0 || tens >= 20 ? `${count} de inacceptabili` : `${count} inacceptabili`;
}

export function evaluationTitle(
  evaluation: Pick<RiskEvaluationSummary, 'kind' | 'jobPosition' | 'name'>
) {
  if (evaluation.kind === 'job_position') return evaluation.jobPosition?.name ?? 'Post de lucru';
  if (evaluation.kind === 'sensitive_groups') return 'Grupuri sensibile';
  return evaluation.name ?? 'Evaluare';
}

export function evaluationStateLabel(
  summary: Pick<RiskEvaluationSummary, 'factorCount' | 'globalRiskLevel'> | null
) {
  if (!summary) return 'Neevaluat';
  if (summary.factorCount === 0 || summary.globalRiskLevel === null) return 'Fără factori';
  return `${factorCountLabel(summary.factorCount).toLowerCase().replace(/^un /, '1 ')} · ${formatGlobalLevel(summary.globalRiskLevel)}`;
}

export interface FactorGroup {
  name: string;
  factors: RiskFactor[];
}

export interface ComponentSection {
  component: WorkSystemComponent;
  groups: FactorGroup[];
  count: number;
}

// Factors keep the evaluation's own order inside a group, and a group comes where its first
// factor does; only the components are put in the sheet's order.
export function sectionsOf(factors: readonly RiskFactor[]): ComponentSection[] {
  return sheetComponents.flatMap((component) => {
    const groups: FactorGroup[] = [];
    for (const factor of factors) {
      if (factor.component !== component) continue;
      const group = groups.find((candidate) => candidate.name === factor.group);
      if (group) group.factors.push(factor);
      else groups.push({ name: factor.group, factors: [factor] });
    }
    const count = groups.reduce((sum, group) => sum + group.factors.length, 0);
    return count > 0 ? [{ component, groups, count }] : [];
  });
}

// What generating will ask of the factor (ADR 015, readiness).
export function factorGap(factor: RiskFactor): string | null {
  if (isUnacceptableRiskLevel(factor.riskLevel) && factor.measures.length === 0) {
    return 'Un factor inacceptabil are nevoie de cel puțin o măsură de prevenire.';
  }
  if (factor.measures.length > 0 && (!factor.deadline || !factor.responsiblePerson)) {
    return !factor.deadline && !factor.responsiblePerson
      ? 'Lipsesc termenul și responsabilul măsurilor.'
      : !factor.deadline
        ? 'Lipsește termenul măsurilor.'
        : 'Lipsește responsabilul măsurilor.';
  }
  return null;
}

const optionalText = (max: number, what: string) =>
  z.string().trim().max(max, `${what} are cel mult ${max} de caractere.`);

const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

export const factorFormSchema = z.object({
  component: z.enum(workSystemComponents),
  group: z
    .string()
    .trim()
    .min(1, 'Alege sau scrie grupa factorului.')
    .max(200, 'Grupa are cel mult 200 de caractere.'),
  description: z
    .string()
    .trim()
    .min(1, 'Descrie forma concretă a factorului.')
    .max(1000, 'Descrierea are cel mult 1000 de caractere.'),
  gravityClass: z.string().regex(/^[1-7]$/, 'Alege clasa de gravitate.'),
  probabilityClass: z.string().regex(/^[1-6]$/, 'Alege clasa de probabilitate.'),
  measures: z
    .array(
      z.object({
        kind: z.enum(preventionMeasureKinds),
        description: z
          .string()
          .trim()
          .min(1, 'Scrie măsura sau scoate rândul.')
          .max(2000, 'O măsură are cel mult 2000 de caractere.'),
      })
    )
    .max(30, 'Un factor are cel mult 30 de măsuri.'),
  actions: optionalText(2000, 'Acțiunile'),
  deadline: optionalText(200, 'Termenul'),
  responsiblePerson: optionalText(200, 'Responsabilul'),
  observations: optionalText(1000, 'Observațiile'),
});

export type FactorFormValues = z.infer<typeof factorFormSchema>;

export function emptyFactorForm(after?: RiskFactor): FactorFormValues {
  return {
    component: after?.component ?? 'means_of_production',
    group: after?.group ?? '',
    description: '',
    gravityClass: '',
    probabilityClass: '',
    measures: [],
    actions: '',
    deadline: '',
    responsiblePerson: '',
    observations: '',
  };
}

export function toFactorForm(factor: RiskFactor): FactorFormValues {
  return {
    component: factor.component,
    group: factor.group,
    description: factor.description,
    gravityClass: String(factor.gravityClass),
    probabilityClass: String(factor.probabilityClass),
    measures: factor.measures.map(({ kind, description }) => ({ kind, description })),
    actions: factor.actions ?? '',
    deadline: factor.deadline ?? '',
    responsiblePerson: factor.responsiblePerson ?? '',
    observations: factor.observations ?? '',
  };
}

export function toFactorRequest(values: FactorFormValues): RiskFactorRequest {
  return {
    component: values.component,
    group: values.group,
    description: values.description,
    gravityClass: Number(values.gravityClass),
    probabilityClass: Number(values.probabilityClass),
    measures: values.measures,
    actions: orNull(values.actions),
    deadline: orNull(values.deadline),
    responsiblePerson: orNull(values.responsiblePerson),
    observations: orNull(values.observations),
  };
}

export const workSystemFormSchema = z.object({
  name: z.string().trim().max(160, 'Denumirea are cel mult 160 de caractere.'),
  workTask: optionalText(2000, 'Sarcina de muncă'),
  exposedPersons: optionalText(120, 'Persoanele expuse'),
  meansOfProduction: optionalText(2000, 'Mijloacele de producție'),
  workEnvironment: optionalText(2000, 'Mediul de muncă'),
  exposure: z
    .string()
    .trim()
    .min(1, `Spune cât durează expunerea, de obicei „${defaultExposure}”.`)
    .max(120, 'Expunerea are cel mult 120 de caractere.'),
});

export type WorkSystemFormValues = z.infer<typeof workSystemFormSchema>;

export function toWorkSystemForm(evaluation: RiskEvaluation): WorkSystemFormValues {
  return {
    name: evaluation.name ?? '',
    workTask: evaluation.workTask ?? '',
    exposedPersons: evaluation.exposedPersons ?? '',
    meansOfProduction: evaluation.meansOfProduction ?? '',
    workEnvironment: evaluation.workEnvironment ?? '',
    exposure: evaluation.exposure,
  };
}

export function toWorkSystemRequest(
  kind: RiskEvaluation['kind'],
  values: WorkSystemFormValues
): UpdateRiskEvaluationRequest {
  const common = {
    meansOfProduction: orNull(values.meansOfProduction),
    workEnvironment: orNull(values.workEnvironment),
    exposure: values.exposure.trim(),
  };
  if (kind === 'job_position') return common;
  const clientLevel = {
    ...common,
    workTask: orNull(values.workTask),
    exposedPersons: orNull(values.exposedPersons),
  };
  return kind === 'other' ? { ...clientLevel, name: values.name.trim() } : clientLevel;
}

export const evaluationNameSchema = z
  .string()
  .trim()
  .min(2, 'Denumirea are cel puțin 2 caractere.')
  .max(160, 'Denumirea are cel mult 160 de caractere.');
