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
  listPortalTrainingRecords,
  recordPortalNotice,
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
  listPortalTrainingRecordsRoute,
  recordPortalNoticeRoute,
} from './routes';

export const portalRouter = createRouter()
  .openapi(getPortalMeRoute, getPortalMe)
  .openapi(recordPortalNoticeRoute, recordPortalNotice)
  .openapi(listPortalTrainingRecordsRoute, listPortalTrainingRecords)
  .openapi(getPortalEmployeeDataRoute, getPortalEmployeeData)
  .openapi(getPortalTrainingSheetsRoute, getPortalTrainingSheets)
  .openapi(getPortalTrainingSheetRoute, getPortalTrainingSheet)
  .openapi(listPortalClientEmployeesRoute, listPortalClientEmployees)
  .openapi(listPortalEmployeeTrainingRecordsRoute, listPortalEmployeeTrainingRecords)
  .openapi(getPortalEmployeeTrainingSheetsRoute, getPortalEmployeeTrainingSheets)
  .openapi(getPortalEmployeeTrainingSheetRoute, getPortalEmployeeTrainingSheet);
