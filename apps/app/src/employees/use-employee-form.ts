import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';

import {
  type ApiErrorResponse,
  getListEmployeesQueryKey,
  getListJobPositionsQueryKey,
  useCreateEmployee,
  useCreateJobPosition,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { useJobPositionOptions } from '../job-positions/use-job-position-options';
import {
  birthDateFromCnp,
  employeeFormSchema,
  type EmployeeFormValues,
  emptyEmployeeForm,
  toCreateEmployeeRequest,
} from './employee-form-schema';

const formFields = new Set<keyof EmployeeFormValues>(Object.keys(emptyEmployeeForm) as never[]);

function isFormField(path: string): path is keyof EmployeeFormValues {
  return formFields.has(path as keyof EmployeeFormValues);
}

export function useEmployeeForm(clientId: string, userId: string) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: emptyEmployeeForm,
  });
  const create = useCreateEmployee({ request: apiRequest });
  const createPosition = useCreateJobPosition({ request: apiRequest });
  const positions = useJobPositionOptions(clientId, userId);

  // The contract title follows the position until the person types one of their own: it is
  // filled while it is empty or still reads what the last choice put there.
  const filledTitle = useRef('');
  function choosePosition(value: string, name: string) {
    form.setValue('jobPosition', value, { shouldDirty: true, shouldValidate: true });
    const current = form.getValues('jobTitle').trim();
    if (current === '' || current === filledTitle.current) {
      filledTitle.current = name;
      form.setValue('jobTitle', name, { shouldDirty: true, shouldValidate: Boolean(name) });
    }
  }

  // The field holds the id of a position or the name of one the client lacks; that one is
  // created first, in the execution category, to be described later in its own section.
  async function positionIdFor(value: string) {
    const known = positions.data?.items.find((position) => position.id === value);
    if (known) return known.id;
    const { jobPosition } = await createPosition.mutateAsync({ clientId, data: { name: value } });
    await queryClient.invalidateQueries({ queryKey: getListJobPositionsQueryKey(clientId) });
    // Kept, so that a failure further down does not create it twice.
    form.setValue('jobPosition', jobPosition.id);
    return jobPosition.id;
  }

  // A valid CNP fills the birth date when it is still empty; the person can change it,
  // and validation reports a mismatch.
  function prefillBirthDate() {
    const encoded = birthDateFromCnp(form.getValues('cnp'));
    if (encoded && !form.getValues('birthDate')) {
      form.setValue('birthDate', encoded, { shouldDirty: true, shouldValidate: false });
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const jobPositionId = await positionIdFor(values.jobPosition);
      await create.mutateAsync({ clientId, data: toCreateEmployeeRequest(values, jobPositionId) });
      // Every filtered variant of this client's list starts with the same key prefix.
      await queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey(clientId) });
      // The position just gained a person, whether it was new or not.
      await queryClient.invalidateQueries({ queryKey: getListJobPositionsQueryKey(clientId) });
      await navigate({ to: '/clients/$clientId/employees', params: { clientId } });
    } catch (cause) {
      if (cause instanceof ApiHttpError) {
        const body = cause.body as Partial<ApiErrorResponse> | undefined;
        if (body?.reason === 'job_position_name_taken') {
          form.setError('jobPosition', {
            message: 'Postul există deja. Reîncarcă pagina și alege-l din listă.',
          });
          return;
        }
        if (cause.status === 409) {
          const message = body?.message ?? '';
          if (message.includes('CNP')) {
            form.setError('cnp', { message: 'Există deja un angajat cu acest CNP la client.' });
          } else if (message.includes('number')) {
            form.setError('employeeNumber', {
              message: 'Există deja un angajat cu această marcă la client.',
            });
          } else {
            form.setError('root.server', {
              message: 'Clientul este arhivat; nu mai pot fi adăugați angajați.',
            });
          }
          return;
        }
        if (cause.status === 400 && body?.issues?.length) {
          let mapped = false;
          for (const issue of body.issues) {
            if (isFormField(issue.path)) {
              form.setError(issue.path, { message: issue.message });
              mapped = true;
            }
          }
          if (mapped) return;
        }
        if (cause.status === 404) {
          form.setError('root.server', {
            message: 'Clientul nu mai există în organizația ta.',
          });
          return;
        }
        if (cause.status === 401) {
          form.setError('root.server', {
            message: 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.',
          });
          return;
        }
        if (cause.status === 403) {
          form.setError('root.server', {
            message: 'Contul tău nu face parte dintr-o organizație. Contactează administratorul.',
          });
          return;
        }
      }
      form.setError('root.server', {
        message: 'Nu am putut salva angajatul. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  return {
    form,
    onSubmit,
    prefillBirthDate,
    choosePosition,
    isSaving: create.isPending || createPosition.isPending,
  };
}
