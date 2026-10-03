import { type CountyCode, countyNames } from '@ssm-usor/contracts';

const namesTheCapital = (locality: string) =>
  locality.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().includes('bucuresti');

// The capital is its own county, printed without "județul", and its localities in the app
// are the sectors ("Sectorul 3"), so the city goes in front unless the locality names it.
export function printedAddress({
  countyCode,
  locality,
  addressLine,
}: {
  countyCode: string | null;
  locality: string | null;
  addressLine: string | null;
}) {
  const county = countyCode ? countyNames[countyCode as CountyCode] : undefined;
  const place =
    countyCode === 'B'
      ? [locality && namesTheCapital(locality) ? null : 'București', locality]
      : [locality, county && `județul ${county}`];
  return [...place, addressLine].filter(Boolean).join(', ');
}
