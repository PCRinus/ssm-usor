import {
  type EmployeeAttentionFilter,
  employeeAttentionFilters,
  type EmployeeTrainingStateFilter,
  employeeTrainingStateFilters,
  maxPageSize,
  type TestStateFilter,
  testStateFilters,
  testStateLabels,
  type TrainingDomain,
  trainingDomains,
} from '@ssm-usor/contracts';
import { useQuery } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import {
  Briefcase,
  Building2,
  ClipboardCheck,
  Flame,
  HardHat,
  MapPin,
  TriangleAlert,
} from 'lucide-react';
import { z } from 'zod';

import { getListClientsQueryKey, listClients } from '@/api/generated/api';
import type { ListFilterFacet, ListFilterOption } from '@/components/list-filters/types';
import { filterSearchSchema, idFilterSearchSchema } from '@/components/list-filters/url';

export const workerFilterKeys = [
  'ssmTraining',
  'suTraining',
  'test',
  'attention',
  'jobPosition',
  'workplace',
  'client',
] as const;

export type WorkerFilterKey = (typeof workerFilterKeys)[number];

export const clientWorkerFilterKeys = [
  'ssmTraining',
  'suTraining',
  'test',
  'attention',
  'jobPosition',
  'workplace',
] as const satisfies readonly WorkerFilterKey[];

export const organizationWorkerFilterKeys = [
  'ssmTraining',
  'suTraining',
  'test',
  'attention',
  'client',
] as const satisfies readonly WorkerFilterKey[];

export const workerFilterSearch = {
  ssmTraining: filterSearchSchema(employeeTrainingStateFilters),
  suTraining: filterSearchSchema(employeeTrainingStateFilters),
  test: filterSearchSchema(testStateFilters),
  attention: filterSearchSchema(employeeAttentionFilters),
};

export const clientWorkerFilterSearch = {
  ...workerFilterSearch,
  jobPosition: idFilterSearchSchema(),
  workplace: idFilterSearchSchema(),
};

export const organizationWorkerFilterSearch = {
  ...workerFilterSearch,
  client: idFilterSearchSchema(),
};

// The single filters the lists had before, which dashboards, bookmarks and the clients list may
// still link to: a state in one domain, or in either.
export const legacyWorkerFilterSearch = {
  trainingState: z.enum(employeeTrainingStateFilters).optional().catch(undefined),
  testState: z.enum(testStateFilters).optional().catch(undefined),
  domain: z.enum(trainingDomains).optional().catch(undefined),
};

type LegacyWorkerFilters = {
  trainingState?: EmployeeTrainingStateFilter;
  testState?: TestStateFilter;
  domain?: TrainingDomain;
};

const trainingKey = { ssm: 'ssmTraining', su: 'suTraining' } as const;

export function fromLegacyWorkerFilters<Search extends LegacyWorkerFilters>({
  trainingState,
  testState,
  domain,
  ...search
}: Search) {
  const mapped: {
    ssmTraining?: EmployeeTrainingStateFilter[];
    suTraining?: EmployeeTrainingStateFilter[];
    test?: TestStateFilter[];
    attention?: EmployeeAttentionFilter[];
  } = {};
  if (trainingState && domain) mapped[trainingKey[domain]] = [trainingState];
  else if (trainingState === 'current') {
    mapped.ssmTraining = ['current'];
    mapped.suTraining = ['current'];
  } else if (trainingState === 'due') mapped.attention = ['trainingDue'];
  else if (trainingState) mapped.attention = ['toTrain'];
  if (testState) mapped.test = [testState];
  return { ...search, ...mapped, ...stripUndefined(search) };
}

function stripUndefined<Value extends object>(value: Value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, each]) => each !== undefined)
  ) as Partial<Value>;
}

const trainingOptions: ListFilterOption[] = [
  { value: 'attention', label: 'De instruit (neinstruiți sau depășiți)', short: 'De instruit' },
  { value: 'untrained', label: 'Neinstruiți' },
  { value: 'overdue', label: 'Depășită' },
  { value: 'due', label: 'Scadentă în 30 de zile' },
  { value: 'current', label: 'La zi' },
];

