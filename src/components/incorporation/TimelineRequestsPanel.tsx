"use client";

/**
 * Manager / admin side of the client portal's timeline change requests
 * (client portal v7, Home timeline editor "Request a timeline change"):
 * shows pending requests with the proposed dates and Approve / Decline.
 * Approve writes the dates into the engagement schedule.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import type { TimelineRequestDto } from "@/lib/client/client-home";
import { CardHeadTile } from "@/components/common/CardHeadTile";
import { Chip } from "@/components/ui/spectrum-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { plainDay } from "@/lib/date-format";

export function TimelineRequestsPanel({ engagementId, canDecide }: { engagementId: string; canDecide: boolean }) {
  const qc = useQueryClient();
  const key = ["timeline-requests", engagementId];
  const [note, setNote] = useState("");
  const list = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/api/engagements/${encodeURIComponent(engagementId)}/timeline-requests`);
      if (!res.ok) return [] as TimelineRequestDto[];
      return ((await res.json()) as { requests: TimelineRequestDto[] }).requests;
    },
  });
  const decide = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "approve" | "reject" }) => {
      const res = await fetch(
        `/api/engagements/${encodeURIComponent(engagementId)}/timeline-requests/${encodeURIComponent(id)}`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, note: note.trim() || undefined }) },
      );
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not save the decision");
      return decision;
    },
    onSuccess: (decision) => {
      toast.success(decision === "approve" ? "Timeline updated" : "Request declined");
      setNote("");
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["engagements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = (list.data ?? []).filter((r) => r.status === "pending");
  if (pending.length === 0) return null;
  return (
    <section className="surface mb-4 min-w-0 overflow-hidden" aria-label="Client asked for a timeline change">
      <div className="flex min-h-[52px] min-w-0 items-center gap-2.5 border-b border-line-soft px-4 py-2">
        <CardHeadTile title="Timeline change" />
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">Client asked for a timeline change</h2>
        <Chip tone="warn" fixed>
          Waiting
        </Chip>
      </div>
      {pending.map((r) => (
        <div key={r.id} className="space-y-2 border-b border-line-soft px-4 py-3 text-[13px] last:border-0">
          <p className="text-ink-muted">
            {r.requestedByName ?? "Client"}: “{r.reason}”{r.slipDays ? ` · COI moves ${r.slipDays > 0 ? "+" : ""}${r.slipDays} days` : ""}
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {r.phases.map((p) => (
              <li key={p.id} className="tabular-nums text-xs">
                {p.name}: {plainDay(p.from)} → {plainDay(p.to)}
              </li>
            ))}
          </ul>
          {canDecide ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input className="max-w-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the client (optional)" />
              <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, decision: "approve" })}>
                Approve and update the timeline
              </Button>
              <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, decision: "reject" })}>
                Decline
              </Button>
            </div>
          ) : (
            <p className="text-[12.5px] text-ink-muted">With the manager</p>
          )}
        </div>
      ))}
    </section>
  );
}
