import { createRouter } from '../../router';
import {
  createEmployee,
  getEmployee,
  listEmployees,
  updateEmployeeJobPosition,
  updateEmployeeStatus,
} from './handlers';
import {
  createEmployeeRoute,
  getEmployeeRoute,
  listEmployeesRoute,
  updateEmployeeJobPositionRoute,
  updateEmployeeStatusRoute,
} from './routes';

export const employeesRouter = createRouter()
  .openapi(listEmployeesRoute, listEmployees)
  .openapi(createEmployeeRoute, createEmployee)
  .openapi(getEmployeeRoute, getEmployee)
  .openapi(updateEmployeeStatusRoute, updateEmployeeStatus)
  .openapi(updateEmployeeJobPositionRoute, updateEmployeeJobPosition);
