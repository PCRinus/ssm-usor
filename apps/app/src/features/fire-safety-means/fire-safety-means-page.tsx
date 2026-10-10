import { fireInstallationKindLabels } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent } from '@ssm-usor/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { Link, useRouteContext } from '@tanstack/react-router';
import { MapPin } from 'lucide-react';
import { useState } from 'react';

import {
  getListFireEquipmentQueryKey,
  getListFireInstallationsQueryKey,
  getListWorkplacesQueryKey,
  useDeleteFireEquipment,
  useDeleteFireInstallation,
  useListFireEquipment,
  useListFireInstallations,
  useListWorkplaces,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { EmptyState } from '@/components/empty-state';
import { Notice } from '@/components/notice';
import { useFocusRequest } from '@/features/missing-data/focus';

import { EquipmentDialog, type EquipmentEditing } from './equipment-dialog';
import {
  equipmentAddId,
  type FireEquipment,
  type FireInstallation,
  unitTitle,
} from './fire-means-schema';
import { InstallationDialog, type InstallationEditing } from './installation-dialog';
import { WorkplaceMeansCard } from './workplace-means-card';

type Deleting =
  | { what: 'equipment'; unit: FireEquipment }
  | { what: 'installation'; installation: FireInstallation }
  | null;

export function FireSafetyMeansPage({
  clientId,
  userId,
  readOnly,
  focus,
}: {
  clientId: string;
  userId: string;
  readOnly: boolean;
  focus: boolean;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const workplaces = useListWorkplaces(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListWorkplacesQueryKey(clientId), userId] },
  });
  const equipment = useListFireEquipment(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListFireEquipmentQueryKey(clientId), userId] },
  });
  const installations = useListFireInstallations(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListFireInstallationsQueryKey(clientId), userId] },
  });
  const deleteEquipment = useDeleteFireEquipment({ request: apiRequest });
  const deleteInstallation = useDeleteFireInstallation({ request: apiRequest });
  const [equipmentEditing, setEquipmentEditing] = useState<EquipmentEditing>(null);
  const [installationEditing, setInstallationEditing] = useState<InstallationEditing>(null);
  const [deleting, setDeleting] = useState<Deleting>(null);
  const [error, setError] = useState<string | null>(null);

  const loaded = workplaces.data && equipment.data && installations.data;
  const withoutExtinguisher = loaded
    ? workplaces.data.items.find(
        (workplace) =>
          !equipment.data.items.some(
            (unit) => unit.workplaceId === workplace.id && unit.kind === 'extinguisher'
          )
      )
    : undefined;
  useFocusRequest(focus, {
    ready: Boolean(loaded),
    anchor: () =>
      withoutExtinguisher ? document.getElementById(equipmentAddId(withoutExtinguisher.id)) : null,
    open:
      readOnly || !withoutExtinguisher
        ? undefined
        : () => setEquipmentEditing({ workplaceId: withoutExtinguisher.id, unit: null }),
    field: readOnly || !withoutExtinguisher ? undefined : 'fire-equipment-agent',
  });

  const busyDeleting = deleteEquipment.isPending || deleteInstallation.isPending;

  async function confirmDelete(target: NonNullable<Deleting>) {
    setError(null);
    try {
      if (target.what === 'equipment') {
        await deleteEquipment.mutateAsync({ clientId, equipmentId: target.unit.id });
        toast.success('Echipamentul a fost șters.');
      } else {
        await deleteInstallation.mutateAsync({
          clientId,
          installationId: target.installation.id,
        });
        toast.success('Instalația a fost ștearsă.');
      }
    } catch (cause) {
      const status = cause instanceof ApiHttpError ? cause.status : null;
      setError(
        status === 404
          ? 'Mijlocul nu mai există la acest client; lista a fost reîncărcată.'
          : status === 409
            ? 'Clientul este arhivat; datele lui nu se mai schimbă.'
            : 'Nu am putut șterge. Verifică conexiunea și încearcă din nou.'
      );
    }
    setDeleting(null);
    // Also after a failure: a 404 means the list on screen is out of date.
    await queryClient.invalidateQueries({
      queryKey:
        target.what === 'equipment'
          ? getListFireEquipmentQueryKey(clientId)
          : getListFireInstallationsQueryKey(clientId),
    });
  }

  if (workplaces.isPending || equipment.isPending || installations.isPending) {
    return (
      <div data-testid="fire-means-page" className="grid gap-6">
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (workplaces.isError || equipment.isError || installations.isError) {
    return (
      <Card data-testid="fire-means-page">
        <CardContent>
          <Notice
            variant="destructive"
            action={
              <Button
                variant="outline"
                onClick={() => {
                  void workplaces.refetch();
                  void equipment.refetch();
                  void installations.refetch();
                }}
              >
                Încearcă din nou
              </Button>
            }
          >
            Nu am putut încărca mijloacele PSI.
          </Notice>
        </CardContent>
      </Card>
    );
  }

  const activeWorkplaces = workplaces.data.items;
  if (activeWorkplaces.length === 0) {
    return (
      <Card data-testid="fire-means-page">
        <CardContent>
          <EmptyState
            data-testid="fire-means-no-workplace"
            icon={MapPin}
            actions={
              !readOnly && (
                <Button asChild variant="tonal">
                  <Link
                    to="/clients/$clientId/details"
                    params={{ clientId }}
                    search={{ focus: 'add-workplace' }}
                  >
                    Adaugă un loc de muncă
                  </Link>
                </Button>
              )
            }
          >
            Stingătoarele și instalațiile se trec pe locuri de muncă. Clientul nu are încă niciun
            loc de muncă; îl adaugi în Detalii, la Sediu și puncte de lucru.
          </EmptyState>
        </CardContent>
      </Card>
    );
  }

  const lastExtinguisher =
    deleting?.what === 'equipment' &&
    deleting.unit.kind === 'extinguisher' &&
    equipment.data.items.filter(
      (unit) => unit.workplaceId === deleting.unit.workplaceId && unit.kind === 'extinguisher'
    ).length === 1;
  const deletingName =
    deleting === null
      ? ''
      : deleting.what === 'equipment'
        ? unitTitle(deleting.unit)
        : fireInstallationKindLabels[deleting.installation.kind];
  const deletingWorkplace = activeWorkplaces.find(
    (workplace) =>
      workplace.id ===
      (deleting?.what === 'equipment'
        ? deleting.unit.workplaceId
        : deleting?.what === 'installation'
          ? deleting.installation.workplaceId
          : null)
  );

  return (
    <div data-testid="fire-means-page" className="grid gap-6">
      {error && (
        <Notice variant="destructive" data-testid="fire-means-error">
          {error}
        </Notice>
      )}
      {activeWorkplaces.map((workplace) => (
        <WorkplaceMeansCard
          key={workplace.id}
          workplace={workplace}
          equipment={equipment.data.items.filter((unit) => unit.workplaceId === workplace.id)}
          installations={installations.data.items.filter(
            (installation) => installation.workplaceId === workplace.id
          )}
          readOnly={readOnly}
          onAddEquipment={() => setEquipmentEditing({ workplaceId: workplace.id, unit: null })}
          onEditEquipment={(unit) => setEquipmentEditing({ workplaceId: workplace.id, unit })}
          onDeleteEquipment={(unit) => setDeleting({ what: 'equipment', unit })}
          onAddInstallation={() =>
            setInstallationEditing({ workplaceId: workplace.id, installation: null })
          }
          onEditInstallation={(installation) =>
            setInstallationEditing({ workplaceId: workplace.id, installation })
          }
          onDeleteInstallation={(installation) =>
            setDeleting({ what: 'installation', installation })
          }
        />
      ))}
      <EquipmentDialog
        clientId={clientId}
        workplaces={activeWorkplaces}
        editing={equipmentEditing}
        onClose={() => setEquipmentEditing(null)}
      />
      <InstallationDialog
        clientId={clientId}
        workplaces={activeWorkplaces}
        editing={installationEditing}
        onClose={() => setInstallationEditing(null)}
      />
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !open && !busyDeleting && setDeleting(null)}
      >
        {deleting && (
          <DialogContent data-testid="fire-means-delete-dialog" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {deleting.what === 'equipment' ? 'Ștergi echipamentul?' : 'Ștergi instalația?'}
              </DialogTitle>
              <DialogDescription>
                <span className="font-medium text-foreground">{deletingName}</span>
                {deletingWorkplace && ` de la ${deletingWorkplace.name}`} nu va mai apărea în
                documentele PSI generate de acum înainte.
                {lastExtinguisher &&
                  ' Este singurul stingător al locului de muncă: fără el, documentele PSI nu se pot genera.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-2">
              <Button variant="ghost" disabled={busyDeleting} onClick={() => setDeleting(null)}>
                Renunță
              </Button>
              <Button
                variant="destructive"
                data-testid="fire-means-delete-confirm"
                disabled={busyDeleting}
                onClick={() => void confirmDelete(deleting)}
              >
                {busyDeleting ? 'Se șterge…' : 'Șterge'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
