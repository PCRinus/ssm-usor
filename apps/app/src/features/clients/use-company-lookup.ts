import { isValidCuiInput, normalizeCui } from '@ssm-usor/contracts';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import { lookupCompany } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';

import type { ClientFormValues } from './client-form-schema';

export type LookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; message: string; inactive: boolean }
  | { status: 'error'; message: string };

export function useCompanyLookup(form: UseFormReturn<ClientFormValues>) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const [lookup, setLookup] = useState<LookupState>({ status: 'idle' });

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
        inactive: company.inactive,
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

  return { lookup, lookupCui };
}
