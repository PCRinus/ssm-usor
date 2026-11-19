import { fireInstallationKindLabels } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent } from '@ssm-usor/ui/components/card';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { Link } from '@tanstack/react-router';
import { MapPin } from 'lucide-react';
import { useState } from 'react';

import {
  getListFireBuildingsQueryKey,
  getListFireEquipmentQueryKey,
  getListFireInstallationsQueryKey,
  getListFireMaintenanceItemsQueryKey,
  getListWorkplacesQueryKey,
  useDeleteFireEquipment,
  useDeleteFireInstallation,
  useDeleteFireMaintenanceItem,
  useListFireBuildings,
  useListFireEquipment,
  useListFireInstallations,
  useListFireMaintenanceItems,
  useListWorkplaces,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { keepOpener } from '@/app/opener';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { Notice } from '@/components/notice';
import { type FireSafetyMeansFocus, useFocusRequest } from '@/features/missing-data/focus';

import { BuildingDialog, type BuildingEditing } from './building-dialog';
import { EquipmentDialog, type EquipmentEditing } from './equipment-dialog';
import {
  equipmentAddId,
  type FireEquipment,
  type FireInstallation,
  type FireMaintenanceItem,
  unitTitle,
} from './fire-means-schema';
import { InstallationDialog, type InstallationEditing } from './installation-dialog';
import { MaintenanceItemDialog, type MaintenanceItemEditing } from './maintenance-item-dialog';
import { SubstancesCard } from './substances-card';
import { WorkplaceMeansCard } from './workplace-means-card';

type Deleting =
  | { what: 'equipment'; unit: FireEquipment }
  | { what: 'installation'; installation: FireInstallation }
  | { what: 'maintenance'; item: FireMaintenanceItem }
  | null;

export function FireSafetyMeansPage({
  clientId,
  currentEmployeeCount,
  readOnly,
  focus,
}: {
  clientId: string;
  currentEmployeeCount: number;
  readOnly: boolean;
  focus?: FireSafetyMeansFocus;
}) {
  const { request, queryClient, key } = useApi();
  const workplaces = useListWorkplaces(clientId, {
    request,
    query: { queryKey: key(getListWorkplacesQueryKey(clientId)) },
  });
  const equipment = useListFireEquipment(clientId, {
    request,
    query: { queryKey: key(getListFireEquipmentQueryKey(clientId)) },
  });
  const installations = useListFireInstallations(clientId, {
    request,
    query: { queryKey: key(getListFireInstallationsQueryKey(clientId)) },
  });
  const maintenanceItems = useListFireMaintenanceItems(clientId, {
    request,
    query: { queryKey: key(getListFireMaintenanceItemsQueryKey(clientId)) },
  });
  const buildings = useListFireBuildings(clientId, {
    request,
    query: { queryKey: key(getListFireBuildingsQueryKey(clientId)) },
  });
  const deleteEquipment = useDeleteFireEquipment({ request });
  const deleteInstallation = useDeleteFireInstallation({ request });
  const deleteMaintenanceItem = useDeleteFireMaintenanceItem({ request });
  const [equipmentEditing, setEquipmentEditing] = useState<EquipmentEditing>(null);
  const [installationEditing, setInstallationEditing] = useState<InstallationEditing>(null);
  const [maintenanceEditing, setMaintenanceEditing] = useState<MaintenanceItemEditing>(null);
  const [buildingEditing, setBuildingEditing] = useState<BuildingEditing>(null);
  const [deleting, setDeleting] = useState<Deleting>(null);
  const [error, setError] = useState<string | null>(null);

  // A registered office where no activity takes place carries no means (ADR 041); what it keeps
  // stays out of sight, as the API's lists leave it out.
  const meansWorkplaces = workplaces.data?.items.filter((workplace) => workplace.officeHasActivity);
  const officeWithoutActivity = workplaces.data?.items.find(
    (workplace) => !workplace.officeHasActivity
  );
  const loaded =
    workplaces.data &&
    equipment.data &&
    installations.data &&
    maintenanceItems.data &&
    buildings.data;
  const withoutExtinguisher = loaded
    ? meansWorkplaces!.find(
        (workplace) =>
          !equipment.data.items.some(
            (unit) => unit.workplaceId === workplace.id && unit.kind === 'extinguisher'
          )
      )
    : undefined;
  useFocusRequest(focus === 'fire-equipment', {
    ready: Boolean(loaded),
    anchor: () =>
      withoutExtinguisher ? document.getElementById(equipmentAddId(withoutExtinguisher.id)) : null,
    open:
      readOnly || !withoutExtinguisher
        ? undefined
        : () => setEquipmentEditing({ workplaceId: withoutExtinguisher.id, unit: null }),
    field: readOnly || !withoutExtinguisher ? undefined : 'fire-equipment-agent',
  });

  const busyDeleting =
    deleteEquipment.isPending || deleteInstallation.isPending || deleteMaintenanceItem.isPending;

  async function confirmDelete(target: NonNullable<Deleting>) {
    setError(null);
    try {
      if (target.what === 'equipment') {
        await deleteEquipment.mutateAsync({ clientId, equipmentId: target.unit.id });
        toast.success('Echipamentul a fost șters.');
      } else if (target.what === 'installation') {
        await deleteInstallation.mutateAsync({
          clientId,
          installationId: target.installation.id,
        });
        toast.success('Instalația a fost ștearsă.');
      } else {
        await deleteMaintenanceItem.mutateAsync({ clientId, itemId: target.item.id });
        toast.success('Verificarea a fost ștearsă.');
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
          : target.what === 'installation'
            ? getListFireInstallationsQueryKey(clientId)
            : getListFireMaintenanceItemsQueryKey(clientId),
    });
  }

  if (
    workplaces.isPending ||
    equipment.isPending ||
    installations.isPending ||
    maintenanceItems.isPending ||
    buildings.isPending
  ) {
    return (
      <div data-testid="fire-means-page" className="grid gap-4">
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (
    workplaces.isError ||
    equipment.isError ||
    installations.isError ||
    maintenanceItems.isError ||
    buildings.isError
  ) {
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
                  void maintenanceItems.refetch();
                  void buildings.refetch();
                }}
              >
                Încearcă din nou
              </Button>
            }
          >
            Nu am putut încărca mijloacele de apărare împotriva incendiilor.
          </Notice>
        </CardContent>
      </Card>
    );
  }

  const substances = (
    <SubstancesCard clientId={clientId} readOnly={readOnly} focus={focus === 'fire-substances'} />
  );

  const activeWorkplaces = meansWorkplaces!;
  const officeNotice = officeWithoutActivity && (
    <Notice
      variant="info"
      data-testid="fire-means-office-without-activity"
      action={
        !readOnly && (
          <Button asChild variant="outline">
            <Link to="/clienti/$clientId/detalii" params={{ clientId }} state={keepOpener}>
              Deschide Detalii
            </Link>
          </Button>
        )
      }
    >
      La sediul social ({officeWithoutActivity.name}) nu se desfășoară activitate, așa că nu are
      mijloace de apărare. Documentele SU îl lasă deoparte. Răspunsul se schimbă în Detalii, la
      Sediu și puncte de lucru.
    </Notice>
  );
  if (activeWorkplaces.length === 0) {
    return (
      <div data-testid="fire-means-page" className="grid gap-4">
        <Card>
          <CardContent>
            <EmptyState
              data-testid="fire-means-no-workplace"
              icon={MapPin}
              actions={
                !readOnly && (
                  <Button asChild>
                    <Link
                      to="/clienti/$clientId/detalii"
                      params={{ clientId }}
                      search={{ focus: 'add-workplace' }}
                      state={keepOpener}
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
        {substances}
      </div>
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
        : deleting.what === 'installation'
          ? fireInstallationKindLabels[deleting.installation.kind]
          : deleting.item.subject;
  const deletingWorkplace = activeWorkplaces.find(
    (workplace) =>
      workplace.id ===
      (deleting?.what === 'equipment'
        ? deleting.unit.workplaceId
        : deleting?.what === 'installation'
          ? deleting.installation.workplaceId
          : deleting?.what === 'maintenance'
            ? deleting.item.workplaceId
            : null)
  );
  const deletingTitles = {
    equipment: 'Ștergi echipamentul?',
    installation: 'Ștergi instalația?',
    maintenance: 'Ștergi verificarea?',
  } as const;

  return (
    <div data-testid="fire-means-page" className="grid gap-4">
      {error && (
        <Notice variant="destructive" data-testid="fire-means-error">
          {error}
        </Notice>
      )}
      {officeNotice}
      {activeWorkplaces.map((workplace) => (
        <WorkplaceMeansCard
          key={workplace.id}
          workplace={workplace}
          equipment={equipment.data.items.filter((unit) => unit.workplaceId === workplace.id)}
          installations={installations.data.items.filter(
            (installation) => installation.workplaceId === workplace.id
          )}
          maintenanceItems={maintenanceItems.data.items.filter(
            (item) => item.workplaceId === workplace.id
          )}
          building={
            buildings.data.items.find((building) => building.workplaceId === workplace.id) ?? null
          }
          currentEmployeeCount={currentEmployeeCount}
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
          onAddMaintenanceItem={() =>
            setMaintenanceEditing({ workplaceId: workplace.id, item: null })
          }
          onEditMaintenanceItem={(item) =>
            setMaintenanceEditing({ workplaceId: workplace.id, item })
          }
          onDeleteMaintenanceItem={(item) => setDeleting({ what: 'maintenance', item })}
          onEditBuilding={() =>
            setBuildingEditing({
              workplace,
              building:
                buildings.data.items.find((building) => building.workplaceId === workplace.id) ??
                null,
            })
          }
        />
      ))}
      {substances}
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
      <MaintenanceItemDialog
        clientId={clientId}
        workplaces={activeWorkplaces}
        editing={maintenanceEditing}
        onClose={() => setMaintenanceEditing(null)}
      />
      <BuildingDialog
        clientId={clientId}
        editing={buildingEditing}
        onClose={() => setBuildingEditing(null)}
      />
      {deleting && (
        <ConfirmDialog
          open
          busy={busyDeleting}
          testId="fire-means-delete"
          title={deletingTitles[deleting.what]}
          confirmLabel="Șterge"
          pendingLabel="Se șterge…"
          onConfirm={() => void confirmDelete(deleting)}
          onClose={() => setDeleting(null)}
        >
          <span className="font-medium text-foreground">{deletingName}</span>
          {deletingWorkplace && ` de la ${deletingWorkplace.name}`} nu va mai apărea în documentele
          SU generate de acum înainte.
          {lastExtinguisher &&
            ' Este singurul stingător al locului de muncă: fără el, documentele SU nu se pot genera.'}
        </ConfirmDialog>
      )}
    </div>
  );
}
