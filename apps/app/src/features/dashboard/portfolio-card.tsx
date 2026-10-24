import type { DashboardSummary } from '@ssm-usor/contracts';
import { Tooltip, TooltipContent, TooltipTrigger } from '@ssm-usor/ui/components/tooltip';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';

import { countOf, monthOf, nounFor } from './dashboard-format';
import { focusRing, numberClass } from './dashboard-item';
import { dashboardLinks } from './dashboard-links';
import { cardClass, headingClass } from './dashboard-section';

const statClass = cn(
  'flex flex-col gap-[3px] rounded-[10px] text-[12.5px] text-muted-foreground hover:text-foreground sm:text-[13px]',
  focusRing
);

function employeesLine(
  employees: number,
  months: DashboardSummary['portfolio']['employeesAtMonthEnds']
) {
  const noun = nounFor(employees, 'angajat', 'angajați');
  const last = months.at(-1);
  const previous = months.at(-2);
  if (!last || !previous) return noun;
  const delta = last.employees - previous.employees;
  if (delta === 0) return noun;
  return `${noun}, ${delta > 0 ? '+' : '−'}${Math.abs(delta)} față de ${monthOf(previous.month).name}`;
}

export function PortfolioCard({
  portfolio,
  alone,
}: {
  portfolio: DashboardSummary['portfolio'];
  alone: boolean;
}) {
  const months = portfolio.employeesAtMonthEnds;
  const highest = Math.max(0, ...months.map((month) => month.employees));
  const first = months.at(0);
  const last = months.at(-1);
  return (
    <section
      aria-labelledby="dashboard-portfolio"
      data-testid="dashboard-portfolio"
      className={cn(
        cardClass,
        'flex flex-col gap-3 p-4 sm:gap-3.5 sm:px-5 sm:pt-[18px] sm:pb-5',
        alone && 'max-w-[560px]'
      )}
    >
      <h2 id="dashboard-portfolio" className={headingClass}>
        Portofoliu
      </h2>
      <div className="flex flex-wrap gap-x-7 gap-y-3 sm:gap-x-8">
        <Link
          {...dashboardLinks.clients()}
          className={statClass}
          data-testid="dashboard-portfolio-clients"
        >
          <span className={cn(numberClass, 'text-[22px] text-foreground sm:text-2xl')}>
            {portfolio.activeClients}
          </span>{' '}
          {nounFor(portfolio.activeClients, 'client activ', 'clienți activi')}
        </Link>
        <Link
          {...dashboardLinks.employees()}
          className={statClass}
          data-testid="dashboard-portfolio-employees"
        >
          <span className={cn(numberClass, 'text-[22px] text-foreground sm:text-2xl')}>
            {portfolio.employees}
          </span>{' '}
          {employeesLine(portfolio.employees, months)}
        </Link>
      </div>
      {first && last && (
        <div className="flex flex-col gap-2">
          <p className="text-[12.5px] text-muted-foreground sm:text-[13px]">
            Angajați în ultimele 12 luni
          </p>
          <div
            role="img"
            aria-label={`Angajați în ultimele 12 luni, de la ${first.employees} în ${monthOf(first.month).name} ${monthOf(first.month).year} la ${last.employees} în ${monthOf(last.month).name} ${monthOf(last.month).year}`}
            className="grid h-14 grid-cols-12 items-end gap-1 sm:h-16 sm:gap-[5px]"
          >
            {months.map((month, index) => {
              const { name, year } = monthOf(month.month);
              const current = index === months.length - 1;
              return (
                <Tooltip key={month.month}>
                  <TooltipTrigger asChild>
                    <span
                      data-testid="dashboard-portfolio-bar"
                      className={cn(
                        'min-h-1 rounded-t-[4px] rounded-b-[2px]',
                        current ? 'bg-brand-forest' : 'bg-dashboard-bar'
                      )}
                      style={{ height: highest > 0 ? `${(month.employees / highest) * 100}%` : 0 }}
                    />
                  </TooltipTrigger>
                  <TooltipContent>{`${name} ${year}: ${countOf(month.employees, 'angajat', 'angajați')}`}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          <div
            aria-hidden="true"
            className="grid grid-cols-12 gap-1 text-center text-[10px] text-muted-foreground sm:gap-[5px] sm:text-[11.5px]"
          >
            {months.map((month, index) => (
              <span
                key={month.month}
                className={cn(index === months.length - 1 && 'font-semibold text-foreground')}
              >
                {monthOf(month.month).short}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
