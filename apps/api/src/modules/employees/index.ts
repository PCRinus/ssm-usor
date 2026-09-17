import { createRouter } from '../../router';
import { createEmployee, getEmployee, listEmployees, updateEmployeeStatus } from './handlers';
import {
  createEmployeeRoute,
  getEmployeeRoute,
  listEmployeesRoute,
  updateEmployeeStatusRoute,
} from './routes';

export const employeesRouter = createRouter()
  .openapi(listEmployeesRoute, listEmployees)
  .openapi(createEmployeeRoute, createEmployee)
  .openapi(getEmployeeRoute, getEmployee)
  .openapi(updateEmployeeStatusRoute, updateEmployeeStatus);
