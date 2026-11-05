'use client';

import type { ReactNode } from 'react';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { EmptyState } from '@/components/ui/empty-state';
import { DevCard, KeyValue, Pending, ReachChip, ReachNotice } from '@/components/dev/parts';
import { bytes, day, stamp } from '@/lib/dev/format';
import type { BackupPlanInfo, Linked, NetworkPayload, RecoveryPointRow, RotationPayload, RotationRow, RotationStatus } from '@/lib/dev/types';

/**
 * The SOC 2 cards of the developer console (M7): Secrets and rotation (Access), the AWS
 * Backup plan inside the Backups card, and Network (Data and costs). Every card shows
 * "Not connected" when the app role cannot read the AWS control, and never a guess.
 * Red appears only for a secret that is past due or a public database.
 */

// ---------- Shared states ----------

function LinkedChip({ reach }: { reach: Linked<unknown> }) {
  if (reach.state === 'not_connected') return <Chip tone="idle">Not connected</Chip>;
  return <ReachChip reach={reach} />;
}

function LinkedNotice({ reach, service }: { reach: Exclude<Linked<unknown>, { state: 'ok' }>; service: string }) {
  if (reach.state === 'not_connected') {
    return (
      <div className="p-4">
        <EmptyState
          title={
            <span className="grid gap-1">
              <span className="font-medium text-ink">{service} is not connected</span>
              <span>The app role has no read access</span>
            </span>
          }
        />
      </div>
    );
  }
  return <ReachNotice reach={reach} service={service} />;
}

// ---------- Secrets and rotation ----------

const ROTATION_CHIP: Record<RotationStatus, { tone: ChipTone; label: string }> = {
  ok: { tone: 'ok', label: 'On time' },
  due_soon: { tone: 'warn', label: 'Due soon' },
  past_due: { tone: 'bad', label: 'Past due' },
  auto: { tone: 'ok', label: 'Auto ✓' },
  auto_off: { tone: 'warn', label: 'Auto off' },
  not_found: { tone: 'idle', label: 'Not found' },
  not_connected: { tone: 'idle', label: 'Not connected' },
  unreachable: { tone: 'warn', label: 'Unreachable' },
};

const LAST_FROM: Record<NonNullable<RotationRow['lastFrom']>, string> = { rotated: 'rotated', changed: 'changed', created: 'created' };

const rotationColumns: EFilingColumn<RotationRow>[] = [
  {
    key: 'name',
    header: 'Secret',
    render: (x) => (
      <span className="block min-w-0">
        <span className="block truncate font-mono text-[13px] font-medium text-ink">{x.name}</span>
        <span className="block truncate text-[12px] text-ink-muted">{x.finding ? `${x.scope} · exception ${x.finding}` : x.scope}</span>
      </span>
    ),
  },
  { key: 'cadence', header: 'Rotation', width: '150px', render: (x) => `${x.mode === 'auto' ? 'Auto' : 'Manual'} · ${x.cadence.replace('Every ', '')}` },
  {
    key: 'last',
    header: 'Last rotated',
    width: '150px',
    render: (x) => (x.lastRotated ? `${day(x.lastRotated)}${x.lastFrom && x.lastFrom !== 'rotated' ? ` (${LAST_FROM[x.lastFrom]})` : ''}` : '-'),
  },
  { key: 'due', header: 'Next due', width: '120px', render: (x) => day(x.dueAt) },
  { key: 'review', header: 'Review', width: '120px', render: (x) => day(x.reviewAt) },
  {
    key: 'status',
    header: 'Status',
    width: '148px',
    render: (x) => (
      <Chip tone={ROTATION_CHIP[x.status].tone} className="w-[124px]">
        <span className="truncate">{ROTATION_CHIP[x.status].label}</span>
      </Chip>
    ),
  },
];

export function SecretsRotationCard({ rotation, error }: { rotation: RotationPayload | undefined; error?: unknown }) {
  const rows = rotation?.rows ?? [];
  const allBlocked = rows.length > 0 && rows.every((r) => r.status === 'not_connected');
  const pastDue = rows.filter((r) => r.status === 'past_due').length;
  const rds = rotation?.rdsAutoRotation;
  return (
    <DevCard
      title="Secrets and rotation"
      meta={rotation && !allBlocked ? (pastDue ? `${pastDue} past due` : 'None past due') : undefined}
      right={allBlocked ? <Chip tone="idle">Not connected</Chip> : null}
    >
      {!rotation ? (
        <Pending error={error} rows={3} />
      ) : allBlocked ? (
        <LinkedNotice reach={{ state: 'not_connected', error: '' }} service="Secrets Manager" />
      ) : (
        <>
          <div className="px-2 pb-2">
            <EFilingGrid columns={rotationColumns} rows={rows} rowKey={(x) => x.key} minWidth={860} stickyFirstColumn />
          </div>
          <div className="border-t border-line-soft">
            {rds?.state === 'ok' ? (
              <KeyValue
                cols={4}
                rows={[
                  { k: 'RDS auto-rotation', v: rds.data.enabled ? 'On ✓' : 'Off' },
                  { k: 'Every', v: rds.data.everyDays ? `${rds.data.everyDays} days` : '-' },
                  { k: 'Next rotation', v: stamp(rds.data.nextAt) },
                  { k: 'Secret status', v: rds.data.status ?? '-' },
                ]}
              />
            ) : rds ? (
              <div className="flex items-center gap-3 px-4 py-3 text-[13px] text-ink-muted">
                <span>RDS auto-rotation</span>
                <LinkedChip reach={rds} />
              </div>
            ) : null}
          </div>
        </>
      )}
    </DevCard>
  );
}

