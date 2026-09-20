import { createRouter } from '../../router';
import {
  archiveClient,
  createClient,
  getClient,
  getClientOwnerNotes,
  listClients,
  promoteLead,
  restoreClient,
  saveClientOwnerNotes,
  updateClient,
} from './handlers';
import {
  archiveClientRoute,
  createClientRoute,
  getClientOwnerNotesRoute,
  getClientRoute,
  listClientsRoute,
  promoteLeadRoute,
  restoreClientRoute,
  saveClientOwnerNotesRoute,
  updateClientRoute,
} from './routes';

export const clientsRouter = createRouter()
  .openapi(listClientsRoute, listClients)
  .openapi(createClientRoute, createClient)
  .openapi(getClientRoute, getClient)
  .openapi(updateClientRoute, updateClient)
  .openapi(archiveClientRoute, archiveClient)
  .openapi(restoreClientRoute, restoreClient)
  .openapi(promoteLeadRoute, promoteLead)
  .openapi(getClientOwnerNotesRoute, getClientOwnerNotes)
  .openapi(saveClientOwnerNotesRoute, saveClientOwnerNotes);
