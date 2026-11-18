import { createRouter } from '../../router';
import { getLegalChange, listAppliedLegalChanges, listOpenLegalChanges } from './changes';
import { getLatestLegalCheckRun, listLegalActs, listLegalChanges } from './handlers';
import {
  getLatestLegalCheckRunRoute,
  getLegalChangeRoute,
  listAppliedLegalChangesRoute,
  listLegalActsRoute,
  listLegalChangesRoute,
  listOpenLegalChangesRoute,
} from './routes';

// The fixed paths go before the change's own, which would take them as its id.
export const legislationRouter = createRouter()
  .openapi(listLegalActsRoute, listLegalActs)
  .openapi(listLegalChangesRoute, listLegalChanges)
  .openapi(listOpenLegalChangesRoute, listOpenLegalChanges)
  .openapi(listAppliedLegalChangesRoute, listAppliedLegalChanges)
  .openapi(getLegalChangeRoute, getLegalChange)
  .openapi(getLatestLegalCheckRunRoute, getLatestLegalCheckRun);
