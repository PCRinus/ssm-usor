import { createRouter } from '../../router';
import {
  abandonImport,
  confirmImport,
  createImport,
  getImport,
  getImportSource,
  listImports,
  registerImportFiles,
  saveImportChanges,
  splitImport,
  startImport,
} from './handlers';
import {
  abandonImportRoute,
  confirmImportRoute,
  createImportRoute,
  getImportRoute,
  getImportSourceRoute,
  listImportsRoute,
  registerImportFilesRoute,
  saveImportChangesRoute,
  splitImportRoute,
  startImportRoute,
} from './routes';

export const importsRouter = createRouter()
  .openapi(createImportRoute, createImport)
  .openapi(listImportsRoute, listImports)
  .openapi(getImportRoute, getImport)
  .openapi(registerImportFilesRoute, registerImportFiles)
  .openapi(startImportRoute, startImport)
  .openapi(saveImportChangesRoute, saveImportChanges)
  .openapi(getImportSourceRoute, getImportSource)
  .openapi(confirmImportRoute, confirmImport)
  .openapi(abandonImportRoute, abandonImport)
  .openapi(splitImportRoute, splitImport);
