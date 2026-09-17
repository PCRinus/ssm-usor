import { createRouter } from '../../router';
import { createClient, listClients } from './handlers';
import { createClientRoute, listClientsRoute } from './routes';

export const clientsRouter = createRouter()
  .openapi(listClientsRoute, listClients)
  .openapi(createClientRoute, createClient);
