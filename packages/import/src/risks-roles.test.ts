import { describe, expect, it } from 'vitest';

import { planRoles } from './risks-roles';

const manager = 'Conducătorul locului de muncă';
const safety = 'Responsabilul SSM și SU';
const external = 'Serviciul extern de prevenire și protecție';

describe('planRoles', () => {
  it.each([
    ['Responsabil SSM,SU; Cond loc munca', `${manager}; ${safety}`],
    ['Cond loc munca', manager],
    ['Cond loc munca; Serv extern', `${manager}; ${external}`],
    ['Conducator loc munca', manager],
    ['Cond. loc munca; Responsabil; SSM,SU', `${manager}; ${safety}`],
  ])('writes the roles of a pack’s plan in full: %s', (written, roles) => {
    expect(planRoles(written)).toBe(roles);
  });

  it.each([
    'cond. loc. munca',
    'COND LOC MUNCA',
    'Conducătorul locului de muncă',
    'Conducător al locului de muncă',
    'Sef loc munca',
    'Șeful locului de muncă',
  ])('knows the workplace manager written as %s', (written) => {
    expect(planRoles(written)).toBe(manager);
  });

  it.each([
    ['Responsabil SSM', 'Responsabilul SSM'],
    ['Resp. SSM', 'Responsabilul SSM'],
    ['responsabil ssm si su', safety],
    ['Responsabil SSM și SU', safety],
    ['Responsabil SU/PSI', 'Responsabilul SU'],
    ['Responsabil PSI', 'Responsabilul SU'],
  ])('knows the safety officer written as %s', (written, role) => {
    expect(planRoles(written)).toBe(role);
  });

  it.each([
    'Serv. extern',
    'Serviciul extern',
    'SEPP',
    'Serviciul extern de prevenire si protectie',
  ])('knows the external service written as %s', (written) => {
    expect(planRoles(written)).toBe(external);
  });

  it('writes each role once, the safety officer’s fields joined', () => {
    expect(
      planRoles('Serv extern; Cond loc munca; Responsabil SSM; Cond. loc muncă; Responsabil SU')
    ).toBe(`${manager}; ${safety}; ${external}`);
  });

  it('keeps what it does not know as written, after the roles', () => {
    expect(planRoles('Administrator; Cond loc munca; Ion POPESCU; administrator')).toBe(
      `${manager}; Administrator; Ion POPESCU`
    );
  });

  it('leaves a value with no known role as it is', () => {
    expect(planRoles('Administrator ;  Ion POPESCU')).toBe('Administrator ;  Ion POPESCU');
    expect(planRoles('Responsabil')).toBe('Responsabil');
    expect(planRoles('Responsabil achiziții')).toBe('Responsabil achiziții');
  });
});
