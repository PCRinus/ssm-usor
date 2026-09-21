import { createRouter } from '../../router';
import {
  generateServiceContract,
  getServiceContract,
  saveServiceContract,
  sendServiceContract,
} from './handlers';
import {
  generateServiceContractRoute,
  getServiceContractRoute,
  saveServiceContractRoute,
  sendServiceContractRoute,
} from './routes';

export const serviceContractsRouter = createRouter()
  .openapi(getServiceContractRoute, getServiceContract)
  .openapi(saveServiceContractRoute, saveServiceContract)
  .openapi(generateServiceContractRoute, generateServiceContract)
  .openapi(sendServiceContractRoute, sendServiceContract);
