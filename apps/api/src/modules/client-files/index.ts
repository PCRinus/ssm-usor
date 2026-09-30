import { createRouter } from '../../router';
import {
  deleteClientFile,
  getClientFileDownload,
  listClientFiles,
  setClientFileOwnersOnly,
  updateClientFile,
  uploadClientFile,
} from './handlers';
import {
  deleteClientFileRoute,
  getClientFileDownloadRoute,
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
  .openapi(getClientFileDownloadRoute, getClientFileDownload)
  .openapi(deleteClientFileRoute, deleteClientFile);
