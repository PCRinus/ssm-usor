import type { MissingServiceContractData, ServiceContract } from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { type DataClient, fromDatabaseError } from '../../lib/db';
import { ApiError } from '../../lib/errors';

type Tables = Database['public']['Tables'];

const clientColumns =
  'legal_name, cui, vat_payer, caen_code, trade_register_number, county_code, locality, address_line, legal_representative_name, legal_representative_role, contact_phone, archived_at';
const organizationColumns =
  'legal_name, cui, trade_register_number, county_code, locality, address_line, legal_representative_name, legal_representative_role, phone, iban, bank_name, authorization_certificate_number, authorization_certificate_date, authorization_certificate_issuer, vat_payer, fire_safety_technician_name, fire_safety_technician_certificate';
const contractColumns =
  'contract_number, contract_date, start_date, duration_months, renews_automatically, covers_occupational_safety, covers_fire_safety';

type ContractRow = Pick<
  Tables['service_contracts']['Row'],
  | 'contract_number'
  | 'contract_date'
  | 'start_date'
  | 'duration_months'
  | 'renews_automatically'
  | 'covers_occupational_safety'
  | 'covers_fire_safety'
>;

export interface ServiceContractFacts {
  client: Pick<
    Tables['clients']['Row'],
    | 'legal_name'
    | 'cui'
    | 'vat_payer'
    | 'caen_code'
    | 'trade_register_number'
    | 'county_code'
    | 'locality'
    | 'address_line'
    | 'legal_representative_name'
    | 'legal_representative_role'
    | 'contact_phone'
    | 'archived_at'
  >;
  organization: Pick<
    Tables['organizations']['Row'],
    | 'legal_name'
    | 'cui'
    | 'trade_register_number'
    | 'county_code'
    | 'locality'
    | 'address_line'
    | 'legal_representative_name'
    | 'legal_representative_role'
    | 'phone'
    | 'iban'
    | 'bank_name'
    | 'authorization_certificate_number'
    | 'authorization_certificate_date'
    | 'authorization_certificate_issuer'
    | 'vat_payer'
    | 'fire_safety_technician_name'
    | 'fire_safety_technician_certificate'
  >;
  contract: ServiceContract | null;
}

/** "12 luni începând cu 15.02.2024" ends on 14.02.2025. */
export function endDateOf(startDate: string, durationMonths: number) {
  const [year, month, day] = startDate.split('-').map(Number) as [number, number, number];
  // A start on the 31st of a month that has no such day ends with that month.
  const lastDay = new Date(Date.UTC(year, month - 1 + durationMonths + 1, 0)).getUTCDate();
  const end = new Date(Date.UTC(year, month - 1 + durationMonths, Math.min(day, lastDay)));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

export function toServiceContract(row: ContractRow): ServiceContract {
  return {
    contractNumber: row.contract_number,
    contractDate: row.contract_date,
    startDate: row.start_date,
    durationMonths: row.duration_months,
    renewsAutomatically: row.renews_automatically,
    coversOccupationalSafety: row.covers_occupational_safety,
    coversFireSafety: row.covers_fire_safety,
    endDate: endDateOf(row.start_date, row.duration_months),
  };
}

// Row-level security scopes every query to the caller's organization, and the contract to
// its owners.
export async function loadServiceContractFacts(
  db: DataClient,
  clientId: string
): Promise<ServiceContractFacts> {
  const [client, organization, contract] = await Promise.all([
    db.from('clients').select(clientColumns).eq('id', clientId).maybeSingle(),
    // A member sees exactly one organization: their own.
    db.from('organizations').select(organizationColumns).single(),
    db.from('service_contracts').select(contractColumns).eq('client_id', clientId).maybeSingle(),
  ]);
  if (client.error) throw fromDatabaseError(client.error, 'contract facts: client');
  if (!client.data) {
    throw new ApiError('not_found', 'This client does not exist in your organization.');
  }
  if (organization.error)
    throw fromDatabaseError(organization.error, 'contract facts: organization');
  if (contract.error) throw fromDatabaseError(contract.error, 'contract facts: contract');
  return {
    client: client.data,
    organization: organization.data,
    contract: contract.data ? toServiceContract(contract.data) : null,
  };
}

const hasAddress = (row: {
  county_code: string | null;
  locality: string | null;
  address_line: string | null;
}) => Boolean(row.county_code && row.locality && row.address_line);

export function missingServiceContractData({
  client,
  organization,
  contract,
}: ServiceContractFacts): MissingServiceContractData[] {
  const checks: [MissingServiceContractData, boolean][] = [
    ['provider.legalName', Boolean(organization.legal_name)],
    ['provider.cui', Boolean(organization.cui)],
    ['provider.tradeRegisterNumber', Boolean(organization.trade_register_number)],
    ['provider.address', hasAddress(organization)],
    ['provider.representativeName', Boolean(organization.legal_representative_name)],
    ['provider.representativeRole', Boolean(organization.legal_representative_role)],
    ['provider.phone', Boolean(organization.phone)],
    ['provider.bankAccount', Boolean(organization.iban && organization.bank_name)],
    [
      'provider.authorizationCertificate',
      Boolean(
        organization.authorization_certificate_number &&
        organization.authorization_certificate_date &&
        organization.authorization_certificate_issuer
      ),
    ],
    [
      'provider.fireSafetyTechnician',
      !contract?.coversFireSafety ||
        Boolean(
          organization.fire_safety_technician_name &&
          organization.fire_safety_technician_certificate
        ),
    ],
    ['client.tradeRegisterNumber', Boolean(client.trade_register_number)],
    ['client.address', hasAddress(client)],
    ['client.representativeName', Boolean(client.legal_representative_name)],
    ['client.representativeRole', Boolean(client.legal_representative_role)],
    ['contract.details', contract !== null],
  ];
  return checks.filter(([, present]) => !present).map(([name]) => name);
}
