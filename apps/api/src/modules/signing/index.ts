import { createRouter } from '../../router';
import {
  getPortalSigningAgreement,
  getPortalSigningAgreementState,
  getRecordSignatures,
  getSigningAgreement,
  getSigningAgreementState,
  listClientSignatureRequests,
  listMySignatureRequests,
  listPortalClientSignatureRequests,
  listPortalSignatureRequests,
  listSignerCandidates,
  markPaperSignature,
  putSigningAgreementState,
  voidRecordSignatures,
} from './handlers';
import {
  getPortalSigningAgreementRoute,
  getPortalSigningAgreementStateRoute,
  getRecordSignaturesRoute,
  getSigningAgreementRoute,
  getSigningAgreementStateRoute,
  listClientSignatureRequestsRoute,
  listMySignatureRequestsRoute,
  listPortalClientSignatureRequestsRoute,
  listPortalSignatureRequestsRoute,
  listSignerCandidatesRoute,
  markPaperSignatureRoute,
  putSigningAgreementStateRoute,
  voidRecordSignaturesRoute,
} from './routes';

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
  .openapi(listPortalSignatureRequestsRoute, listPortalSignatureRequests)
  .openapi(listPortalClientSignatureRequestsRoute, listPortalClientSignatureRequests)
  .openapi(getPortalSigningAgreementRoute, getPortalSigningAgreement)
  .openapi(getPortalSigningAgreementStateRoute, getPortalSigningAgreementState);
