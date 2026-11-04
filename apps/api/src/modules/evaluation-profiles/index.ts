import { createRouter } from '../../router';
import {
  applyEvaluationProfile,
  createEvaluationProfile,
  createEvaluationProfileFactor,
  getEvaluationProfile,
  getEvaluationProfileUsage,
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
  .openapi(getEvaluationProfileRoute, getEvaluationProfile)
  .openapi(getEvaluationProfileUsageRoute, getEvaluationProfileUsage)
  .openapi(updateEvaluationProfileRoute, updateEvaluationProfile)
  .openapi(removeEvaluationProfileRoute, removeEvaluationProfile)
  .openapi(createEvaluationProfileFactorRoute, createEvaluationProfileFactor)
  .openapi(updateEvaluationProfileFactorRoute, updateEvaluationProfileFactor)
  .openapi(removeEvaluationProfileFactorRoute, removeEvaluationProfileFactor)
  .openapi(saveRiskEvaluationAsProfileRoute, saveRiskEvaluationAsProfile)
  .openapi(applyEvaluationProfileRoute, applyEvaluationProfile);
