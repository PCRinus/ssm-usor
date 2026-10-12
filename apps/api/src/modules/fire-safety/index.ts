import { createRouter } from '../../router';
import {
  createFireEquipment,
  createFireInstallation,
  createFireMaintenanceItem,
  createFireSubstance,
  deleteFireBuilding,
  deleteFireEquipment,
  deleteFireInstallation,
  deleteFireMaintenanceItem,
  deleteFireSubstance,
  getClientFireSafety,
  listFireBuildings,
  listFireEquipment,
  listFireInstallations,
  listFireMaintenanceItems,
  listFireSubstances,
  updateClientFireSafety,
  updateFireBuilding,
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
  deleteFireBuildingRoute,
  deleteFireEquipmentRoute,
  deleteFireInstallationRoute,
  deleteFireMaintenanceItemRoute,
  deleteFireSubstanceRoute,
  getClientFireSafetyRoute,
  listFireBuildingsRoute,
  listFireEquipmentRoute,
  listFireInstallationsRoute,
  listFireMaintenanceItemsRoute,
  listFireSubstancesRoute,
  updateClientFireSafetyRoute,
  updateFireBuildingRoute,
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
  .openapi(listFireBuildingsRoute, listFireBuildings)
  .openapi(updateFireBuildingRoute, updateFireBuilding)
  .openapi(deleteFireBuildingRoute, deleteFireBuilding)
  .openapi(listFireSubstancesRoute, listFireSubstances)
  .openapi(updateFireSubstancesStateRoute, updateFireSubstancesState)
  .openapi(createFireSubstanceRoute, createFireSubstance)
  .openapi(updateFireSubstanceRoute, updateFireSubstance)
  .openapi(deleteFireSubstanceRoute, deleteFireSubstance);
