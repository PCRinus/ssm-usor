import { createRouter } from '../../router';
import {
  getPortalEmployeeData,
  getPortalEmployeeTrainingSheet,
  getPortalEmployeeTrainingSheetLink,
  getPortalEmployeeTrainingSheets,
  getPortalMe,
  getPortalTrainingSheet,
  getPortalTrainingSheetLink,
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
  getPortalEmployeeTrainingSheetLinkRoute,
  getPortalEmployeeTrainingSheetRoute,
  getPortalEmployeeTrainingSheetsRoute,
  getPortalMeRoute,
  getPortalTrainingSheetLinkRoute,
  getPortalTrainingSheetRoute,
  getPortalTrainingSheetsRoute,
  listPortalClientEmployeesRoute,
  listPortalEmployeeTrainingRecordsRoute,
  listPortalResponsiblePersonsRoute,
  listPortalTrainingRecordsRoute,
  recordPortalNoticeRoute,
  setPortalLanguageRoute,
} from './routes';
import {
  answerPortalTestAttempt,
  finishPortalTestAttempt,
  getPortalMaterial,
  getPortalMaterialLink,
  getPortalTests,
  getPortalTestSheet,
  getPortalTestSheetLink,
  getPortalTestStudyCard,
  startPortalTestAttempt,
} from './test-handlers';
import {
  answerPortalTestAttemptRoute,
  finishPortalTestAttemptRoute,
  getPortalMaterialLinkRoute,
  getPortalMaterialRoute,
  getPortalTestSheetLinkRoute,
  getPortalTestSheetRoute,
  getPortalTestsRoute,
  getPortalTestStudyCardRoute,
  startPortalTestAttemptRoute,
} from './test-routes';

export const portalRouter = createRouter()
  .openapi(getPortalMeRoute, getPortalMe)
  .openapi(recordPortalNoticeRoute, recordPortalNotice)
  .openapi(setPortalLanguageRoute, setPortalLanguage)
  .openapi(listPortalTrainingRecordsRoute, listPortalTrainingRecords)
  .openapi(getPortalEmployeeDataRoute, getPortalEmployeeData)
  .openapi(getPortalTrainingSheetsRoute, getPortalTrainingSheets)
  .openapi(getPortalTrainingSheetRoute, getPortalTrainingSheet)
  .openapi(getPortalTrainingSheetLinkRoute, getPortalTrainingSheetLink)
  .openapi(listPortalClientEmployeesRoute, listPortalClientEmployees)
  .openapi(listPortalEmployeeTrainingRecordsRoute, listPortalEmployeeTrainingRecords)
  .openapi(getPortalEmployeeTrainingSheetsRoute, getPortalEmployeeTrainingSheets)
  .openapi(getPortalEmployeeTrainingSheetRoute, getPortalEmployeeTrainingSheet)
  .openapi(getPortalEmployeeTrainingSheetLinkRoute, getPortalEmployeeTrainingSheetLink)
  .openapi(listPortalResponsiblePersonsRoute, listPortalResponsiblePersons)
  .openapi(getPortalTestsRoute, getPortalTests)
  .openapi(getPortalTestStudyCardRoute, getPortalTestStudyCard)
  .openapi(startPortalTestAttemptRoute, startPortalTestAttempt)
  .openapi(answerPortalTestAttemptRoute, answerPortalTestAttempt)
  .openapi(finishPortalTestAttemptRoute, finishPortalTestAttempt)
  .openapi(getPortalMaterialRoute, getPortalMaterial)
  .openapi(getPortalMaterialLinkRoute, getPortalMaterialLink)
  .openapi(getPortalTestSheetRoute, getPortalTestSheet)
  .openapi(getPortalTestSheetLinkRoute, getPortalTestSheetLink);
