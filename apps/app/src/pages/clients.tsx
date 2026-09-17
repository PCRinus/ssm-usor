import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ssm-usor/ui/components/table';
import { Plus, Users } from 'lucide-react';

export function ClientsPage() {
  return (
    <div data-testid="clients-page" className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Clienți</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Companiile cu care lucrezi și informațiile lor de contact.
          </p>
        </div>
        <Button disabled aria-describedby="clients-development">
          <Plus aria-hidden="true" />
          Adaugă client
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
          <h2 className="text-sm font-medium">Lista clienților</h2>
          <Badge variant="secondary">În pregătire</Badge>
        </div>
        <Table data-testid="clients-table" aria-label="Lista clienților">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Companie</TableHead>
              <TableHead>CUI</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-5 text-right">Acțiuni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="h-72 px-5 text-center whitespace-normal">
                <Users className="mx-auto mb-4 size-8 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-base font-medium">Aici vei găsi clienții tăi</h3>
                <p
                  id="clients-development"
                  className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground"
                >
                  Pregătim lista și formularul de adăugare. Vei putea accesa detaliile fiecărei
                  companii de aici.
                </p>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
