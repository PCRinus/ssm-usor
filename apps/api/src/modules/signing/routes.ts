import { createRoute, z } from '@hono/zod-openapi';
import {
  clientSignatureRequestsQuerySchema,
  paperSignatureRequestSchema,
  portalSignatureRequestsResponseSchema,
  portalSigningAgreementsResponseSchema,
  recordSignaturesResponseSchema,
  signatureRequestListResponseSchema,
  signCodeRequestSchema,
  signerCandidatesResponseSchema,
  signingAgreementResponseSchema,
  signingAgreementStateRequestSchema,
  signingSessionRequestSchema,
  signingSessionResponseSchema,
  signSessionResponseSchema,
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

const sessionBody = {
  required: true,
  content: json(signingSessionRequestSchema, 'SigningSessionRequest'),
} as const;
const codeBody = {
  required: true,
  content: json(signCodeRequestSchema, 'SignCodeRequest'),
} as const;
const sessionContent = json(signingSessionResponseSchema, 'SigningSessionResponse');
const signedContent = json(signSessionResponseSchema, 'SignSessionResponse');
const sessionParams = z.object({ sessionId: z.uuid() });

const sessionCreated = {
  description:
    'The code was sent; `items` is what it will sign, the agreements first, then the requests in the order given',
  content: sessionContent,
};
const itemNotFound = {
  description:
    "A request is not pending, not addressed to the caller or (in the portal) not under the participation's client, or an agreement does not await the caller's signature (reason `signing_item_not_found`, the item in `issues`)",
  content: errorContent,
};
const sessionRefused = {
  description:
    'A code was sent to the account in the last minute (reason `code_rate_limited`), or the account has no address for the code (reason `signer_has_no_address`)',
  content: errorContent,
};
const sessionUnavailable = {
  description:
    'The code could not be sent and nothing was kept (reason `signing_code_not_sent`), the signing secrets are not configured (reason `signing_unavailable`), or Supabase is unavailable',
  content: errorContent,
};
const signAnswered = {
  description:
    "The code was right and the session is spent. Each item is signed or reported failed, independently: `signed` with the trainee's agreement state, `failed` with a reason (`request_not_pending`, `sheet_busy`, `slot_not_on_sheet`, `missing_sheet_data`, `signer_unavailable`, `pdf_unavailable`, `template_missing`, `signing_failed`), `agreements` likewise, with `agreement_not_awaiting` for one signed or settled since",
  content: signedContent,
};
const codeRefused = {
  description:
    'The code was refused and nothing was signed: `code_invalid` (the attempts left in the message), `code_attempts_exceeded`, `code_expired`, `code_already_used`',
  content: errorContent,
};
const noSession = {
  description: "The session is not the caller's (reason `signing_session_not_found`)",
  content: errorContent,
};
const signUnavailable = {
  description:
    'The signing secrets are not configured (reason `signing_unavailable`); the code is not spent',
  content: errorContent,
};

export const createMySigningSessionRoute = createRoute({
  method: 'post',
  path: '/me/signing-sessions',
  operationId: 'createMySigningSession',
  summary: 'Ask for a signing code for the listed requests',
  description:
    "The member's pending requests to sign in one go with one code (ADR 023), sent to the account's email. A trainee's request is signed in the portal and is refused here, as is any agreement (reason `agreement_signed_in_portal`). The code is valid for ten minutes and three attempts.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { body: sessionBody },
  responses: {
    201: sessionCreated,
    400: { description: 'Invalid body', content: errorContent },
    404: itemNotFound,
    409: sessionRefused,
    422: {
      description: 'An agreement was listed (reason `agreement_signed_in_portal`)',
      content: errorContent,
    },
    ...membershipErrors,
    503: sessionUnavailable,
  },
});

export const signMySigningSessionRoute = createRoute({
  method: 'post',
  path: '/me/signing-sessions/{sessionId}/sign',
  operationId: 'signMySigningSession',
  summary: 'Type the code and sign everything the session lists',
  description:
    "Each request's record gets its row on the employee's signed sheet, the slot's signature (PAdES, with the signer's own certificate), the evidence row, and the request marked signed. One item failing does not stop the others.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: sessionParams, body: codeBody },
  responses: {
    200: signAnswered,
    400: { description: 'Invalid path or body, the code not six digits', content: errorContent },
    404: noSession,
    409: codeRefused,
    ...membershipErrors,
    503: signUnavailable,
  },
});

const portalSessionParams = participantParams.extend({ sessionId: z.uuid() });

export const createPortalSigningSessionRoute = createRoute({
  method: 'post',
  path: '/portal/participants/{participantId}/signing-sessions',
  operationId: 'createPortalSigningSession',
  tags: portalTags,
  summary: 'Ask for a signing code for the listed requests and agreements',
  description:
    "The participant's pending requests under the participation's client and, in `agreementEmployeeIds`, signing agreements: an employee their own, while it awaits them; the client administrator the client's employees' agreements the employee has signed and the employer has not. The code goes to the email the app holds for the person, else by SMS to the phone.",
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: participantParams, body: sessionBody },
  responses: {
    201: sessionCreated,
    400: { description: 'Invalid path or body', content: errorContent },
    ...participantErrors,
    404: itemNotFound,
    409: sessionRefused,
    503: sessionUnavailable,
  },
});

