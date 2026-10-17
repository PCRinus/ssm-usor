import { createRouter } from '../../router';
import {
  getPortalEmployeeData,
  getPortalEmployeeTrainingSheet,
  getPortalEmployeeTrainingSheets,
  getPortalMe,
  getPortalTrainingSheet,
  getPortalTrainingSheets,
  listPortalClientEmployees,
  listPortalEmployeeTrainingRecords,
  listPortalResponsiblePersons,
  listPortalTrainingRecords,
  recordPortalNotice,
  setPortalLanguage,
} from './handlers';
import {
  getPortalEmployeeDataRoute,
  getPortalEmployeeTrainingSheetRoute,
  getPortalEmployeeTrainingSheetsRoute,
  getPortalMeRoute,
  getPortalTrainingSheetRoute,
  getPortalTrainingSheetsRoute,
  listPortalClientEmployeesRoute,
  listPortalEmployeeTrainingRecordsRoute,
  listPortalResponsiblePersonsRoute,
  listPortalTrainingRecordsRoute,
  recordPortalNoticeRoute,
  setPortalLanguageRoute,
} from './routes';

export const portalRouter = createRouter()
  .openapi(getPortalMeRoute, getPortalMe)
  .openapi(recordPortalNoticeRoute, recordPortalNotice)
  .openapi(setPortalLanguageRoute, setPortalLanguage)
  .openapi(listPortalTrainingRecordsRoute, listPortalTrainingRecords)
  .openapi(getPortalEmployeeDataRoute, getPortalEmployeeData)
  .openapi(getPortalTrainingSheetsRoute, getPortalTrainingSheets)
  .openapi(getPortalTrainingSheetRoute, getPortalTrainingSheet)
  .openapi(listPortalClientEmployeesRoute, listPortalClientEmployees)
  .openapi(listPortalEmployeeTrainingRecordsRoute, listPortalEmployeeTrainingRecords)
  .openapi(getPortalEmployeeTrainingSheetsRoute, getPortalEmployeeTrainingSheets)
  .openapi(getPortalEmployeeTrainingSheetRoute, getPortalEmployeeTrainingSheet)
  .openapi(listPortalResponsiblePersonsRoute, listPortalResponsiblePersons);
