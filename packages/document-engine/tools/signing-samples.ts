import { buildSigningAgreementData, type SigningAgreementFacts } from '../src/signing';

const client: SigningAgreementFacts['client'] = {
  legalName: 'S.C. INSTALAȚII TERMICE ȘI SANITARE BANAT CONSTRUCT S.R.L.',
  cui: 'RO12345678',
  address: 'Timișoara, județul Timiș, Str. Gheorghe Lazăr 24',
  representativeName: 'Alexandra-Ioana CONSTANTINESCU-MUNTEANU',
  representativeRole: 'Administrator',
};

const recorded: SigningAgreementFacts = {
  branding: true,
  client,
  provider: { legalName: 'S.C. PREVENȚIA MUNCII CONSULT S.R.L.' },
  employee: {
    lastName: 'Mărgineanu-Zaharia',
    firstName: 'Radu-Constantin',
    employeeNumber: '0042',
    contractTitle: 'Operator montaj linii automate',
    contractNumber: 'CIM 123/2020',
    hiredAt: '2026-01-05',
    birthDate: '1988-03-14',
    birthPlace: 'Lugoj',
    homeAddress: 'Str. Lungă nr. 12, bl. A3, sc. 2, ap. 14, Timișoara, jud. Timiș',
  },
  channel: 'email',
};

const sparse: SigningAgreementFacts = {
  ...recorded,
  branding: false,
  employee: {
    ...recorded.employee,
    lastName: 'Pop',
    firstName: 'Ion',
    employeeNumber: null,
    contractTitle: 'Sudor',
    contractNumber: null,
    birthDate: null,
    birthPlace: null,
    homeAddress: null,
  },
  channel: 'sms',
};

export const signingAgreementFacts = { recorded, sparse };

export function signingAgreementSamples() {
  return [
    { label: 'recorded', data: buildSigningAgreementData(recorded) },
    { label: 'sparse', data: buildSigningAgreementData(sparse) },
  ];
}
