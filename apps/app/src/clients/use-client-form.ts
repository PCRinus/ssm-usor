import { zodResolver } from '@hookform/resolvers/zod';
import { isValidCuiInput, normalizeCui } from '@ssm-usor/contracts';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  type ApiErrorResponse,
  getListClientsQueryKey,
  lookupCompany,
  useCreateClient,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import {
  clientFormSchema,
  type ClientFormValues,
  emptyClientForm,
  toCreateClientRequest,
} from './client-form-schema';

export type LookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string };

const formFields = new Set<keyof ClientFormValues>(Object.keys(emptyClientForm) as never[]);

function isFormField(path: string): path is keyof ClientFormValues {
  return formFields.has(path as keyof ClientFormValues);
}

export function useClientForm() {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: emptyClientForm,
  });
  const create = useCreateClient({ request: apiRequest });
  const [lookup, setLookup] = useState<LookupState>({ status: 'idle' });

  // Prefill from ANAF's public registry. Failure keeps manual entry available.
  async function lookupCui() {
    const input = form.getValues('cui');
    if (!isValidCuiInput(input)) {
      form.setError('cui', { message: 'Introdu un CUI valid înainte de căutare.' });
      return;
    }
    form.clearErrors('cui');
    setLookup({ status: 'loading' });
    try {
      const { company } = await lookupCompany({ cui: normalizeCui(input)!.cui }, apiRequest);
      const fill = { shouldDirty: true, shouldValidate: false };
      form.setValue('legalName', company.legalName, fill);
      form.setValue('vatPayer', company.vatPayer, fill);
      form.setValue('caenCode', company.caenCode ?? '', fill);
      form.setValue('tradeRegisterNumber', company.tradeRegisterNumber ?? '', fill);
      form.setValue('countyCode', company.countyCode ?? '', fill);
      form.setValue('locality', company.locality ?? '', fill);
      form.setValue('addressLine', company.addressLine ?? '', fill);
      form.clearErrors();
      setLookup({
        status: 'done',
        message: company.inactive
          ? `Date preluate de la ANAF pentru ${company.legalName}. Atenție: compania figurează ca inactivă.`
          : `Date preluate de la ANAF pentru ${company.legalName}. Verifică-le înainte de salvare.`,
      });
    } catch (cause) {
      setLookup({
        status: 'error',
        message:
          cause instanceof ApiHttpError && cause.status === 404
            ? 'Nu am găsit nicio companie cu acest CUI la ANAF. Completează datele manual.'
            : 'Serviciul ANAF nu este disponibil momentan. Completează datele manual.',
      });
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await create.mutateAsync({ data: toCreateClientRequest(values) });
      await queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
      await navigate({ to: '/clients' });
    } catch (cause) {
      if (cause instanceof ApiHttpError) {
        const body = cause.body as Partial<ApiErrorResponse> | undefined;
        if (cause.status === 409) {
          form.setError('cui', {
            message: 'Există deja un client cu acest CUI în organizația ta.',
          });
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
        message: 'Nu am putut salva clientul. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  return { form, onSubmit, lookup, lookupCui, isSaving: create.isPending };
}
