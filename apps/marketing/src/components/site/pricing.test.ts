import {
  billingPlans,
  employeePacks,
  extraMember,
  type PaidPlan,
  smsOverage,
} from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { addOns, compare, type CompareRow, eur, pricedPlans, pricingPage, quote } from './pricing';

const euro = (cents: number) => cents / 100;

const { start, profesional } = billingPlans;
const startPack = employeePacks[start.employeePack];
const profesionalPack = employeePacks[profesional.employeePack];
const startMaxEmployees = start.includedEmployees + start.maxEmployeePacks! * startPack.employees;

function catalogueMonthlyTotal(plan: PaidPlan, employees: number, members: number) {
  const terms = billingPlans[plan];
  const pack = employeePacks[terms.employeePack];
  const packs = Math.ceil(Math.max(0, employees - terms.includedEmployees) / pack.employees);
  const extraMembers = Math.max(0, members - terms.includedMembers);
  return euro(
    terms.prices.month.unitAmount +
      packs * pack.prices.month.unitAmount +
      extraMembers * extraMember.prices.month.unitAmount
  );
}

function cells(label: string) {
  const rows = compare.groups.flatMap<CompareRow>((group) => group.rows);
  return rows.find((row) => row.label === label)?.cells.slice(0, 2);
}

describe('the published prices match the plan catalogue Stripe is set up from', () => {
  it.each(pricedPlans.map((plan) => [plan.id, plan] as const))('%s', (id, plan) => {
    expect(plan.monthly).toBe(euro(billingPlans[id].prices.month.unitAmount));
    expect(plan.annual).toBe(euro(billingPlans[id].prices.year.unitAmount));
  });

  it('the calculator', () => {
    for (let employees = 50; employees <= 2000; employees += 25) {
      for (let members = 1; members <= 6; members += 1) {
        const fitsStart = employees <= startMaxEmployees && members <= start.maxMembers!;
        const expected = Math.min(
          fitsStart ? catalogueMonthlyTotal('start', employees, members) : Infinity,
          catalogueMonthlyTotal('profesional', employees, members)
        );
        expect(quote(employees, members).total, `${employees} employees, ${members} members`).toBe(
          expected
        );
      }
    }
  });

  it('the add-ons', () => {
    expect(addOns.items.map((item) => item.price)).toEqual([
      `${eur(euro(startPack.prices.month.unitAmount))} / lună`,
      `${eur(euro(extraMember.prices.month.unitAmount))} / lună`,
    ]);
  });

  it('the comparison table', () => {
    const sms = eur(euro(smsOverage.price.unitAmount));
    expect(cells('Coduri de semnare prin SMS, pe lună')).toEqual([
      `${start.monthlySms}, apoi ${sms} fiecare`,
      `${profesional.monthlySms}, apoi ${sms} fiecare`,
    ]);
    const grouped = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    expect(cells('Credite pentru importul din documente și fișe')).toEqual([
      `${grouped(start.monthlyCredits)} pe lună + ${grouped(start.welcomeCredits)} la prima plată`,
      `${grouped(profesional.monthlyCredits)} pe lună + ${grouped(profesional.welcomeCredits)} la prima plată`,
    ]);
    expect(cells('Angajați la clienții tăi')).toEqual([
      `Până la ${start.includedEmployees.toLocaleString('ro-RO')}`,
      `Până la ${profesional.includedEmployees.toLocaleString('ro-RO')}`,
    ]);
    expect(cells('Utilizatori')).toEqual([
      String(start.includedMembers),
      String(profesional.includedMembers),
    ]);
    expect(cells('Angajați în plus')).toEqual([
      `${eur(euro(startPack.prices.month.unitAmount))} pentru ${startPack.employees}, până la ${startMaxEmployees}`,
      `${eur(euro(profesionalPack.prices.month.unitAmount))} pentru ${profesionalPack.employees}`,
    ]);
    expect(cells('Utilizator în plus')).toEqual([
      `${eur(euro(extraMember.prices.month.unitAmount))} pe lună, doar unul`,
      `${eur(euro(extraMember.prices.month.unitAmount))} pe lună fiecare`,
    ]);
  });

  it("the FAQ names each plan's pack", () => {
    const answer = pricingPage.faq.find(
      (item) => item.q === 'Ce se întâmplă dacă trec de limită?'
    )?.a;
    expect(answer).toContain(
      `${startPack.employees} pe Start, ${profesionalPack.employees} pe Profesional`
    );
  });
});
