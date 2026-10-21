import { createRouter } from '../../router';
import {
  deleteClientFile,
  listClientFiles,
  setClientFileOwnersOnly,
  updateClientFile,
  uploadClientFile,
} from './handlers';
import {
  deleteClientFileRoute,
  listClientFilesRoute,
  setClientFileOwnersOnlyRoute,
  updateClientFileRoute,
  uploadClientFileRoute,
} from './routes';

export const clientFilesRouter = createRouter()
  .openapi(listClientFilesRoute, listClientFiles)
  .openapi(uploadClientFileRoute, uploadClientFile)
  .openapi(updateClientFileRoute, updateClientFile)
  .openapi(setClientFileOwnersOnlyRoute, setClientFileOwnersOnly)
  .openapi(deleteClientFileRoute, deleteClientFile);
