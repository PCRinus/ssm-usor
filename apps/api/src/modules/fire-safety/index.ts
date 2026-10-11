import { createRouter } from '../../router';
import {
  createFireEquipment,
  createFireInstallation,
  createFireMaintenanceItem,
  createFireSubstance,
  deleteFireEquipment,
  deleteFireInstallation,
  deleteFireMaintenanceItem,
  deleteFireSubstance,
  getClientFireSafety,
  listFireEquipment,
  listFireInstallations,
  listFireMaintenanceItems,
  listFireSubstances,
  updateClientFireSafety,
  updateFireEquipment,
  updateFireInstallation,
  updateFireMaintenanceItem,
  updateFireSubstance,
  updateFireSubstancesState,
} from './handlers';
import {
  createFireEquipmentRoute,
  createFireInstallationRoute,
  createFireMaintenanceItemRoute,
  createFireSubstanceRoute,
  deleteFireEquipmentRoute,
  deleteFireInstallationRoute,
  deleteFireMaintenanceItemRoute,
  deleteFireSubstanceRoute,
  getClientFireSafetyRoute,
  listFireEquipmentRoute,
  listFireInstallationsRoute,
  listFireMaintenanceItemsRoute,
  listFireSubstancesRoute,
  updateClientFireSafetyRoute,
  updateFireEquipmentRoute,
  updateFireInstallationRoute,
  updateFireMaintenanceItemRoute,
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
  .openapi(listFireMaintenanceItemsRoute, listFireMaintenanceItems)
  .openapi(createFireMaintenanceItemRoute, createFireMaintenanceItem)
  .openapi(updateFireMaintenanceItemRoute, updateFireMaintenanceItem)
  .openapi(deleteFireMaintenanceItemRoute, deleteFireMaintenanceItem)
  .openapi(listFireSubstancesRoute, listFireSubstances)
  .openapi(updateFireSubstancesStateRoute, updateFireSubstancesState)
  .openapi(createFireSubstanceRoute, createFireSubstance)
  .openapi(updateFireSubstanceRoute, updateFireSubstance)
  .openapi(deleteFireSubstanceRoute, deleteFireSubstance);
