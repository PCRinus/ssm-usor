import { createRouter } from '../../router';
import {
  createEmployee,
  getEmployee,
  listEmployees,
  listOrganizationEmployees,
  updateEmployee,
  updateEmployeeJobPosition,
  updateEmployeeStatus,
} from './handlers';
import {
  createEmployeeRoute,
  getEmployeeRoute,
  listEmployeesRoute,
  listOrganizationEmployeesRoute,
  updateEmployeeJobPositionRoute,
  updateEmployeeRoute,
  updateEmployeeStatusRoute,
} from './routes';

export const employeesRouter = createRouter()
  .openapi(listEmployeesRoute, listEmployees)
  .openapi(createEmployeeRoute, createEmployee)
  .openapi(getEmployeeRoute, getEmployee)
  .openapi(updateEmployeeRoute, updateEmployee)
  .openapi(updateEmployeeStatusRoute, updateEmployeeStatus)
  .openapi(updateEmployeeJobPositionRoute, updateEmployeeJobPosition)
  .openapi(listOrganizationEmployeesRoute, listOrganizationEmployees);
