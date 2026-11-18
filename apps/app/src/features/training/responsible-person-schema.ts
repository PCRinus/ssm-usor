import {
  requiredWorkersRepresentatives,
  type ResponsiblePersonRole,
  responsiblePersonRoleLabels,
  responsiblePersonRoles,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import type {
  ClientParticipantsResponse,
  ResponsiblePersonListResponse,
  ResponsiblePersonRequest,
} from '@/api/generated/api';

export type ResponsiblePerson = ResponsiblePersonListResponse['items'][number];

export const responsibleRoleLabels: Record<
  ResponsiblePersonRole,
  { label: string; description: string }
> = {
  workplace_manager: {
    label: responsiblePersonRoleLabels.workplace_manager,
    description: 'Efectuează instruirea la locul de muncă și instruirea periodică.',
  },
  first_aid: {
    label: responsiblePersonRoleLabels.first_aid,
    description: 'Aplică măsurile de prim ajutor.',
  },
  risk_evaluation_team: {
    label: responsiblePersonRoleLabels.risk_evaluation_team,
    description: 'Membru al echipei care identifică și evaluează riscurile.',
  },
  imminent_danger: {
    label: responsiblePersonRoleLabels.imminent_danger,
    description: 'Ia măsurile de securitate: oprire, evacuare, anunțare.',
  },
  workers_representative: {
    label: responsiblePersonRoleLabels.workers_representative,
    description:
      'Ales de lucrători dintre ei. Necesar de la 10 lucrători, doi de la 50. Nu poate fi reprezentantul legal.',
  },
  fire_safety_coordinator: {
    label: responsiblePersonRoleLabels.fire_safety_coordinator,
    description:
      'Răspunde de organizarea apărării împotriva incendiilor și de lucrul cu foc deschis.',
  },
  fire_intervention_leader: {
    label: responsiblePersonRoleLabels.fire_intervention_leader,
    description: 'Conduce prima intervenție în caz de incendiu, până la sosirea pompierilor.',
  },
};

export const responsibleRoleOrder = responsiblePersonRoles;

export interface MissingRole {
  role: ResponsiblePersonRole;
  label: string;
}

/**
 * The roles generating the two sets asks a name for: every one but the workers' representative,
 * who depends on the client's current workers (ADR 010).
 */
export function missingRoles(
  persons: readonly ResponsiblePerson[],
  currentEmployeeCount: number
): MissingRole[] {
  const held = new Set(persons.flatMap((person) => person.roles));
  const representatives = persons.filter((person) =>
    person.roles.includes('workers_representative')
  ).length;
  const needed = requiredWorkersRepresentatives(currentEmployeeCount);
  return responsibleRoleOrder.flatMap((role): MissingRole[] => {
    const label = responsibleRoleLabels[role].label;
    if (role !== 'workers_representative') return held.has(role) ? [] : [{ role, label }];
    if (representatives >= needed) return [];
    return [{ role, label: representatives === 0 ? label : `${label} (al doilea)` }];
  });
}

export function personStanding(
  person: ResponsiblePerson,
  portal: ClientParticipantsResponse | undefined
) {
  if (!person.employeeId) return 'Nu e în lista lucrătorilor';
  if (!portal) return 'Lucrător';
  const { employeeId } = person;
  if (portal.participants.some((participant) => participant.employeeId === employeeId)) {
    return 'Lucrător · acces la portal';
  }
  return portal.invitations.some(
    (invitation) => invitation.employeeId === employeeId && invitation.status === 'open'
  )
    ? 'Lucrător · invitație în portal trimisă'
    : 'Lucrător · fără acces la portal';
}

export const responsiblePersonFormSchema = z
  .object({
    // Empty when the person is not one of the client's employees.
    employeeId: z.string(),
    // Empty for every workplace of the client.
    workplaceId: z.string(),
    fullName: z
      .string()
      .trim()
      .min(2, 'Introdu numele și prenumele.')
      .max(160, 'Numele are cel mult 160 de caractere.'),
    jobTitle: z
      .string()
      .trim()
      .min(2, 'Introdu funcția (cel puțin 2 caractere).')
      .max(160, 'Funcția are cel mult 160 de caractere.'),
    roles: z.array(z.enum(responsiblePersonRoles)).min(1, 'Alege cel puțin o responsabilitate.'),
  })
  .refine((person) => !person.roles.includes('workers_representative') || person.employeeId, {
    message: 'Reprezentantul lucrătorilor se alege dintre lucrătorii clientului.',
    path: ['employeeId'],
  });

export type ResponsiblePersonFormValues = z.infer<typeof responsiblePersonFormSchema>;

export const emptyResponsiblePersonForm: ResponsiblePersonFormValues = {
  employeeId: '',
  workplaceId: '',
  fullName: '',
  jobTitle: '',
  roles: [],
};

export function toResponsiblePersonForm(person: ResponsiblePerson): ResponsiblePersonFormValues {
  return {
    employeeId: person.employeeId ?? '',
    workplaceId: person.workplaceId ?? '',
    fullName: person.fullName,
    jobTitle: person.jobTitle,
    roles: person.roles,
  };
}

export function toResponsiblePersonRequest(
  values: ResponsiblePersonFormValues
): ResponsiblePersonRequest {
  return {
    employeeId: values.employeeId || null,
    workplaceId: values.workplaceId || null,
    fullName: values.fullName,
    jobTitle: values.jobTitle,
    // Always in the order the decisions list them, whatever order they were ticked in.
    roles: responsibleRoleOrder.filter((role) => values.roles.includes(role)),
  };
}
