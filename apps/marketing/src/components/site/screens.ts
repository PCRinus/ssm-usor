import dashboard from '../../assets/screens/dashboard.png';
import documents from '../../assets/screens/documents.png';
import employees from '../../assets/screens/employees.png';
import legislation from '../../assets/screens/legislation.png';
import phoneDashboard from '../../assets/screens/phone-dashboard.png';
import phonePortalHome from '../../assets/screens/phone-portal-home.png';
import phonePortalSign from '../../assets/screens/phone-portal-sign.png';
import phonePortalTest from '../../assets/screens/phone-portal-test.png';
import riskLibrary from '../../assets/screens/risk-library.png';
import signatures from '../../assets/screens/signatures.png';

export const screens = {
  dashboard,
  documents,
  employees,
  legislation,
  phoneDashboard,
  phonePortalHome,
  phonePortalSign,
  phonePortalTest,
  riskLibrary,
  signatures,
};

export type ScreenName = keyof typeof screens;
