import { createRouter } from '../../router';
import { getServiceContract, saveServiceContract } from './handlers';
import { getServiceContractRoute, saveServiceContractRoute } from './routes';

export const serviceContractsRouter = createRouter()
  .openapi(getServiceContractRoute, getServiceContract)
  .openapi(saveServiceContractRoute, saveServiceContract);
