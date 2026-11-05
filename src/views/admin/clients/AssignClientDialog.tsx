'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PersonAvatar } from '@/views/admin/firm-people/parts';
import type { Engagement, TaskInstance } from '@/data/engagements';
import { errorMessage, toastError, toastSuccess } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';

/** PATCH /api/engagements/:id with the new manager (admin and super admin only; the route checks). */
export async function assignManagerInDb(engagementId: string, managerId: string): Promise<void> {
  const res = await fetch(`/api/engagements/${encodeURIComponent(engagementId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ managerId }),
  });
  const out = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(out.error || 'Could not assign the manager');
}

/** Each manager's load: clients, open tasks on those clients, and clients marked overdue. */
function managerLoad(managerId: string, engagements: Engagement[], tasks: TaskInstance[]) {
  const mine = engagements.filter((e) => (e.managerId ?? e.adminId) === managerId);
  const ids = new Set(mine.map((e) => e.id));
  const open = tasks.filter((t) => ids.has(t.engagementId) && t.status !== 'completed' && t.status !== 'not-applicable').length;
  return { clients: mine.length, open, late: mine.filter((e) => e.health === 'overdue').length };
}

/**
 * "Assign a client to a manager" (prototype `AssignDialog`, mode client): a client select and the
 * managers as radio cards with a 30px face and "n clients · n open · n late". Assign moves the
 * client to the picked manager through the engagement route, which admits only a firm-wide
 * admin, then the engagement list refetches.
 */
export function AssignClientDialog({
  open,
  onOpenChange,
  engagements,
  tasks,
  managers,
  clientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  engagements: Engagement[];
  tasks: TaskInstance[];
  managers: Array<{ id: string; name: string }>;
  /** Preselect this client (a row's Reassign). */
  clientId?: string | null;
}) {
  const queryClient = useQueryClient();
  const sorted = useMemo(() => [...engagements].sort((a, b) => a.companyName.localeCompare(b.companyName)), [engagements]);
  const [cid, setCid] = useState('');
  const [mgr, setMgr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const id = clientId ?? sorted[0]?.id ?? '';
    setCid(id);
    setMgr(sorted.find((e) => e.id === id)?.managerId ?? '');
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId]);

  const cur = sorted.find((e) => e.id === cid);
  const managerName = (id: string | undefined) => managers.find((m) => m.id === id)?.name ?? 'no manager';

  async function submit() {
    if (!cur || !mgr) return;
    setSaving(true);
    try {
      await assignManagerInDb(cur.id, mgr);
      await queryClient.invalidateQueries({ queryKey: ['engagements'] });
      toastSuccess(`${cur.companyName} is now with ${managerName(mgr)}`);
      onOpenChange(false);
    } catch (err) {
      toastError('Could not assign the client', errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Assign a client to a manager</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="assign-client">Client</Label>
            <Select
              value={cid}
              onValueChange={(v) => {
                setCid(v);
                setMgr(sorted.find((e) => e.id === v)?.managerId ?? '');
              }}
            >
              <SelectTrigger id="assign-client" aria-label="Client">
                <SelectValue placeholder="Pick a client" />
              </SelectTrigger>
              <SelectContent>
                {sorted.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.companyName} · {managerName(e.managerId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-[12.5px] font-medium text-ink-muted">Manager</legend>
            {managers.length === 0 ? <p className="text-[13px] text-ink-muted">No managers yet</p> : null}
            <div role="radiogroup" aria-label="Manager" className="grid max-h-[320px] gap-2 overflow-y-auto">
              {managers.map((m) => {
                const load = managerLoad(m.id, engagements, tasks);
                return (
                  <label
                    key={m.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-md border-1.5 px-3 py-2.5',
                      mgr === m.id ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-sunken',
                    )}
                  >
                    <input
                      type="radio"
                      name="assign-manager"
                      value={m.id}
                      checked={mgr === m.id}
                      onChange={() => setMgr(m.id)}
                      className="accent-brand"
                    />
                    <PersonAvatar name={m.name} size={30} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[14px] font-medium text-ink">{m.name}</b>
                      <span className="block text-[12.5px] tabular-nums text-ink-muted">
                        {load.clients} {load.clients === 1 ? 'client' : 'clients'} · {load.open} open · {load.late} late
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!cur || !mgr || saving || mgr === cur?.managerId}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
