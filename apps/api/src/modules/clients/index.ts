import { createRouter } from '../../router';
import { createClient, getClient, listClients, updateClient } from './handlers';
import { createClientRoute, getClientRoute, listClientsRoute, updateClientRoute } from './routes';

export const clientsRouter = createRouter()
  .openapi(listClientsRoute, listClients)
  .openapi(createClientRoute, createClient)
  .openapi(getClientRoute, getClient)
  .openapi(updateClientRoute, updateClient);
