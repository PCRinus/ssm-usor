import { type CompanyLookup, countyCodeSchema } from '@ssm-usor/contracts';
import { z } from 'zod';

import { ApiError } from './errors';

// ANAF's public VAT registry lookup. Unauthenticated, no CORS, about one request per second.
export const anafLookupUrl = 'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva';

const text = z.string().catch('');

const anafResponseSchema = z.object({
  found: z.array(
    z.object({
      date_generale: z.object({
        cui: z.coerce.string(),
        denumire: text,
        nrRegCom: text,
        cod_CAEN: text,
        stare_inregistrare: text,
      }),
      inregistrare_scop_Tva: z
        .object({ scpTVA: z.boolean().catch(false) })
        .catch({ scpTVA: false }),
      stare_inactiv: z
        .object({ statusInactivi: z.boolean().catch(false) })
        .catch({ statusInactivi: false }),
      adresa_sediu_social: z
        .object({
          sdenumire_Localitate: text,
          sdenumire_Strada: text,
          snumar_Strada: text,
          sdetalii_Adresa: text,
          scod_JudetAuto: text,
        })
        .partial()
        .catch({}),
    })
  ),
  notFound: z.array(z.unknown()).catch([]),
});

// ANAF data uses cedilla forms of ș/ț; the product uses the comma-below standard.
export function normalizeDiacritics(value: string) {
  return value.replace(/ş/g, 'ș').replace(/Ş/g, 'Ș').replace(/ţ/g, 'ț').replace(/Ţ/g, 'Ț');
}

const clean = (value: string | undefined) => {
  const normalized = normalizeDiacritics((value ?? '').trim());
  return normalized ? normalized : null;
};

export function mapAnafCompany(
  entry: z.infer<typeof anafResponseSchema>['found'][number]
): CompanyLookup {
  const general = entry.date_generale;
  const office = entry.adresa_sediu_social;
  const caen = general.cod_CAEN.trim();
  const county = countyCodeSchema.safeParse(office.scod_JudetAuto?.trim().toUpperCase());
  const street = clean(office.sdenumire_Strada);
  const number = clean(office.snumar_Strada);
  const details = clean(office.sdetalii_Adresa);
  const addressLine = [street, number ? `nr. ${number}` : null, details].filter(Boolean).join(', ');
  return {
    cui: general.cui,
    legalName: normalizeDiacritics(general.denumire.trim()),
    vatPayer: entry.inregistrare_scop_Tva.scpTVA,
    caenCode: /^[0-9]{1,4}$/.test(caen) ? caen.padStart(4, '0') : null,
    tradeRegisterNumber: clean(general.nrRegCom),
    countyCode: county.success ? county.data : null,
    locality: clean(office.sdenumire_Localitate),
    addressLine: addressLine || null,
    registrationStatus: clean(general.stare_inregistrare),
    inactive: entry.stare_inactiv.statusInactivi,
  };
}

const unavailable = () =>
  new ApiError('service_unavailable', 'Company lookup is temporarily unavailable.');

// Returns null when ANAF has no record for the CUI.
export async function lookupCompany(
  cui: string,
  fetchImpl: typeof fetch,
  today = new Date()
): Promise<CompanyLookup | null> {
  let response: Response;
  try {
    response = await fetchImpl(anafLookupUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify([{ cui: Number(cui), data: today.toISOString().slice(0, 10) }]),
    });
  } catch {
    throw unavailable();
  }
  if (!response.ok) throw unavailable();
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw unavailable();
  }
  const parsed = anafResponseSchema.safeParse(payload);
  if (!parsed.success) throw unavailable();
  const entry = parsed.data.found.find((item) => item.date_generale.cui === cui);
  return entry ? mapAnafCompany(entry) : null;
}
