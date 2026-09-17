import { createRouter } from '../../router';
import { createEmployee, getEmployee, listEmployees } from './handlers';
import { createEmployeeRoute, getEmployeeRoute, listEmployeesRoute } from './routes';

export const employeesRouter = createRouter()
  .openapi(listEmployeesRoute, listEmployees)
  .openapi(createEmployeeRoute, createEmployee)
  .openapi(getEmployeeRoute, getEmployee);
