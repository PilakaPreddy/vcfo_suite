'use client';

/**
 * Timeline editor (prototype cards/TimelineEditor, tl-editor.js), typed-date form.
 *
 * One row per part of the timeline with a date input for the start and the end (one input for a
 * milestone such as the COI), and a bar under it that shows the part on the whole timeline
 * with its old place as a hairline ghost. Moving a part's end past the next part's start pushes
 * the later parts on and keeps their length (cascade). Finished parts are locked. Undo steps
 * back one change; Reset puts every date back.
 *
 *   mode="manager"  saves at once ("Save timeline"), for staff (POST /api/engagements/:id/timeline)
 *   mode="client"   asks for a short reason and sends a change request ("Send request")
 *
 * The parent owns the write: `onSave(parts, reason)` resolves when it is stored.
 */
export interface EditPhase {
  id: string;
  name: string;
  /** YYYY-MM-DD. */
  from: string;
  /** YYYY-MM-DD; the same as `from` for a milestone. */
  to: string;
  /** A finished part is locked. */
  done?: boolean;
  /** A single date (the COI). */
  milestone?: boolean;
}

const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Apply one typed change and push later parts on so none starts before the one before ends. */
export function cascadeEdit(parts: EditPhase[], index: number, field: 'from' | 'to', value: string): EditPhase[] {
  const out = parts.map((p) => ({ ...p }));
  const p = out[index];
  if (!p || p.done || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return parts;
  if (p.milestone) {
    p.from = value;
    p.to = value;
  } else if (field === 'from') {
    const len = ms(p.to) - ms(p.from);
    p.from = value;
    if (ms(p.to) < ms(value)) p.to = iso(ms(value) + Math.max(0, len));
  } else {
    p.to = value < p.from ? p.from : value;
  }
  for (let j = index + 1; j < out.length; j += 1) {
    const prev = out[j - 1]!;
    const q = out[j]!;
    if (q.done || ms(q.from) >= ms(prev.to)) continue;
    const len = ms(q.to) - ms(q.from);
    q.from = prev.to;
    q.to = q.milestone ? q.from : iso(ms(q.from) + len);
  }
  return out;
}