const trainingFacets: ListFilterFacet<WorkerFilterKey>[] = [
  {
    key: 'ssmTraining',
    label: 'Instruire SSM',
    icon: HardHat,
    column: 'left',
    options: trainingOptions,
  },
  {
    key: 'suTraining',
    label: 'Instruire SU',
    icon: Flame,
    column: 'left',
    options: trainingOptions,
  },
  {
    key: 'test',
    label: 'Testare',
    icon: ClipboardCheck,
    column: 'left',
    options: [
      { value: 'pending', label: testStateLabels.pending },
      { value: 'annual_due', label: testStateLabels.annual_due },
      { value: 'unverified', label: testStateLabels.unverified },
      { value: 'passed', label: 'La zi' },
      { value: 'none', label: testStateLabels.none },
    ],
  },
];

// The clients list's training cell links to its "de instruit" and "scadente", which count either
// domain: offered only once a link chose them.
function attentionFacet(withStates: boolean): ListFilterFacet<WorkerFilterKey> {
  return {
    key: 'attention',
    label: 'Necesită atenție',
    icon: TriangleAlert,
    column: 'right',
    options: [
      { value: 'signaturesPending', label: 'Semnături în așteptare' },
      { value: 'noPhone', label: 'Fără telefon' },
      { value: 'noEmail', label: 'Fără email' },
      ...(withStates
        ? [
            { value: 'toTrain', label: 'De instruit, SSM sau SU', onlyWhenChosen: true },
            {
              value: 'trainingDue',
              label: 'Instruire scadentă în 30 de zile, SSM sau SU',
              onlyWhenChosen: true,
            },
          ]
        : []),
    ],
  };
}

type Named = { id: string; name: string };

const namedOptions = (items: readonly Named[]) =>
  items.map((item) => ({ value: item.id, label: item.name }));

// The training and test states are those of current employees of active clients: a former
// employee and an archived client's employees have none, so their facets would match nobody.
export function clientWorkerFacets({
  withStates,
  positions,
  workplaces,
  withWorkplaces,
}: {
  withStates: boolean;
  positions: readonly Named[];
  workplaces: readonly Named[];
  withWorkplaces: boolean;
}): ListFilterFacet<WorkerFilterKey>[] {
  return [
    ...(withStates ? trainingFacets : []),
    attentionFacet(withStates),
    {
      key: 'jobPosition',
      label: 'Post de lucru',
      icon: Briefcase,
      column: 'right',
      options: namedOptions(positions),
      search: { placeholder: 'Caută postul', addLabel: 'Adaugă un post' },
    },
    ...(withWorkplaces
      ? [
          {
            key: 'workplace',
            label: 'Punct de lucru',
            icon: MapPin,
            column: 'right',
            options: namedOptions(workplaces),
          } as const,
        ]
      : []),
  ];
}

export function organizationWorkerFacets({
  withStates,
  clients,
}: {
  withStates: boolean;
  clients: readonly Named[];
}): ListFilterFacet<WorkerFilterKey>[] {
  return [
    ...(withStates ? trainingFacets : []),
    attentionFacet(withStates),
    {
      key: 'client',
      label: 'Client',
      icon: Building2,
      column: 'right',
      options: namedOptions(clients),
      search: { placeholder: 'Caută clientul', addLabel: 'Adaugă un client' },
    },
  ];
}

const clientPage = (page: number) =>
  ({ page, pageSize: maxPageSize, sort: 'legalName', order: 'asc' }) as const;

// Every active client, page after page: the search never matches a client's name, so the facet
// has to offer them all.
export function useEveryClient(userId: string | undefined) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  return useQuery({
    queryKey: [...getListClientsQueryKey(), 'every-active', userId],
    enabled: Boolean(userId && apiRequest.baseUrl),
    queryFn: async ({ signal }) => {
      const clients: Named[] = [];
      for (let page = 1; ; page += 1) {
        const response = await listClients(clientPage(page), { ...apiRequest, signal });
        clients.push(
          ...response.items.map((client) => ({ id: client.id, name: client.legalName }))
        );
        if (response.items.length === 0 || clients.length >= response.total) return clients;
      }
    },
  });
}