export const signPortalSigningSessionRoute = createRoute({
  method: 'post',
  path: '/portal/participants/{participantId}/signing-sessions/{sessionId}/sign',
  operationId: 'signPortalSigningSession',
  tags: portalTags,
  summary: 'Type the code and sign everything the session lists',
  description:
    "As the member's route, with the agreements first: the employee's signature draws the agreement up, certifies it and stores it; the administrator's signs the stored file, after which the agreement is `signed_electronically`. A record is signed whatever its trainee's agreement state; `agreementState` says it, so the screen keeps warning.",
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: portalSessionParams, body: codeBody },
  responses: {
    200: signAnswered,
    400: { description: 'Invalid path or body, the code not six digits', content: errorContent },
    ...participantErrors,
    404: {
      description:
        "The participation or the session is not the caller's (reason `signing_session_not_found` for the session)",
      content: errorContent,
    },
    409: codeRefused,
    503: signUnavailable,
  },
});

const administratorErrors = {
  ...participantErrors,
  403: {
    description:
      "The account is not a participant, or the participation is not a client administrator's",
    content: errorContent,
  },
} as const;

export const listPortalSigningAgreementsRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/employees/signing-agreements',
  operationId: 'listPortalSigningAgreements',
  tags: portalTags,
  summary: "The client's signing agreements the employer signs, for the client administrator",
  description:
    'Those the employee has signed and the employer has not (`awaitingEmployer`) first, then those signed electronically by both, each by employee name.',
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: participantParams },
  responses: {
    200: {
      description: 'The agreements',
      content: json(portalSigningAgreementsResponseSchema, 'PortalSigningAgreementsResponse'),
    },
    400: { description: 'Invalid path', content: errorContent },
    ...administratorErrors,
  },
});

export const getPortalEmployeeSigningAgreementRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/employees/{employeeId}/signing-agreement',
  operationId: 'getPortalEmployeeSigningAgreement',
  tags: portalTags,
  summary: "An employee's signing agreement as a PDF, for the client administrator",
  description: 'The stored, signed file once the employee has signed; else drawn up on the spot.',
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: participantParams.extend({ employeeId: z.uuid() }) },
  responses: {
    200: { description: 'The agreement, named in `Content-Disposition`', content: pdfContent },
    400: { description: 'Invalid path', content: errorContent },
    409: noAddress,
    ...administratorErrors,
    404: {
      description: "The participation is not the account's, or the employee is not of the client",
      content: errorContent,
    },
    503: agreementUnavailable,
  },
});
