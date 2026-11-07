import { foldText } from '@ssm-usor/contracts';

type Role =
  | { kind: 'workplace_manager' }
  | { kind: 'safety'; ssm: boolean; su: boolean }
  | { kind: 'external_service' };

const workplaceManager =
  /^(?:cond|conducator(?:ul)?|sef(?:ul)?)(?: al)? loc(?:ului)?(?: de)? munca(?: respectiv)?$/u;
const externalService =
  /^(?:sepp|s e p p|serv(?:iciu(?:l)?)? extern(?: (?:de )?(?:prevenire (?:si )?protectie|p ?p|ssm))?)$/u;
const safetyOfficer = /^(?:resp|responsabil(?:ul)?)(?: cu)?((?: (?:ssm|su|psi|si))+)$/u;

function roleOf(written: string): Role | null {
  const folded = foldText(written);
  if (workplaceManager.test(folded)) return { kind: 'workplace_manager' };
  if (externalService.test(folded)) return { kind: 'external_service' };
  const safety = safetyOfficer.exec(folded);
  if (safety) {
    const words = safety[1]!.trim().split(' ');
    const ssm = words.includes('ssm');
    const su = words.includes('su') || words.includes('psi');
    if (ssm || su) return { kind: 'safety', ssm, su };
  }
  return null;
}

// A narrow plan column breaks "Responsabil SSM,SU" over two lines, which reach here as two parts.
function rolesOf(parts: readonly string[]): (Role | string)[] {
  const read: (Role | string)[] = [];
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!;
    const role = roleOf(part);
    if (role) {
      read.push(role);
      continue;
    }
    const joined = index + 1 < parts.length ? roleOf(`${part} ${parts[index + 1]}`) : null;
    if (joined) {
      read.push(joined);
      index++;
      continue;
    }
    read.push(part);
  }
  return read;
}

function safetyName({ ssm, su }: { ssm: boolean; su: boolean }) {
  return `Responsabilul ${ssm && su ? 'SSM și SU' : ssm ? 'SSM' : 'SU'}`;
}

export function planRoles(value: string): string {
  const parts = value
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  const read = rolesOf(parts);
  if (read.every((each) => typeof each === 'string')) return value;
  let manager = false;
  let external = false;
  const safety = { named: false, ssm: false, su: false };
  const others: string[] = [];
  for (const each of read) {
    if (typeof each === 'string') {
      if (!others.some((other) => foldText(other) === foldText(each))) others.push(each);
    } else if (each.kind === 'workplace_manager') manager = true;
    else if (each.kind === 'external_service') external = true;
    else {
      safety.named = true;
      safety.ssm ||= each.ssm;
      safety.su ||= each.su;
    }
  }
  return [
    manager && 'Conducătorul locului de muncă',
    safety.named && safetyName(safety),
    external && 'Serviciul extern de prevenire și protecție',
    ...others,
  ]
    .filter(Boolean)
    .join('; ');
}
