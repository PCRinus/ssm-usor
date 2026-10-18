import texts from '../tools/import/signing.ro.json' with { type: 'json' };

export const signingTypeKeys = {
  regulationAnnex: 'signing_regulation_annex',
  agreement: 'signing_agreement',
} as const;

/** The names the occupational safety set's context already has; the annex asks for no other. */
export type SigningRegulationAnnexData = {
  branding: boolean;
  issueDate: string;
  client: { legalName: string; representativeName: string; representativeRole: string };
  provider: { legalName: string };
  specialist: { name: string; professionalTitle: string };
};

export function signingRegulationAnnexData(
  context: SigningRegulationAnnexData
): SigningRegulationAnnexData {
  const { branding, issueDate, client, provider, specialist } = context;
  return {
    branding,
    issueDate,
    client: {
      legalName: client.legalName,
      representativeName: client.representativeName,
      representativeRole: client.representativeRole,
    },
    provider: { legalName: provider.legalName },
    specialist: { name: specialist.name, professionalTitle: specialist.professionalTitle },
  };
}

export type SigningCodeChannel = 'email' | 'sms';

export type SigningAgreementFacts = {
  branding: boolean;
  client: {
    legalName: string;
    cui: string;
    address: string;
    representativeName: string;
    representativeRole: string;
  };
  provider: { legalName: string };
  employee: {
    lastName: string;
    firstName: string;
    employeeNumber: string | null;
    contractTitle: string;
    contractNumber: string | null;
    /** ISO dates, as the database keeps them. */
    hiredAt: string;
    birthDate: string | null;
    birthPlace: string | null;
    homeAddress: string | null;
  };
  channel: SigningCodeChannel;
};

export type SigningAgreementData = {
  branding: boolean;
  client: SigningAgreementFacts['client'];
  provider: { legalName: string };
  employee: {
    /** "POPESCU Ion", as on the individual training sheets. */
    name: string;
    position: string;
    /** Empty when the app holds none of it. Never the CNP: the app shows it masked only. */
    identification: string;
    hiredOn: string;
    /** Null rather than empty, so that a section of the template can switch on it. */
    contractNumber: string | null;
  };
  codeChannel: string;
};

const codeChannels: Record<SigningCodeChannel, string> = {
  email: 'adresa de e-mail comunicată angajatorului',
  sms: 'numărul de telefon mobil comunicat angajatorului',
};

const text = (value: string | null | undefined) => value?.trim() ?? '';

const printedDate = (isoDate: string) => {
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
};

/**
 * The agreement names the client's representative in its parties, as the merge data's
 * `client.representativeName` and `client.representativeRole` (the readiness codes of the same
 * name), and is not drawn up without them.
 */
export class SigningAgreementDataError extends Error {
  constructor(readonly missing: ('client.representativeName' | 'client.representativeRole')[]) {
    super(`The signing agreement lacks ${missing.join(', ')}.`);
    this.name = 'SigningAgreementDataError';
  }
}

export function buildSigningAgreementData(facts: SigningAgreementFacts): SigningAgreementData {
  const { client, employee } = facts;
  const missing = (
    [
      ['client.representativeName', client.representativeName],
      ['client.representativeRole', client.representativeRole],
    ] as const
  ).flatMap(([name, value]) => (text(value) ? [] : [name]));
  if (missing.length > 0) throw new SigningAgreementDataError(missing);
  const birthPlace = text(employee.birthPlace);
  const identification = [
    text(employee.employeeNumber) && `marca ${text(employee.employeeNumber)}`,
    employee.birthDate && `data nașterii ${printedDate(employee.birthDate)}`,
    birthPlace && `locul nașterii ${birthPlace}`,
    text(employee.homeAddress) && `cu domiciliul în ${text(employee.homeAddress)}`,
  ]
    .filter(Boolean)
    .join(', ');
  return {
    branding: facts.branding,
    client: {
      legalName: text(client.legalName),
      cui: text(client.cui),
      address: text(client.address),
      representativeName: text(client.representativeName),
      representativeRole: text(client.representativeRole),
    },
    provider: { legalName: text(facts.provider.legalName) },
    employee: {
      name: `${text(employee.lastName).toLocaleUpperCase('ro')} ${text(employee.firstName)}`,
      position: text(employee.contractTitle),
      identification,
      hiredOn: printedDate(employee.hiredAt),
      contractNumber: text(employee.contractNumber) || null,
    },
    codeChannel: codeChannels[facts.channel],
  };
}

/**
 * The agreement's terms as a clause of a new hire's employment contract, which then needs no
 * agreement (ADR 023): one paragraph per clause, the provider's name filled in.
 */
export function signingContractClauseText(providerLegalName: string): string[] {
  return texts.contract_clause.articles.map((paragraph) =>
    paragraph.replaceAll('{{provider.legalName}}', providerLegalName.trim())
  );
}
