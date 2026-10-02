import { createRouter } from '../../router';
import {
  copyRiskFactors,
  createRiskEvaluation,
  createRiskFactor,
  getJobPositionRiskEvaluation,
  getRiskEvaluation,
  listRiskEvaluations,
  listRiskFactorSuggestions,
  removeRiskEvaluation,
  removeRiskFactor,
  reorderRiskFactors,
  updateRiskEvaluation,
  updateRiskFactor,
} from './handlers';
import {
  copyRiskFactorsRoute,
  createRiskEvaluationRoute,
  createRiskFactorRoute,
  getJobPositionRiskEvaluationRoute,
  getRiskEvaluationRoute,
  listRiskEvaluationsRoute,
  removeRiskEvaluationRoute,
  removeRiskFactorRoute,
  reorderRiskFactorsRoute,
  riskFactorSuggestionsRoute,
  updateRiskEvaluationRoute,
  updateRiskFactorRoute,
} from './routes';

export const riskEvaluationsRouter = createRouter()
  .openapi(listRiskEvaluationsRoute, listRiskEvaluations)
  .openapi(createRiskEvaluationRoute, createRiskEvaluation)
  .openapi(getRiskEvaluationRoute, getRiskEvaluation)
  .openapi(updateRiskEvaluationRoute, updateRiskEvaluation)
  .openapi(removeRiskEvaluationRoute, removeRiskEvaluation)
  .openapi(createRiskFactorRoute, createRiskFactor)
  .openapi(copyRiskFactorsRoute, copyRiskFactors)
  .openapi(updateRiskFactorRoute, updateRiskFactor)
  .openapi(removeRiskFactorRoute, removeRiskFactor)
  .openapi(reorderRiskFactorsRoute, reorderRiskFactors)
  .openapi(getJobPositionRiskEvaluationRoute, getJobPositionRiskEvaluation)
  .openapi(riskFactorSuggestionsRoute, listRiskFactorSuggestions);
