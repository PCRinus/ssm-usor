import { createRouter } from '../../router';
import { lookupCompany } from './handlers';
import { lookupCompanyRoute } from './routes';

export const companiesRouter = createRouter().openapi(lookupCompanyRoute, lookupCompany);
