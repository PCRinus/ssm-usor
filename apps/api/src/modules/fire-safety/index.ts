import { createRouter } from '../../router';
import {
  createFireEquipment,
  createFireInstallation,
  createFireSubstance,
  deleteFireEquipment,
  deleteFireInstallation,
  deleteFireSubstance,
  getClientFireSafety,
  listFireEquipment,
  listFireInstallations,
  listFireSubstances,
  updateClientFireSafety,
  updateFireEquipment,
  updateFireInstallation,
  updateFireSubstance,
  updateFireSubstancesState,
} from './handlers';
import {
  createFireEquipmentRoute,
  createFireInstallationRoute,
  createFireSubstanceRoute,
  deleteFireEquipmentRoute,
  deleteFireInstallationRoute,
  deleteFireSubstanceRoute,
  getClientFireSafetyRoute,
  listFireEquipmentRoute,
  listFireInstallationsRoute,
  listFireSubstancesRoute,
  updateClientFireSafetyRoute,
  updateFireEquipmentRoute,
  updateFireInstallationRoute,
  updateFireSubstanceRoute,
  updateFireSubstancesStateRoute,
} from './routes';

export const fireSafetyRouter = createRouter()
  .openapi(getClientFireSafetyRoute, getClientFireSafety)
  .openapi(updateClientFireSafetyRoute, updateClientFireSafety)
  .openapi(listFireEquipmentRoute, listFireEquipment)
  .openapi(createFireEquipmentRoute, createFireEquipment)
  .openapi(updateFireEquipmentRoute, updateFireEquipment)
  .openapi(deleteFireEquipmentRoute, deleteFireEquipment)
  .openapi(listFireInstallationsRoute, listFireInstallations)
  .openapi(createFireInstallationRoute, createFireInstallation)
  .openapi(updateFireInstallationRoute, updateFireInstallation)
  .openapi(deleteFireInstallationRoute, deleteFireInstallation)
  .openapi(listFireSubstancesRoute, listFireSubstances)
  .openapi(updateFireSubstancesStateRoute, updateFireSubstancesState)
  .openapi(createFireSubstanceRoute, createFireSubstance)
  .openapi(updateFireSubstanceRoute, updateFireSubstance)
  .openapi(deleteFireSubstanceRoute, deleteFireSubstance);
