import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';

import {
  type ApiErrorResponse,
  getListEmployeesQueryKey,
  useCreateEmployee,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
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

export function useEmployeeForm(clientId: string) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: emptyEmployeeForm,
  });
  const create = useCreateEmployee({ request: apiRequest });

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
      await create.mutateAsync({ clientId, data: toCreateEmployeeRequest(values) });
      // Every filtered variant of this client's list starts with the same key prefix.
      await queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey(clientId) });
      await navigate({ to: '/clients/$clientId/employees', params: { clientId } });
    } catch (cause) {
      if (cause instanceof ApiHttpError) {
        const body = cause.body as Partial<ApiErrorResponse> | undefined;
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

  return { form, onSubmit, prefillBirthDate, isSaving: create.isPending };
}
