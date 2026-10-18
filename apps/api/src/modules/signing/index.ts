import { createRouter } from '../../router';
import {
  getPortalEmployeeSigningAgreement,
  getPortalSigningAgreement,
  getPortalSigningAgreementState,
  getRecordSignatures,
  getSigningAgreement,
  getSigningAgreementState,
  listClientSignatureRequests,
  listMySignatureRequests,
  listPortalClientSignatureRequests,
  listPortalSignatureRequests,
  listPortalSigningAgreements,
  listSignerCandidates,
  markPaperSignature,
  putSigningAgreementState,
  voidRecordSignatures,
} from './handlers';
import {
  createMySigningSessionRoute,
  createPortalSigningSessionRoute,
  getPortalEmployeeSigningAgreementRoute,
  getPortalSigningAgreementRoute,
  getPortalSigningAgreementStateRoute,
  getRecordSignaturesRoute,
  getSigningAgreementRoute,
  getSigningAgreementStateRoute,
  listClientSignatureRequestsRoute,
  listMySignatureRequestsRoute,
  listPortalClientSignatureRequestsRoute,
  listPortalSignatureRequestsRoute,
  listPortalSigningAgreementsRoute,
  listSignerCandidatesRoute,
  markPaperSignatureRoute,
  putSigningAgreementStateRoute,
  signMySigningSessionRoute,
  signPortalSigningSessionRoute,
  voidRecordSignaturesRoute,
} from './routes';
import {
  createMySigningSession,
  createPortalSigningSession,
  signMySigningSession,
  signPortalSigningSession,
} from './session-signing';

export const signingRouter = createRouter()
  .openapi(listSignerCandidatesRoute, listSignerCandidates)
  .openapi(getRecordSignaturesRoute, getRecordSignatures)
  .openapi(markPaperSignatureRoute, markPaperSignature)
  .openapi(voidRecordSignaturesRoute, voidRecordSignatures)
  .openapi(listMySignatureRequestsRoute, listMySignatureRequests)
  .openapi(listClientSignatureRequestsRoute, listClientSignatureRequests)
  .openapi(getSigningAgreementRoute, getSigningAgreement)
  .openapi(getSigningAgreementStateRoute, getSigningAgreementState)
  .openapi(putSigningAgreementStateRoute, putSigningAgreementState)
  .openapi(createMySigningSessionRoute, createMySigningSession)
  .openapi(signMySigningSessionRoute, signMySigningSession)
  .openapi(listPortalSignatureRequestsRoute, listPortalSignatureRequests)
  .openapi(listPortalClientSignatureRequestsRoute, listPortalClientSignatureRequests)
  .openapi(listPortalSigningAgreementsRoute, listPortalSigningAgreements)
  .openapi(getPortalEmployeeSigningAgreementRoute, getPortalEmployeeSigningAgreement)
  .openapi(getPortalSigningAgreementRoute, getPortalSigningAgreement)
  .openapi(getPortalSigningAgreementStateRoute, getPortalSigningAgreementState)
  .openapi(createPortalSigningSessionRoute, createPortalSigningSession)
  .openapi(signPortalSigningSessionRoute, signPortalSigningSession);
