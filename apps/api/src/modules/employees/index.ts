import { createRouter } from '../../router';
import {
  createEmployee,
  getEmployee,
  listEmployeeInvitees,
  listEmployees,
  listOrganizationEmployees,
  updateEmployee,
  updateEmployeeJobPosition,
  updateEmployeeStatus,
} from './handlers';
import {
  createEmployeeRoute,
  getEmployeeRoute,
  listEmployeeInviteesRoute,
  listEmployeesRoute,
  listOrganizationEmployeesRoute,
  updateEmployeeJobPositionRoute,
  updateEmployeeRoute,
  updateEmployeeStatusRoute,
} from './routes';

export const employeesRouter = createRouter()
  .openapi(listEmployeesRoute, listEmployees)
  .openapi(listEmployeeInviteesRoute, listEmployeeInvitees)
  .openapi(createEmployeeRoute, createEmployee)
  .openapi(getEmployeeRoute, getEmployee)
  .openapi(updateEmployeeRoute, updateEmployee)
  .openapi(updateEmployeeStatusRoute, updateEmployeeStatus)
  .openapi(updateEmployeeJobPositionRoute, updateEmployeeJobPosition)
  .openapi(listOrganizationEmployeesRoute, listOrganizationEmployees);
