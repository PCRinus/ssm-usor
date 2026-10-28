import { createRouter } from '../../router';
import { getSetupGuide, skipSetupStep, unskipSetupStep, updateSetupGuide } from './handlers';
import {
  getSetupGuideRoute,
  skipSetupStepRoute,
  unskipSetupStepRoute,
  updateSetupGuideRoute,
} from './routes';

export const setupRouter = createRouter()
  .openapi(getSetupGuideRoute, getSetupGuide)
  .openapi(updateSetupGuideRoute, updateSetupGuide)
  .openapi(skipSetupStepRoute, skipSetupStep)
  .openapi(unskipSetupStepRoute, unskipSetupStep);
