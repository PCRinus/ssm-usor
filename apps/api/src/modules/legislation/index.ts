import { createRouter } from '../../router';
import { listLegalActs, listLegalChanges } from './handlers';
import { listLegalActsRoute, listLegalChangesRoute } from './routes';

export const legislationRouter = createRouter()
  .openapi(listLegalActsRoute, listLegalActs)
  .openapi(listLegalChangesRoute, listLegalChanges);
