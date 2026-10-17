// tsyringe, under @peculiar/x509, needs the Reflect metadata API before the library loads, so
// the library is imported from here only.
import 'reflect-metadata';

import * as x509 from '@peculiar/x509';

x509.cryptoProvider.set(crypto);

export { x509 };
