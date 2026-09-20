import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';

import {
  type ApiErrorResponse,
  getGetEmployeeQueryKey,
  getListEmployeesQueryKey,
  getListJobPositionsQueryKey,
  useCreateEmployee,
  useUpdateEmployee,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import {
  birthDateFromCnp,
  type Employee,
  employeeFormSchema,
  type EmployeeFormValues,
  emptyEmployeeForm,
  toCreateEmployeeRequest,
  toEmployeeForm,
} from './employee-form-schema';

const formFields = new Set<keyof EmployeeFormValues>(Object.keys(emptyEmployeeForm) as never[]);

function isFormField(path: string): path is keyof EmployeeFormValues {
  return formFields.has(path as keyof EmployeeFormValues);
}

// With an employee, the form corrects what was entered about them; without, it adds one.
export function useEmployeeForm(clientId: string, employee?: Employee) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: employee ? toEmployeeForm(employee) : emptyEmployeeForm,
  });
  const create = useCreateEmployee({ request: apiRequest });
  const update = useUpdateEmployee({ request: apiRequest });

  // The contract title follows the position until the person types one of their own: it is
  // filled while it is empty or still reads what the last choice put there. A saved title
  // that reads the same as the employee's post counts as such a choice.
  const filledTitle = useRef(employee?.jobPosition.name ?? '');
  function choosePosition(value: string, name: string) {
    form.setValue('jobPosition', value, { shouldDirty: true, shouldValidate: true });
    const current = form.getValues('jobTitle').trim();
    if (current === '' || current === filledTitle.current) {
      filledTitle.current = name;
      form.setValue('jobTitle', name, { shouldDirty: true, shouldValidate: Boolean(name) });
    }
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
      const data = toCreateEmployeeRequest(values);
      if (employee) {
        await update.mutateAsync({ clientId, employeeId: employee.id, data });
        await queryClient.invalidateQueries({
          queryKey: getGetEmployeeQueryKey(clientId, employee.id),
        });
      } else {
        await create.mutateAsync({ clientId, data });
      }
      // Every filtered variant of this client's list starts with the same key prefix.
      await queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey(clientId) });
      // The position just gained a person, whether it was new or not.
      await queryClient.invalidateQueries({ queryKey: getListJobPositionsQueryKey(clientId) });
      if (employee) {
        toast.success('Datele angajatului au fost salvate.');
        await navigate({
          to: '/clients/$clientId/employees/$employeeId',
          params: { clientId, employeeId: employee.id },
        });
      } else {
        // The list it returns to is sorted and paged, so the new row may not be in sight.
        toast.success(`${values.lastName} ${values.firstName} a fost adăugat.`);
        await navigate({ to: '/clients/$clientId/employees', params: { clientId } });
      }
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
              message: employee
                ? 'Datele intră în conflict cu alt angajat al clientului.'
                : 'Clientul este arhivat; nu mai pot fi adăugați angajați.',
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
            message: employee
              ? 'Angajatul nu mai există la acest client.'
              : 'Clientul nu mai există în organizația ta.',
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
    isSaving: create.isPending || update.isPending,
  };
}
