import { caenClassName, formatCui, formatIban, type ServiceContract } from '@ssm-usor/contracts';

import { printedAddress } from '../../lib/address';
import { countOf } from '../../lib/romanian';
import { printedDate } from '../documents/context';
import type { ServiceContractFacts } from './facts';

// What the starter template of the service contract is merged with. The readiness check
// guarantees the values; a name left without one makes the engine refuse, never print a gap.

export function monthsText(months: number) {
  return months === 1 ? 'o lună' : countOf(months, 'lună', 'luni');
}

const address = (row: {
  county_code: string | null;
  locality: string | null;
  address_line: string | null;
}) =>
  printedAddress({
    countyCode: row.county_code,
    locality: row.locality,
    addressLine: row.address_line,
  });

export function buildServiceContractContext({
  client,
  organization,
  contract,
}: ServiceContractFacts & { contract: ServiceContract }) {
  const activity = client.caen_code ? caenClassName(client.caen_code) : null;
  return {
    // Every plan carries the line for now; the switch arrives with billing (docs/document-branding.md).
    branding: true,
    provider: {
      legalName: organization.legal_name,
      address: address(organization),
      phone: organization.phone,
      tradeRegisterNumber: organization.trade_register_number,
      cui: organization.cui ? formatCui(organization.cui, organization.vat_payer) : null,
      iban: organization.iban ? formatIban(organization.iban) : null,
      bankName: organization.bank_name,
      representativeName: organization.legal_representative_name,
      representativeRole: organization.legal_representative_role,
      vatPayer: organization.vat_payer,
      notVatPayer: !organization.vat_payer,
      authorization: {
        number: organization.authorization_certificate_number,
        date: organization.authorization_certificate_date
          ? printedDate(organization.authorization_certificate_date)
          : null,
        issuer: organization.authorization_certificate_issuer,
      },
      fireSafetyTechnician: {
        name: organization.fire_safety_technician_name,
        certificate: organization.fire_safety_technician_certificate,
      },
    },
    client: {
      legalName: client.legal_name,
      address: address(client),
      // Optional, unlike the rest: the sentence leaves it out.
      phone: client.contact_phone,
      tradeRegisterNumber: client.trade_register_number,
      cui: formatCui(client.cui, client.vat_payer),
      activity: client.caen_code
        ? activity
          ? `${client.caen_code} – ${activity}`
          : client.caen_code
        : null,
      representativeName: client.legal_representative_name,
      representativeRole: client.legal_representative_role,
    },
    contract: {
      number: contract.contractNumber,
      date: printedDate(contract.contractDate),
      startDate: printedDate(contract.startDate),
      durationText: monthsText(contract.durationMonths),
      renewsAutomatically: contract.renewsAutomatically,
      endsWithoutRenewal: !contract.renewsAutomatically,
      coversOccupationalSafety: contract.coversOccupationalSafety,
      coversFireSafety: contract.coversFireSafety,
    },
  };
}
