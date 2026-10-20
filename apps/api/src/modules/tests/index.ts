import { createRouter } from '../../router';
import {
  createTestQuestion,
  deleteTestQuestion,
  getEmployeeTests,
  getTestBank,
  getTestSheet,
  hideTestQuestion,
  markTestSheetPaperSignature,
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
  getTestSheetRoute,
  hideTestQuestionRoute,
  markTestSheetPaperSignatureRoute,
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
  .openapi(updateTestResultRoute, updateTestResult)
  .openapi(getTestSheetRoute, getTestSheet)
  .openapi(markTestSheetPaperSignatureRoute, markTestSheetPaperSignature);