// ---------- AWS Backup plan ----------

const pointColumns: EFilingColumn<RecoveryPointRow>[] = [
  { key: 'at', header: 'Taken', render: (x) => stamp(x.createdAt) },
  { key: 'res', header: 'Resource', width: '180px', render: (x) => <span className="font-mono text-[12.5px]">{x.resource ?? '-'}</span> },
  { key: 'size', header: 'Size', width: '100px', align: 'right', render: (x) => (x.sizeBytes === null ? '-' : bytes(x.sizeBytes)) },
  { key: 'del', header: 'Deleted on', width: '120px', render: (x) => day(x.deleteAt) },
  {
    key: 'status',
    header: 'Status',
    width: '148px',
    render: (x) => (
      <Chip tone={x.status === 'COMPLETED' ? 'ok' : x.status === 'PARTIAL' || x.status === 'EXPIRED' ? 'warn' : 'idle'} className="w-[124px]">
        <span className="truncate">{x.status.charAt(0) + x.status.slice(1).toLowerCase()}</span>
      </Chip>
    ),
  },
];

/** The AWS Backup part of the Backups card: plan, schedule, retention, recent recovery points. */
export function BackupPlanBlock({ plan }: { plan: Linked<BackupPlanInfo> }) {
  return (
    <div className="border-t border-line-soft">
      <div className="flex min-h-[44px] flex-wrap items-center gap-2.5 px-4 py-2">
        <h3 className="text-[14px] font-medium text-ink">AWS Backup</h3>
        {plan.state === 'ok' ? (
          <span className="text-[12.5px] text-ink-muted">
            {plan.data.planName} · {plan.data.scheduleLabel ? `Daily ${plan.data.scheduleLabel}` : (plan.data.schedule ?? '-')} · kept{' '}
            {plan.data.deleteAfterDays ?? '-'} days
          </span>
        ) : null}
        <span className="flex-1" />
        <LinkedChip reach={plan} />
      </div>
      {plan.state === 'ok' ? (
        <div className="px-2 pb-2">
          <EFilingGrid
            columns={pointColumns}
            rows={plan.data.points}
            rowKey={(x) => x.id}
            pageSize={10}
            minWidth={640}
            empty="No recovery points yet"
          />
        </div>
      ) : (
        <LinkedNotice reach={plan} service="AWS Backup" />
      )}
    </div>
  );
}

// ---------- Network ----------

function Item({ label, reach, children }: { label: string; reach: Linked<unknown>; children: ReactNode }) {
  return (
    <div className="flex min-h-[52px] flex-wrap items-center gap-3 border-b border-line-soft px-4 py-2 text-[14px] last:border-b-0">
      <span className="w-[140px] shrink-0 text-ink-muted">{label}</span>
      <span className="min-w-0 flex-1">{reach.state === 'ok' ? children : <LinkedChip reach={reach} />}</span>
    </div>
  );
}

const okWord = (s: string) => ['ACTIVE', 'RUNNING', 'AVAILABLE'].includes(s.toUpperCase());

export function NetworkCard({ network, error }: { network: NetworkPayload | undefined; error?: unknown }) {
  return (
    <DevCard title="Network" meta="Private database path">
      {!network ? (
        <Pending error={error} rows={3} />
      ) : (
        <div>
          <Item label="VPC connector" reach={network.connector}>
            {network.connector.state === 'ok' ? (
              <span className="flex flex-wrap items-center gap-2">
                <Chip tone={okWord(network.connector.data.status) ? 'ok' : 'warn'}>
                  {okWord(network.connector.data.status) ? 'Active ✓' : network.connector.data.status.toLowerCase()}
                </Chip>
                <span className="font-mono text-[12.5px] text-ink-muted">
                  {network.connector.data.name} · {network.connector.data.subnets} subnets · {network.connector.data.securityGroups} security groups
                </span>
              </span>
            ) : null}
          </Item>
          <Item label="NAT" reach={network.nat}>
            {network.nat.state === 'ok' ? (
              network.nat.data.length === 0 ? (
                <Chip tone="warn">None found</Chip>
              ) : (
                <span className="grid gap-1.5">
                  {network.nat.data.map((n) => (
                    <span key={n.id} className="flex flex-wrap items-center gap-2">
                      <Chip tone={okWord(n.state) ? 'ok' : 'warn'}>{okWord(n.state) ? 'Running ✓' : n.state}</Chip>
                      <span className="font-mono text-[12.5px] text-ink-muted">
                        {n.name ?? n.id} · {n.kind === 'instance' ? (n.type ?? 'instance') : 'NAT gateway'}
                      </span>
                    </span>
                  ))}
                </span>
              )
            ) : null}
          </Item>
          <Item label="Database" reach={network.rds}>
            {network.rds.state === 'ok' ? (
              <span className="flex flex-wrap items-center gap-2">
                <Chip tone={network.rds.data.publiclyAccessible ? 'bad' : 'ok'}>
                  {network.rds.data.publiclyAccessible ? 'RDS public ✗' : 'RDS private ✓'}
                </Chip>
                <span className="font-mono text-[12.5px] text-ink-muted">{network.rds.data.instance}</span>
              </span>
            ) : null}
          </Item>
        </div>
      )}
    </DevCard>
  );
}
