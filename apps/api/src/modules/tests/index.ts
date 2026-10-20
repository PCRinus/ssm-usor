import { createRouter } from '../../router';
import {
  createTestQuestion,
  deleteTestQuestion,
  getEmployeeTests,
  getTestBank,
  hideTestQuestion,
  recordPaperTestResult,
  restoreTestQuestion,
  updateTestQuestion,
  updateTestResult,
} from './handlers';
import {
  createTestQuestionRoute,
  deleteTestQuestionRoute,
  getEmployeeTestsRoute,
  getTestBankRoute,
  hideTestQuestionRoute,
  recordPaperTestResultRoute,
  restoreTestQuestionRoute,
  updateTestQuestionRoute,
  updateTestResultRoute,
} from './routes';

export const testsRouter = createRouter()
  .openapi(getTestBankRoute, getTestBank)
  .openapi(createTestQuestionRoute, createTestQuestion)
  .openapi(updateTestQuestionRoute, updateTestQuestion)
  .openapi(deleteTestQuestionRoute, deleteTestQuestion)
  .openapi(hideTestQuestionRoute, hideTestQuestion)
  .openapi(restoreTestQuestionRoute, restoreTestQuestion)
  .openapi(getEmployeeTestsRoute, getEmployeeTests)
  .openapi(recordPaperTestResultRoute, recordPaperTestResult)
  .openapi(updateTestResultRoute, updateTestResult);
