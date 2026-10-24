import { createRouter } from '../../router';
import { listGuides, recordGuide } from './handlers';
import { listGuidesRoute, recordGuideRoute } from './routes';

export const guidesRouter = createRouter()
  .openapi(listGuidesRoute, listGuides)
  .openapi(recordGuideRoute, recordGuide);
