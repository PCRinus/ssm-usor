import { type ResponsiblePersonRole, responsiblePersonRoles } from '@ssm-usor/contracts';
import { z } from 'zod';

import type { ResponsiblePersonListResponse, ResponsiblePersonRequest } from '../api/generated/api';

export type ResponsiblePerson = ResponsiblePersonListResponse['items'][number];

export const responsibleRoleLabels: Record<
  ResponsiblePersonRole,
  { label: string; description: string }
> = {
  workplace_manager: {
    label: 'Conducător al locului de muncă',
    description: 'Efectuează instruirea la locul de muncă și instruirea periodică.',
  },
  first_aid: {
    label: 'Prim ajutor',
    description: 'Aplică măsurile de prim ajutor.',
  },
  risk_evaluation_team: {
    label: 'Echipa de evaluare a riscurilor',
    description: 'Membru al echipei care identifică și evaluează riscurile.',
  },
  imminent_danger: {
    label: 'Pericol grav și iminent',
    description: 'Ia măsurile de securitate: oprire, evacuare, anunțare.',
  },
  workers_representative: {
    label: 'Reprezentantul lucrătorilor',
    description:
      'Ales de lucrători dintre ei. Necesar de la 10 angajați, doi de la 50. Nu poate fi reprezentantul legal.',
  },
};

export const responsibleRoleOrder = responsiblePersonRoles;

/** The roles every documentation set needs; a workers' representative depends on headcount. */
export const alwaysRequiredRoles = responsiblePersonRoles.filter(
  (role) => role !== 'workers_representative'
);

export const responsiblePersonFormSchema = z
  .object({
    // Empty when the person is not one of the client's employees.
    employeeId: z.string(),
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
    message: 'Reprezentantul lucrătorilor se alege dintre angajații clientului.',
    path: ['employeeId'],
  });

export type ResponsiblePersonFormValues = z.infer<typeof responsiblePersonFormSchema>;

export const emptyResponsiblePersonForm: ResponsiblePersonFormValues = {
  employeeId: '',
  fullName: '',
  jobTitle: '',
  roles: [],
};

export function toResponsiblePersonForm(person: ResponsiblePerson): ResponsiblePersonFormValues {
  return {
    employeeId: person.employeeId ?? '',
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
    fullName: values.fullName,
    jobTitle: values.jobTitle,
    // Always in the order the decisions list them, whatever order they were ticked in.
    roles: responsibleRoleOrder.filter((role) => values.roles.includes(role)),
  };
}
