import { createRouter } from '../../router';
import {
  applyEvaluationProfile,
  createEvaluationProfile,
  createEvaluationProfileFactor,
  getEvaluationProfile,
  getEvaluationProfileUsage,
  listEvaluationProfileChoices,
  listEvaluationProfiles,
  removeEvaluationProfile,
  removeEvaluationProfileFactor,
  saveRiskEvaluationAsProfile,
  updateEvaluationProfile,
  updateEvaluationProfileFactor,
} from './handlers';
import {
  applyEvaluationProfileRoute,
  createEvaluationProfileFactorRoute,
  createEvaluationProfileRoute,
  getEvaluationProfileRoute,
  getEvaluationProfileUsageRoute,
  listEvaluationProfileChoicesRoute,
  listEvaluationProfilesRoute,
  removeEvaluationProfileFactorRoute,
  removeEvaluationProfileRoute,
  saveRiskEvaluationAsProfileRoute,
  updateEvaluationProfileFactorRoute,
  updateEvaluationProfileRoute,
} from './routes';

export const evaluationProfilesRouter = createRouter()
  .openapi(listEvaluationProfilesRoute, listEvaluationProfiles)
  .openapi(createEvaluationProfileRoute, createEvaluationProfile)
  // Before the routes of one profile: `choices` is not a profile id.
  .openapi(listEvaluationProfileChoicesRoute, listEvaluationProfileChoices)
  .openapi(getEvaluationProfileRoute, getEvaluationProfile)
  .openapi(getEvaluationProfileUsageRoute, getEvaluationProfileUsage)
  .openapi(updateEvaluationProfileRoute, updateEvaluationProfile)
  .openapi(removeEvaluationProfileRoute, removeEvaluationProfile)
  .openapi(createEvaluationProfileFactorRoute, createEvaluationProfileFactor)
  .openapi(updateEvaluationProfileFactorRoute, updateEvaluationProfileFactor)
  .openapi(removeEvaluationProfileFactorRoute, removeEvaluationProfileFactor)
  .openapi(saveRiskEvaluationAsProfileRoute, saveRiskEvaluationAsProfile)
  .openapi(applyEvaluationProfileRoute, applyEvaluationProfile);
