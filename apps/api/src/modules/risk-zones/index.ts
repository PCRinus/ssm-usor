import { createRouter } from '../../router';
import {
  createRiskZone,
  listRiskZoneNames,
  listRiskZones,
  removeRiskZone,
  updateRiskZone,
  updateRiskZonesState,
} from './handlers';
import {
  createRiskZoneRoute,
  listRiskZonesRoute,
  removeRiskZoneRoute,
  riskZoneNamesRoute,
  updateRiskZoneRoute,
  updateRiskZonesStateRoute,
} from './routes';

export const riskZonesRouter = createRouter()
  .openapi(listRiskZonesRoute, listRiskZones)
  .openapi(createRiskZoneRoute, createRiskZone)
  .openapi(updateRiskZoneRoute, updateRiskZone)
  .openapi(removeRiskZoneRoute, removeRiskZone)
  .openapi(updateRiskZonesStateRoute, updateRiskZonesState)
  .openapi(riskZoneNamesRoute, listRiskZoneNames);
