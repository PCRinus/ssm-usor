import { createRouter } from '../../router';
import { downloadContractReturn, lookupContractReturn, uploadContractReturn } from './handlers';
import {
  downloadContractReturnRoute,
  lookupContractReturnRoute,
  uploadContractReturnRoute,
} from './routes';

export const contractReturnsRouter = createRouter()
  .openapi(lookupContractReturnRoute, lookupContractReturn)
  .openapi(downloadContractReturnRoute, downloadContractReturn)
  .openapi(uploadContractReturnRoute, uploadContractReturn);
