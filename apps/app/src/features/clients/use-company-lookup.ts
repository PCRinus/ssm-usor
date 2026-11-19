import { isValidCuiInput, normalizeCui } from '@ssm-usor/contracts';
import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import { type CompanyLookupResponse, lookupCompany } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';

import type { ClientFormValues } from './client-form-schema';

export type LookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; message: string; inactive: boolean }
  | { status: 'error'; message: string };

export type AnafCompany = CompanyLookupResponse['company'];

type CompanyFields = {
  cui: string;
  legalName: string;
  vatPayer: boolean;
  tradeRegisterNumber: string;
  countyCode: string;
  locality: string;
  addressLine: string;
};

export const anafFill = { shouldDirty: true, shouldValidate: false } as const;

export function useCompanyLookup<V extends CompanyFields>(
  form: UseFormReturn<V>,
  fillRest: (company: AnafCompany) => void
) {
  const { request } = useApi();
  const [lookup, setLookup] = useState<LookupState>({ status: 'idle' });
  // A generic form's paths do not resolve to these names, though every caller has them.
  const company = form as unknown as UseFormReturn<CompanyFields>;

  async function lookupCui() {
    const input = company.getValues('cui');
    if (!isValidCuiInput(input)) {
      company.setError('cui', { message: 'Introdu un CUI valid înainte de căutare.' });
      return;
    }
    company.clearErrors('cui');
    setLookup({ status: 'loading' });
    try {
      const found = (await lookupCompany({ cui: normalizeCui(input)!.cui }, request)).company;
      company.setValue('legalName', found.legalName, anafFill);
      company.setValue('vatPayer', found.vatPayer, anafFill);
      company.setValue('tradeRegisterNumber', found.tradeRegisterNumber ?? '', anafFill);
      company.setValue('countyCode', found.countyCode ?? '', anafFill);
      company.setValue('locality', found.locality ?? '', anafFill);
      company.setValue('addressLine', found.addressLine ?? '', anafFill);
      fillRest(found);
      setLookup({
        status: 'done',
        inactive: found.inactive,
        message: found.inactive
          ? `Date preluate de la ANAF pentru ${found.legalName}. Atenție: compania figurează ca inactivă.`
          : `Date preluate de la ANAF pentru ${found.legalName}. Verifică-le înainte de salvare.`,
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

export function useClientCompanyLookup(form: UseFormReturn<ClientFormValues>) {
  return useCompanyLookup(form, (company) => {
    form.setValue('caenCode', company.caenCode ?? '', anafFill);
    form.clearErrors();
  });
}
