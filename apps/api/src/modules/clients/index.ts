import { createRouter } from '../../router';
import { createClient, getClient, listClients } from './handlers';
import { createClientRoute, getClientRoute, listClientsRoute } from './routes';

export const clientsRouter = createRouter()
  .openapi(listClientsRoute, listClients)
  .openapi(createClientRoute, createClient)
  .openapi(getClientRoute, getClient);
