import { createRouter } from '../../router';
import {
  copyEquipment,
  createEquipmentEntry,
  decideProtectiveEquipment,
  listEquipment,
  listEquipmentSuggestions,
  removeEquipmentEntry,
  updateEquipmentEntry,
} from './handlers';
import {
  copyEquipmentRoute,
  createEquipmentEntryRoute,
  decideProtectiveEquipmentRoute,
  equipmentSuggestionsRoute,
  listEquipmentRoute,
  removeEquipmentEntryRoute,
  updateEquipmentEntryRoute,
} from './routes';

export const protectiveEquipmentRouter = createRouter()
  .openapi(listEquipmentRoute, listEquipment)
  .openapi(createEquipmentEntryRoute, createEquipmentEntry)
  .openapi(copyEquipmentRoute, copyEquipment)
  .openapi(updateEquipmentEntryRoute, updateEquipmentEntry)
  .openapi(removeEquipmentEntryRoute, removeEquipmentEntry)
  .openapi(decideProtectiveEquipmentRoute, decideProtectiveEquipment)
  .openapi(equipmentSuggestionsRoute, listEquipmentSuggestions);
