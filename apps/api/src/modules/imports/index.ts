import { createRouter } from '../../router';
import {
  abandonImport,
  addFoundSheets,
  confirmImport,
  createImport,
  getImport,
  getImportSource,
  listFoundSheets,
  listImports,
  readImportFile,
  registerImportFiles,
  saveEmployeeImportChanges,
  saveImportChanges,
  splitImport,
  startImport,
} from './handlers';
import {
  abandonImportRoute,
  addFoundSheetsRoute,
  confirmImportRoute,
  createImportRoute,
  getImportRoute,
  getImportSourceRoute,
  listFoundSheetsRoute,
  listImportsRoute,
  readImportFileRoute,
  registerImportFilesRoute,
  saveEmployeeImportChangesRoute,
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
  .openapi(splitImportRoute, splitImport)
  .openapi(readImportFileRoute, readImportFile)
  .openapi(saveEmployeeImportChangesRoute, saveEmployeeImportChanges)
  .openapi(listFoundSheetsRoute, listFoundSheets)
  .openapi(addFoundSheetsRoute, addFoundSheets);
