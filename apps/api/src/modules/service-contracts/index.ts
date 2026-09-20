import { createRouter } from '../../router';
import { generateServiceContract, getServiceContract, saveServiceContract } from './handlers';
import {
  generateServiceContractRoute,
  getServiceContractRoute,
  saveServiceContractRoute,
} from './routes';

export const serviceContractsRouter = createRouter()
  .openapi(getServiceContractRoute, getServiceContract)
  .openapi(saveServiceContractRoute, saveServiceContract)
  .openapi(generateServiceContractRoute, generateServiceContract);
