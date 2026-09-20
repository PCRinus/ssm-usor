import { createRouter } from '../../router';
import {
  archiveClient,
  createClient,
  getClient,
  listClients,
  restoreClient,
  updateClient,
} from './handlers';
import {
  archiveClientRoute,
  createClientRoute,
  getClientRoute,
  listClientsRoute,
  restoreClientRoute,
  updateClientRoute,
} from './routes';

export const clientsRouter = createRouter()
  .openapi(listClientsRoute, listClients)
  .openapi(createClientRoute, createClient)
  .openapi(getClientRoute, getClient)
  .openapi(updateClientRoute, updateClient)
  .openapi(archiveClientRoute, archiveClient)
  .openapi(restoreClientRoute, restoreClient);
