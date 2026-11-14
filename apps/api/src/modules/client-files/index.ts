import { createRouter } from '../../router';
import {
  clearEarlierInstructionsUnavailable,
  getEarlierInstructions,
  markEarlierInstructionsUnavailable,
} from './earlier-instructions';
import {
  deleteClientFile,
  listClientFiles,
  setClientFileOwnersOnly,
  updateClientFile,
  uploadClientFile,
} from './handlers';
import {
  clearEarlierInstructionsUnavailableRoute,
  deleteClientFileRoute,
  getEarlierInstructionsRoute,
  listClientFilesRoute,
  markEarlierInstructionsUnavailableRoute,
  setClientFileOwnersOnlyRoute,
  updateClientFileRoute,
  uploadClientFileRoute,
} from './routes';

export const clientFilesRouter = createRouter()
  .openapi(listClientFilesRoute, listClientFiles)
  .openapi(uploadClientFileRoute, uploadClientFile)
  .openapi(updateClientFileRoute, updateClientFile)
  .openapi(setClientFileOwnersOnlyRoute, setClientFileOwnersOnly)
  .openapi(deleteClientFileRoute, deleteClientFile)
  .openapi(getEarlierInstructionsRoute, getEarlierInstructions)
  .openapi(markEarlierInstructionsUnavailableRoute, markEarlierInstructionsUnavailable)
  .openapi(clearEarlierInstructionsUnavailableRoute, clearEarlierInstructionsUnavailable);
