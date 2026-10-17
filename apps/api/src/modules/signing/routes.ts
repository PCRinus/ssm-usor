import { createRoute, z } from '@hono/zod-openapi';
import {
  clientSignatureRequestsQuerySchema,
  paperSignatureRequestSchema,
  portalSignatureRequestsResponseSchema,
  recordSignaturesResponseSchema,
  signatureRequestListResponseSchema,
  signerCandidatesResponseSchema,
  signingAgreementResponseSchema,
  signingAgreementStateRequestSchema,
  voidSignaturesRequestSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { authErrors, bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';
import { requireParticipant } from '../../lib/participant';

const clientParams = z.object({ clientId: z.uuid() });
const recordParams = clientParams.extend({ recordId: z.uuid() });
const employeeParams = clientParams.extend({ employeeId: z.uuid() });
const participantParams = z.object({ participantId: z.uuid() });

// The portal's generated client is made of the operations with this tag and no others.
const portalTags = ['portal'];

const json = <T extends z.ZodType>(schema: T, id: string) => ({
  'application/json': { schema: schema.meta({ id }) },
});

const recordSignaturesContent = json(recordSignaturesResponseSchema, 'RecordSignaturesResponse');
const requestListContent = json(signatureRequestListResponseSchema, 'SignatureRequestListResponse');
const portalRequestsContent = json(
  portalSignatureRequestsResponseSchema,
  'PortalSignatureRequestsResponse'
);
const agreementContent = json(signingAgreementResponseSchema, 'SigningAgreementResponse');
const pdfContent = {
  'application/pdf': { schema: z.string().openapi({ type: 'string', format: 'binary' }) },
};

const noRecord = {
  description: 'The training record does not exist under this client in the organization',
  content: errorContent,
};
const noEmployee = {
  description: 'The employee does not exist under this client in the organization',
  content: errorContent,
};
const agreementUnavailable = {
  description:
    'Supabase is unavailable, the template is not registered (reason `template_missing`), or there is no converter or it failed (reason `pdf_unavailable`)',
  content: errorContent,
};
const noAddress = {
  description:
    'The employee has neither an email nor a phone, so the agreement cannot say where the codes go (reason `employee_has_no_address`)',
  content: errorContent,
};

const participantErrors = {
  ...authErrors,
  403: { description: 'The account is not a participant of any client', content: errorContent },
  404: { description: "The participation is not the account's", content: errorContent },
} as const;

export const listSignerCandidatesRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/signer-candidates',
  operationId: 'listSignerCandidates',
  summary: "Who may be asked to sign a client's training records",
  description:
    "The organization's members, then the client's active participants, each once by account (a member who is also a participant is listed as a member). The app proposes a signer for each slot of a training from these (ADR 023); the trainee's is always the employee's own participant, which the API finds itself.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams },
  responses: {
    200: {
      description: 'The candidates',
      content: json(signerCandidatesResponseSchema, 'SignerCandidatesResponse'),
    },
    400: { description: 'Invalid path', content: errorContent },
    404: { description: 'The client does not exist in the organization', content: errorContent },
    ...membershipErrors,
  },
});

export const getRecordSignaturesRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/training-records/{recordId}/signatures',
  operationId: 'getRecordSignatures',
  summary: "The signature slots of a training record and each one's state",
  description:
    'The trainee and the trainer always, the verifier when the training has one, the admitter when the record admits to work. A slot is `pending` with the signer addressed, `signed` electronically or `paper` with the name and function as printed, `void` when its request or signature was voided and nothing replaced it, or `unassigned`.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: recordParams },
  responses: {
    200: { description: 'The slots', content: recordSignaturesContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noRecord,
    ...membershipErrors,
  },
});

export const markPaperSignatureRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/training-records/{recordId}/signatures/paper',
  operationId: 'markPaperSignature',
  summary: 'Mark a slot as signed by hand',
  description:
    'For a person without an account, or one who signed the paper instead: a pending request of the slot is voided with `signed_on_paper` and the slot gets a paper signature that records the member who marked it. The record is not frozen by it.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: recordParams,
    body: {
      required: true,
      content: json(paperSignatureRequestSchema, 'PaperSignatureRequest'),
    },
  },
  responses: {
    200: { description: 'The slots after the mark', content: recordSignaturesContent },
    400: { description: 'Invalid path or body', content: errorContent },
    404: noRecord,
    409: {
      description:
        'The slot is signed already (reason `slot_signed`), or the client is archived (reason `client_archived`)',
      content: errorContent,
    },
    422: {
      description: 'The record has no such slot (reason `slot_not_on_record`)',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const voidRecordSignaturesRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/training-records/{recordId}/signatures/void',
  operationId: 'voidRecordSignatures',
  summary: "Void a training record's signatures, to correct it",
  description:
    'Every live signature of the record, paper ones included, and every request that is not void, with the reason given. The record is editable again; saving the corrected training with its signers issues the requests again. The evidence rows stay, marked void.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: recordParams,
    body: {
      required: true,
      content: json(voidSignaturesRequestSchema, 'VoidSignaturesRequest'),
    },
  },
  responses: {
    200: { description: 'The slots after the void', content: recordSignaturesContent },
    400: { description: 'Invalid path or body', content: errorContent },
    404: noRecord,
    409: {
      description: 'The client is archived (reason `client_archived`)',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const listMySignatureRequestsRoute = createRoute({
  method: 'get',
  path: '/me/signature-requests',
  operationId: 'listMySignatureRequests',
  summary: "The signed-in member's pending signature requests, across clients",
  description:
    "Oldest first, with the client, the employee, the day, the domain and the phase, and the employee's signing agreement, whose absence the app shows as a warning.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  responses: {
    200: { description: 'The requests', content: requestListContent },
    ...membershipErrors,
  },
});

export const listClientSignatureRequestsRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/signature-requests',
  operationId: 'listClientSignatureRequests',
  summary: "A client's signature requests in one state, pending by default",
  description:
    "For the specialist: who still has to sign what, oldest first, with the signer's name as the app knows it.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams, query: clientSignatureRequestsQuerySchema },
  responses: {
    200: { description: 'The requests', content: requestListContent },
    400: { description: 'Invalid path or state', content: errorContent },
    404: { description: 'The client does not exist in the organization', content: errorContent },
    ...membershipErrors,
  },
});

