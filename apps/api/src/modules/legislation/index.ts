import { createRouter } from '../../router';
import { getLatestLegalCheckRun, listLegalActs, listLegalChanges } from './handlers';
import { getLatestLegalCheckRunRoute, listLegalActsRoute, listLegalChangesRoute } from './routes';

export const legislationRouter = createRouter()
  .openapi(listLegalActsRoute, listLegalActs)
  .openapi(listLegalChangesRoute, listLegalChanges)
  .openapi(getLatestLegalCheckRunRoute, getLatestLegalCheckRun);
