import { createRouter } from '../../router';
import {
  deleteDutiesAcknowledgementRecord,
  getDutiesAcknowledgement,
  getDutiesAcknowledgementSheet,
  getDutiesAcknowledgementSheetWord,
  recordDutiesAcknowledgement,
} from './handlers';
import {
  deleteDutiesAcknowledgementRecordRoute,
  getDutiesAcknowledgementRoute,
  getDutiesAcknowledgementSheetRoute,
  getDutiesAcknowledgementSheetWordRoute,
  recordDutiesAcknowledgementRoute,
} from './routes';

export const dutiesAcknowledgementsRouter = createRouter()
  .openapi(getDutiesAcknowledgementRoute, getDutiesAcknowledgement)
  .openapi(getDutiesAcknowledgementSheetRoute, getDutiesAcknowledgementSheet)
  .openapi(getDutiesAcknowledgementSheetWordRoute, getDutiesAcknowledgementSheetWord)
  .openapi(recordDutiesAcknowledgementRoute, recordDutiesAcknowledgement)
  .openapi(deleteDutiesAcknowledgementRecordRoute, deleteDutiesAcknowledgementRecord);