export const getSigningAgreementRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/employees/{employeeId}/signing-agreement',
  operationId: 'getSigningAgreement',
  summary: "An employee's signing agreement (act adițional) as a PDF",
  description:
    'Drawn up on the spot from the template, the employee, the client and the provider, nothing stored; the channel it names is email when the employee has one, otherwise the phone. Recording that it was handed out or signed on paper is the state route.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: employeeParams },
  responses: {
    200: { description: 'The agreement, named in `Content-Disposition`', content: pdfContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noEmployee,
    409: noAddress,
    ...membershipErrors,
    503: agreementUnavailable,
  },
});

export const getSigningAgreementStateRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/employees/{employeeId}/signing-agreement/state',
  operationId: 'getSigningAgreementState',
  summary: "An employee's signing agreement state",
  description: '`agreement` is null until one is recorded.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: employeeParams },
  responses: {
    200: { description: 'The state', content: agreementContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noEmployee,
    ...membershipErrors,
  },
});

export const putSigningAgreementStateRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/employees/{employeeId}/signing-agreement/state',
  operationId: 'putSigningAgreementState',
  summary: "Record an employee's signing agreement as handed out or signed on paper",
  description:
    '`generated` when it was handed to the employee, `signed_on_paper` when it came back signed by hand, with the scan as a file of the client in `clientFileId`. `signed_electronically` is set by the signing flow alone, and an agreement in that state is not changed here.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: employeeParams,
    body: {
      required: true,
      content: json(signingAgreementStateRequestSchema, 'SigningAgreementStateRequest'),
    },
  },
  responses: {
    200: { description: 'The state saved', content: agreementContent },
    400: { description: 'Invalid path or body', content: errorContent },
    404: noEmployee,
    409: {
      description:
        'The agreement is signed electronically (reason `agreement_signed_electronically`), the file is not of the client, or the client is archived (reason `client_archived`)',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const listPortalSignatureRequestsRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/signature-requests',
  operationId: 'listPortalSignatureRequests',
  tags: portalTags,
  summary: 'The pending signature requests addressed to the participant',
  description:
    "Under the participation's client, oldest first, each with the record as its row of the sheet prints it: the trainee's own records, and for a trainer, a verifier or a workplace manager the other employees' records they sign.",
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: participantParams },
  responses: {
    200: { description: 'The requests', content: portalRequestsContent },
    400: { description: 'Invalid path', content: errorContent },
    ...participantErrors,
  },
});

export const listPortalClientSignatureRequestsRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/employees/signature-requests',
  operationId: 'listPortalClientSignatureRequests',
  tags: portalTags,
  summary: "The client's pending signature requests, for the client administrator",
  description: 'Oldest first, each with the name of the person its slot prints.',
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: participantParams },
  responses: {
    200: { description: 'The requests', content: portalRequestsContent },
    400: { description: 'Invalid path', content: errorContent },
    ...participantErrors,
    403: {
      description:
        "The account is not a participant, or the participation is not a client administrator's",
      content: errorContent,
    },
  },
});

const ownAgreementErrors = {
  ...participantErrors,
  404: {
    description:
      "The participation is not the account's, or it is a client administrator's who is not an employee",
    content: errorContent,
  },
} as const;

export const getPortalSigningAgreementRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/signing-agreement',
  operationId: 'getPortalSigningAgreement',
  tags: portalTags,
  summary: "The participant's own signing agreement as a PDF",
  description: "Drawn up on the spot, as the employee's page in the app does.",
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: participantParams },
  responses: {
    200: { description: 'The agreement, named in `Content-Disposition`', content: pdfContent },
    400: { description: 'Invalid path', content: errorContent },
    409: noAddress,
    ...ownAgreementErrors,
    503: agreementUnavailable,
  },
});

export const getPortalSigningAgreementStateRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/signing-agreement/state',
  operationId: 'getPortalSigningAgreementState',
  tags: portalTags,
  summary: "The participant's own signing agreement state",
  description:
    '`agreement` is null until the specialist records one; the portal shows "act adițional nesemnat" until it is signed.',
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: participantParams },
  responses: {
    200: { description: 'The state', content: agreementContent },
    400: { description: 'Invalid path', content: errorContent },
    ...ownAgreementErrors,
  },
});
