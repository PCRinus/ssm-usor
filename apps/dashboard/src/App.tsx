import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from '@ssm-usor/ui/components/card';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';

export default function App() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col justify-center gap-6 px-5 py-12">
      <p className="text-sm font-semibold tracking-widest uppercase">SSM Ușor</p>
      <Card>
        <CardHeader>
          <Badge className="mb-3 bg-accent text-accent-foreground">În dezvoltare</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Spațiul tău de lucru SSM</h1>
          <CardDescription className="leading-relaxed">
            Toți clienții, documentele și termenele tale, într-un singur loc.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            <Label htmlFor="email-preview">Adresă de email</Label>
            <Input
              id="email-preview"
              type="email"
              placeholder="nume@companie.ro"
              aria-describedby="preview-note"
              disabled
            />
          </div>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3">
          <Button disabled>Autentificare în curând</Button>
          <p
            id="preview-note"
            className="text-center text-xs leading-relaxed text-muted-foreground"
          >
            Pregătim accesul la aplicație. Autentificarea nu este încă disponibilă.
          </p>
        </CardFooter>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        Creat în România · Pentru servicii externe SSM
      </p>
    </main>
  );
}
