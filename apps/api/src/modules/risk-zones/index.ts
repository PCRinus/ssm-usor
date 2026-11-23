import { createRouter } from '../../router';
import {
  createRiskZone,
  ignoreRiskZoneSuggestion,
  listRiskZoneNames,
  listRiskZones,
  removeRiskZone,
  restoreRiskZoneSuggestion,
  updateRiskZone,
  updateRiskZonesState,
} from './handlers';
import {
  createRiskZoneRoute,
  ignoreRiskZoneSuggestionRoute,
  listRiskZonesRoute,
  removeRiskZoneRoute,
  restoreRiskZoneSuggestionRoute,
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
  .openapi(riskZoneNamesRoute, listRiskZoneNames)
  .openapi(ignoreRiskZoneSuggestionRoute, ignoreRiskZoneSuggestion)
  .openapi(restoreRiskZoneSuggestionRoute, restoreRiskZoneSuggestion);
