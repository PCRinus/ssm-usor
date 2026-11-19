import { createRouter } from '../../router';
import { abandonImport, listClosedImports, listImports } from './handlers';
import {
  confirmImportLibraryPart,
  listImportLibraryParts,
  retryImportLibraryPart,
  saveImportLibraryPartChanges,
} from './library-handlers';
import { reportImport, reportImportLibraryPart } from './report-handlers';
import {
  confirmImport,
  getImport,
  saveEmployeeImportChanges,
  saveImportChanges,
} from './review-handlers';
import {
  abandonImportRoute,
  addFoundSheetsRoute,
  confirmImportLibraryPartRoute,
  confirmImportRoute,
  createImportRoute,
  getImportRoute,
  getImportSourceRoute,
  listClosedImportsRoute,
  listFoundSheetsRoute,
  listImportLibraryPartsRoute,
  listImportsRoute,
  readImportFileRoute,
  registerImportFilesRoute,
  reportImportLibraryPartRoute,
  reportImportRoute,
  retryImportLibraryPartRoute,
  saveEmployeeImportChangesRoute,
  saveImportChangesRoute,
  saveImportLibraryPartChangesRoute,
  splitImportRoute,
  startImportRoute,
} from './routes';
import { getImportSource } from './source-handler';
import {
  addFoundSheets,
  createImport,
  listFoundSheets,
  readImportFile,
  registerImportFiles,
  splitImport,
  startImport,
} from './upload-handlers';

export const importsRouter = createRouter()
  .openapi(createImportRoute, createImport)
  .openapi(listImportsRoute, listImports)
  .openapi(listClosedImportsRoute, listClosedImports)
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
  .openapi(addFoundSheetsRoute, addFoundSheets)
  .openapi(listImportLibraryPartsRoute, listImportLibraryParts)
  .openapi(saveImportLibraryPartChangesRoute, saveImportLibraryPartChanges)
  .openapi(confirmImportLibraryPartRoute, confirmImportLibraryPart)
  .openapi(retryImportLibraryPartRoute, retryImportLibraryPart)
  .openapi(reportImportRoute, reportImport)
  .openapi(reportImportLibraryPartRoute, reportImportLibraryPart);
