import {
  countOf,
  sortOrderSchema,
  trainingPhaseLabels,
  trainingPhases,
  trainingSignatureStates,
  trainingSortKeys,
  trainingSources,
} from '@ssm-usor/contracts';
import { CalendarRange, ClipboardList, NotebookPen, Signature } from 'lucide-react';
import { z } from 'zod';

import type { ListFilterFacet, ListFilterOption } from '@/components/list-filters/types';
import { filterSearchSchema, periodSearchSchema } from '@/components/list-filters/url';
import { listPageSearchSchema } from '@/components/list-filters/use-list-search';

export const trainingFilterKeys = ['phase', 'signatures', 'mode', 'period'] as const;
export type TrainingFilterKey = (typeof trainingFilterKeys)[number];

export const ownTrainingFilterKeys = ['period', 'mode', 'phase', 'signature'] as const;
export type OwnTrainingFilterKey = (typeof ownTrainingFilterKeys)[number];

const filterSearch = {
  phase: filterSearchSchema(trainingPhases),
  mode: filterSearchSchema(trainingSources),
  from: periodSearchSchema,
  to: periodSearchSchema,
};

// The table state lives in the address, as on every list, so that refresh and back keep the
// place. Defaults are left out to keep links short.
export const clientTrainingsSearchSchema = listPageSearchSchema(trainingSortKeys).extend({
  domain: z.enum(['ssm', 'su']).optional().catch(undefined),
  signatures: filterSearchSchema(trainingSignatureStates),
  open: z.uuid().optional().catch(undefined),
  ...filterSearch,
});

export const ownTrainingsSearchSchema = z.object({
  sort: z.enum(['heldOn', 'duration']).optional().catch(undefined),
  order: sortOrderSchema.optional().catch(undefined),
  signature: filterSearchSchema(trainingSignatureStates),
  ...filterSearch,
});

const phaseFacet = {
  key: 'phase',
  label: 'Tipul instruirii',
  icon: ClipboardList,
  options: trainingPhases.map((phase) => ({ value: phase, label: trainingPhaseLabels[phase] })),
} as const;

const periodFacet = {
  key: 'period',
  label: 'Perioada',
  icon: CalendarRange,
  options: [],
  period: true,
} as const;

const modeFacet = {
  key: 'mode',
  label: 'Mod de înregistrare',
  icon: NotebookPen,
  options: [
    { value: 'app', label: 'Ținute în aplicație' },
    { value: 'paper', label: 'Transcrise de pe fișă' },
  ],
} as const;

const signatureOptions = (labels: readonly [string, string, string]): ListFilterOption[] =>
  trainingSignatureStates.map((value, index) => ({ value, label: labels[index]! }));

export const clientTrainingFacets: ListFilterFacet<TrainingFilterKey>[] = [
  { ...phaseFacet, column: 'left' },
  {
    key: 'signatures',
    label: 'Semnături',
    icon: Signature,
    column: 'left',
    options: signatureOptions(['De semnat', 'Semnate în aplicație', 'Semnate de mână']),
  },
  { ...periodFacet, column: 'right' },
  { ...modeFacet, column: 'right' },
];

export const ownTrainingFacets: ListFilterFacet<OwnTrainingFilterKey>[] = [
  { ...periodFacet, column: 'left' },
  { ...modeFacet, column: 'left' },
  { ...phaseFacet, column: 'right' },
  {
    key: 'signature',
    label: 'Semnătura',
    icon: Signature,
    column: 'right',
    options: signatureOptions(['De semnat', 'Semnată în aplicație', 'Semnată de mână']),
  },
];

export const trainingNoun = (count: number) => countOf(count, 'instruire', 'instruiri');
