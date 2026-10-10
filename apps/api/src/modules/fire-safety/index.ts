import { createRouter } from '../../router';
import {
  createFireEquipment,
  createFireInstallation,
  deleteFireEquipment,
  deleteFireInstallation,
  getClientFireSafety,
  listFireEquipment,
  listFireInstallations,
  updateClientFireSafety,
  updateFireEquipment,
  updateFireInstallation,
} from './handlers';
import {
  createFireEquipmentRoute,
  createFireInstallationRoute,
  deleteFireEquipmentRoute,
  deleteFireInstallationRoute,
  getClientFireSafetyRoute,
  listFireEquipmentRoute,
  listFireInstallationsRoute,
  updateClientFireSafetyRoute,
  updateFireEquipmentRoute,
  updateFireInstallationRoute,
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
  .openapi(deleteFireInstallationRoute, deleteFireInstallation);
