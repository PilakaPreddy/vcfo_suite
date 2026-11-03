"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  adminProjectPath,
  adminProjectStepPath,
  internEngagementPath,
  internEngagementStepPath,
} from "@/lib/projects/project-step-path";
import { useStaffBasePath } from "@/hooks/use-staff-base-path";
import { useAskOptional } from "@/components/ask/ask-context";
import { roleAskPath } from "@/lib/auth-routes";
import { internVisibleDocuments } from "@/lib/documents/document-access";
import {
  formatKnowledgeBankCommandHit,
  knowledgeBankFileMatchesQuery,
  knowledgeBankFilesFromResponse,
} from "@/lib/knowledge-bank/knowledge-bank-search";
import {
  collectIndexedVaultDocuments,
  collectVaultDocuments,
  formatVaultCommandHit,
  mergeVaultDocuments,
  scopeVaultDocumentsToEngagements,
  vaultFileNameMatches,
  type IndexedDocumentRow,
} from "@/lib/documents/vault-documents";
import type { Role } from "@/lib/auth";
import { getActiveCatalogItems, coerceStatusCode, type StatusCode } from "@/data/checklist";
import { complianceEngagementsForRole } from "@/lib/compliance/incorporation-state";
import { registrationRows } from "@/views/compliances/registration-rows";
import {
  REG_LABEL,
  SEARCH_GROUPS,
  STATUS_ORDER,
  complianceBaseForRole,
  matchesQuery,
  regLabelOf,
  type SearchGroup,
  type SearchHit,
} from "@/lib/search/staff-search";
import { FilterChip, FilterChipRow, type FilterOption } from "@/components/ui/filter-chip";
import { Kbd } from "@/components/ui/kbd";
import { Tip } from "@/components/ui/tip";
import { cn } from "@/lib/utils";

/* Q3 (VCFO Spectrum, prototype Palette): Ctrl K opens a centred 600px search dialog on a scrim.
   Filter chips under the field (Regulator, Status, Client) narrow the results; a hit without the
   chip's field hides while that chip is set. Groups follow the prototype: clients, steps, filings,
   obligations, registrations, documents, knowledge bank, pages. ↑ ↓ move, Enter opens, Esc closes.

   Every source is already scoped by the caller's AuthContext: clients, steps and registrations
   come from the roster and checklist state `useApp()` loaded for this person; filings and
   obligations from `GET /api/search` (the scoped register); documents and knowledge bank files
   from `/api/documents` and `/api/knowledge-bank`, as before. */

const HEALTH_WORD: Record<string, string> = { "on-track": "In progress", "at-risk": "Due soon", overdue: "Overdue" };
const STEP_WORD: Partial<Record<StatusCode, string>> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  "awaiting-client": "Waiting",
  overdue: "Overdue",
  completed: "Done",
};

/** The 8px status square per six-word status (tokens only). */
const SQUARE: Record<string, string> = {
  "Not started": "bg-upcoming-mid",
  "In progress": "bg-brand",
  Waiting: "bg-waiting-mid",
  "Due soon": "bg-warning-mid",
  Overdue: "bg-danger-mid",
  Done: "bg-positive-mid",
};

const PER_GROUP = 6;

type PageLink = { label: string; href: string };

/** The role's page shortcuts, kept from the earlier palette. They are the Pages group. */
function pagesForRole(role: Role | undefined): PageLink[] {
  switch (role) {
    case "super_admin":
      return [
        { label: "Overview", href: "/app/super/dashboard" },
        { label: "New project", href: "/app/admin/projects/new" },
        { label: "Announcements", href: "/app/super/announcements" },
        { label: "Notification history", href: "/app/super/notifications" },
        { label: "Compliance calendar", href: "/app/admin/compliances/calendar" },
        { label: "Filings", href: "/app/admin/compliances/filings" },
      ];
    case "admin":
      return [
        { label: "Home", href: "/app/admin/dashboard" },
        { label: "Announcements", href: "/app/admin/announcements" },
        { label: "Notification history", href: "/app/admin/notifications" },
        { label: "People", href: "/app/admin/people" },
        { label: "Send email", href: "/app/admin/mail" },
        { label: "Approvals", href: "/app/admin/approvals" },
        { label: "Compliance calendar", href: "/app/admin/compliances/calendar" },
        { label: "Filings", href: "/app/admin/compliances/filings" },
        { label: "Document vault", href: "/app/admin/vault" },
        { label: "Knowledge Bank", href: "/app/admin/knowledge-bank" },
        { label: "Analytics", href: "/app/admin/analytics" },
        { label: "Audit log", href: "/app/admin/audit-log" },
        { label: "New project", href: "/app/admin/projects/new" },
      ];
    case "manager":
      return [
        { label: "Dashboard", href: "/app/manager/dashboard" },
        { label: "Announcements", href: "/app/manager/announcements" },
        { label: "Notification history", href: "/app/manager/notifications" },
        { label: "GCC setup projects", href: "/app/manager/projects" },
        { label: "Approvals", href: "/app/manager/approvals" },
        { label: "People", href: "/app/manager/people" },
        { label: "Send email", href: "/app/manager/mail" },
        { label: "Compliance calendar", href: "/app/manager/compliances/calendar" },
        { label: "Filings", href: "/app/manager/compliances/filings" },
        { label: "Document vault", href: "/app/manager/vault" },
        { label: "Knowledge Bank", href: "/app/manager/knowledge-bank" },
        { label: "Analytics", href: "/app/manager/analytics" },
        { label: "New project", href: "/app/manager/projects/new" },
        { label: "Project leads", href: "/app/manager/team" },
      ];
    case "intern":
      return [
        { label: "Today", href: "/app/intern/today" },
        { label: "My work", href: "/app/intern/tasks" },
        { label: "Clients", href: "/app/intern/clients" },
        { label: "Document vault", href: "/app/intern/vault" },
        { label: "Announcements", href: "/app/intern/announcements" },
        { label: "Notification history", href: "/app/intern/notifications" },
        { label: "Send email", href: "/app/intern/mail" },
        { label: "Analytics", href: "/app/intern/analytics" },
        { label: "Compliance calendar", href: "/app/intern/compliances/calendar" },
        { label: "Filings", href: "/app/intern/compliances/filings" },
        { label: "Audit log", href: "/app/intern/audit-log" },
        { label: "Knowledge Bank", href: "/app/intern/knowledge-bank" },
      ];
    case "client":
      return [
        { label: "Home", href: "/app/client/overview" },
        { label: "Announcements", href: "/app/client/announcements" },
        { label: "Notification history", href: "/app/client/notifications" },
        { label: "Incorporation", href: "/app/client/incorporation" },
        { label: "Compliance calendar", href: "/app/client/compliances/calendar" },
        { label: "Filings", href: "/app/client/compliances/filings" },
        { label: "Documents", href: "/app/client/documents" },
      ];
    case "developer":
      return [
        { label: "Overview", href: "/app/dev/overview" },
        { label: "Connections", href: "/app/dev/connections" },
        { label: "Jobs", href: "/app/dev/jobs" },
        { label: "Logs", href: "/app/dev/logs" },
        { label: "Messages", href: "/app/dev/messages" },
        { label: "Deploys", href: "/app/dev/deploys" },
        { label: "Access", href: "/app/dev/access" },
        { label: "Data and costs", href: "/app/dev/data" },
        { label: "Audit", href: "/app/dev/audit" },
      ];
    case "partner":
      // A client partner never gets the /app shell, so there is nothing to jump to.
      return [];
    default:
      return [];
  }
}

/** The regulator of a vault file from its step, section or phase, or undefined when none is clear. */
function documentRegulator(doc: { section: string; milestoneTitle: string; bucket: string }): string | undefined {
  return regLabelOf(doc.section, doc.milestoneTitle) ?? (doc.bucket.toLowerCase().includes("fema") ? REG_LABEL.fema : undefined);
}

function staffLibraryPaths(role: Role | undefined, staffBase: string) {
  if (role === "intern") {
    return { vault: "/app/intern/vault", kb: "/app/intern/knowledge-bank" };
  }
  return { vault: `${staffBase}/vault`, kb: `${staffBase}/knowledge-bank` };
}

const opts = (xs: readonly string[]): FilterOption[] => xs.map((x) => ({ value: x, label: x }));

const STAFF_SEARCH_ROLES = new Set<Role>(["super_admin", "admin", "manager", "intern"]);

/** A filter chip's menu sits in a portal outside the dialog; clicks and keys there belong to the menu. */
function inChipMenu(t: EventTarget | null) {
  return t instanceof Element && !!t.closest("[data-radix-popper-content-wrapper], [role=menu]");
}

export function CommandPalette() {
  const { commandOpen, setCommandOpen, user, engagements, getStateForEngagement } = useApp();
  const router = useRouter();
  const staffBase = useStaffBasePath();
  const askOn = Boolean(useAskOptional()?.enabled);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const [cur, setCur] = useState(0);
  const [vaultHits, setVaultHits] = useState<SearchHit[]>([]);
  const [kbHits, setKbHits] = useState<SearchHit[]>([]);
  const [regFilter, setRegFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [mounted, setMounted] = useState(false);
  const role = user?.role;
  const isClient = role === "client";
  const canSearchLibraries = role === "intern" || role === "manager" || role === "admin";
  const libraryPaths = staffLibraryPaths(role, staffBase);
  const q = query.trim();

  useEffect(() => setMounted(true), []);

  // Ctrl K and Cmd K open and close the search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(!commandOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen, setCommandOpen]);

  useEffect(() => {
    if (!commandOpen) {
      setQuery("");
      setRegFilter("");
      setStatusFilter("");
      setClientFilter("");
      setCur(0);
      return;
    }
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [commandOpen]);

  // Esc closes the dialog wherever focus is, except inside a chip menu (the menu closes first).
  useEffect(() => {
    if (!commandOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !inChipMenu(e.target)) {
        e.preventDefault();
        setCommandOpen(false);
      }
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [commandOpen, setCommandOpen]);

  // Documents and Knowledge Bank files: the same scoped reads as before.
  useEffect(() => {
    if (!commandOpen || !canSearchLibraries || !q) {
      setVaultHits([]);
      setKbHits([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const encoded = encodeURIComponent(q);
        const vaultHref = `${libraryPaths.vault}?q=${encoded}`;
        const kbHref = `${libraryPaths.kb}?q=${encoded}`;
        try {
          const [docsRes, kbRes] = await Promise.all([fetch("/api/documents"), fetch("/api/knowledge-bank")]);
          const docsJson = (await docsRes.json().catch(() => null)) as { documents?: IndexedDocumentRow[] } | null;
          const kbJson: unknown = await kbRes.json().catch(() => null);

          if (cancelled) return;

          const milestoneDocs = collectVaultDocuments(engagements, getStateForEngagement);
          const indexedDocs = collectIndexedVaultDocuments(docsJson?.documents ?? [], engagements);
          let merged = scopeVaultDocumentsToEngagements(mergeVaultDocuments(milestoneDocs, indexedDocs), engagements);
          if (user?.role === "intern") {
            merged = internVisibleDocuments(user.internId, merged, engagements);
          }

          setVaultHits(
            merged
              .filter((doc) => vaultFileNameMatches(doc, q))
              .slice(0, 8)
              .map((doc) => ({
                id: `doc:${doc.id}`,
                group: "Documents" as const,
                title: doc.fileName,
                sub: [doc.companyName, doc.section].filter(Boolean).join(" · ") || formatVaultCommandHit(doc),
                href: vaultHref,
                client: doc.companyName,
                reg: documentRegulator(doc),
              })),
          );

          const kbFiles = kbRes.ok ? knowledgeBankFilesFromResponse(kbJson) : [];
          setKbHits(
            kbFiles
              .filter((file) => knowledgeBankFileMatchesQuery(file, q))
              .slice(0, 8)
              .map((file) => ({
                id: `kb:${file.id ?? `${file.fileName}-${file.title}`}`,
                group: "Knowledge bank" as const,
                title: file.title || file.fileName,
                sub: file.folderPath || formatKnowledgeBankCommandHit(file),
                href: kbHref,
              })),
          );
        } catch {
          if (!cancelled) {
            setVaultHits([]);
            setKbHits([]);
          }
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [canSearchLibraries, commandOpen, engagements, getStateForEngagement, libraryPaths.kb, libraryPaths.vault, q, user?.internId, user?.role]);

  // Filings and obligations: the scoped register, matched on the server.
  const remote = useQuery({
    queryKey: ["staff-search", q.toLowerCase()],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) return { hits: [] as SearchHit[] };
      return (await res.json()) as { hits: SearchHit[] };
    },
    enabled: commandOpen && q.length >= 2 && Boolean(role && STAFF_SEARCH_ROLES.has(role)),
    staleTime: 30_000,
  });

  const anyChip = Boolean(regFilter || statusFilter || clientFilter);

  const projectHref = useCallback(
    (e: (typeof engagements)[number]) =>
      // The super admin opens projects in the firm (admin) shell, like the Projects pages do.
      role === "intern" ? internEngagementPath(e) : adminProjectPath(e, role === "manager" ? "/app/manager" : "/app/admin"),
    [role, staffBase],
  );

  // Clients, steps and registrations from the roster this person already has.
  const localHits = useMemo<SearchHit[]>(() => {
    if (!commandOpen || isClient) return [];
    const active = Boolean(q) || anyChip;
    const out: SearchHit[] = [];
    for (const e of engagements) {
      out.push({
        id: `client:${e.id}`,
        group: "Clients",
        title: e.companyName,
        sub: e.stage,
        mono: e.slug ?? undefined,
        href: projectHref(e),
        status: HEALTH_WORD[e.health],
        client: e.companyName,
      });
    }
    if (!active) return out;

    const items = getActiveCatalogItems();
    for (const e of engagements) {
      const state = getStateForEngagement(e) ?? {};
      items.forEach((item, i) => {
        const code = coerceStatusCode(state[item.id]?.status);
        out.push({
          id: `step:${e.id}:${item.id}`,
          group: "Steps",
          title: item.title,
          sub: `${e.companyName} · Step ${i + 1}`,
          mono: item.forms[0],
          href:
            role === "intern"
              ? internEngagementStepPath(e, item)
              : adminProjectStepPath(e, item, role === "manager" ? "/app/manager" : "/app/admin"),
          status: STEP_WORD[code],
          reg: regLabelOf(item.title, ...item.forms) ?? (item.bucket === "fema" ? REG_LABEL.fema : undefined),
          client: e.companyName,
        });
      });
    }

    const regBase = `${complianceBaseForRole(role ?? "")}/registrations`;
    const regEngagements = complianceEngagementsForRole(role, engagements, getStateForEngagement);
    for (const r of registrationRows(regEngagements, getStateForEngagement, new Date())) {
      out.push({
        id: `reg:${r.key}`,
        group: "Registrations",
        title: r.name,
        sub: [r.engagement.companyName, r.authority].filter(Boolean).join(" · "),
        mono: r.number ?? r.form ?? undefined,
        href: `${regBase}/${encodeURIComponent(r.key)}`,
        status: r.word === "Not needed" ? undefined : r.word,
        reg: regLabelOf(r.authority, r.name, r.category),
        client: r.engagement.companyName,
      });
    }
    return out;
  }, [anyChip, commandOpen, engagements, getStateForEngagement, isClient, projectHref, q, role, staffBase]);

  const pageHits = useMemo<SearchHit[]>(() => {
    const pages = pagesForRole(role).map((p) => ({ id: `page:${p.href}`, group: "Pages" as const, title: p.label, href: p.href }));
    // Owner item F5: the full Ask VCFO page, first in Pages, when Ask VCFO is on for this role.
    const askHref = askOn ? roleAskPath(role) : null;
    return askHref ? [{ id: "page:ask", group: "Pages" as const, title: "Open Ask VCFO", href: askHref }, ...pages] : pages;
  }, [role, askOn]);

  const regOptions = useMemo(() => (isClient ? [] : opts(Object.values(REG_LABEL))), [isClient]);
  const statusOptions = useMemo(() => (isClient ? [] : opts(STATUS_ORDER)), [isClient]);
  const clientOptions = useMemo(
    () => (isClient ? [] : opts([...new Set(engagements.map((e) => e.companyName).filter(Boolean))].sort((a, b) => a.localeCompare(b)))),
    [engagements, isClient],
  );
  const chips = [
    { key: "reg", label: "Regulator", value: regFilter, set: setRegFilter, options: regOptions },
    { key: "status", label: "Status", value: statusFilter, set: setStatusFilter, options: statusOptions },
    { key: "client", label: "Client", value: clientFilter, set: setClientFilter, options: clientOptions },
  ].filter((c) => c.options.length > 1);

  const groups = useMemo(() => {
    const passes = (h: SearchHit) =>
      (!regFilter || h.reg === regFilter) && (!statusFilter || h.status === statusFilter) && (!clientFilter || h.client === clientFilter);
    const textOf = (h: SearchHit) => `${h.title} ${h.sub ?? ""} ${h.mono ?? ""}`;
    // Local hits match the query here; remote and library hits were matched where they were read.
    const local = [...localHits, ...pageHits].filter((h) => (q ? matchesQuery(textOf(h), q) : true));
    const all = [...local, ...(q.length >= 2 ? (remote.data?.hits ?? []) : []), ...vaultHits, ...kbHits].filter(passes);
    return SEARCH_GROUPS.map((group: SearchGroup) => {
      const hits = all.filter((h) => h.group === group);
      // With nothing typed, show four clients and the role's pages, as the prototype's first view.
      const cap = !q && !anyChip ? (group === "Clients" ? 4 : group === "Pages" ? 8 : PER_GROUP) : PER_GROUP;
      return { group, hits: hits.slice(0, cap) };
    }).filter((g) => g.hits.length > 0);
  }, [anyChip, clientFilter, kbHits, localHits, pageHits, q, regFilter, remote.data, statusFilter, vaultHits]);

  const flat = useMemo(() => groups.flatMap((g) => g.hits), [groups]);

  useEffect(() => setCur(0), [q, regFilter, statusFilter, clientFilter]);
  useEffect(() => {
    if (cur > flat.length - 1) setCur(Math.max(0, flat.length - 1));
  }, [cur, flat.length]);

  const close = useCallback(() => {
    setCommandOpen(false);
    triggerRef.current?.focus();
  }, [setCommandOpen]);

  const go = (hit: SearchHit | undefined) => {
    if (!hit) return;
    setCommandOpen(false);
    router.push(hit.href);
  };

  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Keys in a chip menu (it sits in a portal) belong to the menu.
    if (!e.currentTarget.contains(e.target as Node)) return;
    if (e.target !== inputRef.current) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCur((c) => Math.min(flat.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCur((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(flat[cur]);
    }
  };

  // Keep the picked row in view while the arrows move.
  useEffect(() => {
    if (!commandOpen) return;
    boxRef.current?.querySelector<HTMLElement>(`[data-search-index="${cur}"]`)?.scrollIntoView({ block: "nearest" });
  }, [commandOpen, cur]);

  const trigger = (
    <Tip label="Search" keys={["Ctrl", "K"]}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setCommandOpen(true)}
        aria-label="Search (Ctrl K)"
        aria-keyshortcuts="Control+K Meta+K"
        aria-haspopup="dialog"
        aria-expanded={commandOpen}
        className="ml-auto hidden h-9 w-9 flex-none items-center gap-2 rounded-md border-1.5 border-line bg-surface-sunken text-[14px] text-ink-muted transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:flex md:w-[380px] md:flex-initial md:shrink md:pl-3 md:pr-2"
      >
        <Search className="mx-auto h-4 w-4 flex-none md:mx-0" strokeWidth={1.6} aria-hidden />
        <span className="hidden min-w-0 flex-1 truncate text-left md:inline">Search clients, filings, documents</span>
        <Kbd className="ml-auto hidden md:inline-flex">Ctrl K</Kbd>
      </button>
    </Tip>
  );

  let index = -1;
  const dialog = commandOpen ? (
    <div
      className="fixed inset-0 z-[80] bg-scrim p-4 pt-[12vh]"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the dialog takes arrow, Enter and Escape keys for the result list while focus stays in the search field */}
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="mx-auto max-w-[600px] overflow-hidden rounded-md border-1.5 border-line bg-surface-raised text-ink shadow-dialog"
        onKeyDown={onKey}
      >
        <div className="flex h-[52px] items-center gap-2.5 border-b-1.5 border-line px-4">
          <Search className="h-4 w-4 flex-none text-ink-muted" strokeWidth={1.6} aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients, steps, filings, documents"
            aria-label="Search"
            role="combobox"
            aria-expanded
            aria-controls="staff-search-results"
            aria-activedescendant={flat[cur] ? `staff-search-${cur}` : undefined}
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
          />
          <Kbd>Esc</Kbd>
        </div>
        {chips.length > 0 ? (
          <FilterChipRow
            className="border-b-1.5 border-line px-4 py-2.5"
            onClear={() => {
              setRegFilter("");
              setStatusFilter("");
              setClientFilter("");
              inputRef.current?.focus();
            }}
            chips={chips.map((c) => ({
              key: c.key,
              set: Boolean(c.value),
              node: <FilterChip label={c.label} value={c.value} onChange={c.set} options={c.options} />,
            }))}
          />
        ) : null}
        <div id="staff-search-results" className="max-h-[56vh] overflow-y-auto py-1.5" role="listbox" aria-label="Results">
          {groups.length === 0 ? <p className="px-4 py-3 text-[13px] text-ink-faint">No match</p> : null}
          {groups.map((g) => (
            <div key={g.group} role="group" aria-label={g.group}>
              <p className="px-4 pb-1 pt-2 text-[12px] font-medium text-ink-muted">{g.group}</p>
              {g.hits.map((h) => {
                index += 1;
                const i = index;
                const on = i === cur;
                return (
                  <button
                    key={h.id}
                    id={`staff-search-${i}`}
                    data-search-index={i}
                    type="button"
                    role="option"
                    aria-selected={on}
                    tabIndex={-1}
                    onMouseEnter={() => setCur(i)}
                    onClick={() => go(h)}
                    className={cn("flex h-10 w-full items-center gap-2.5 px-4 text-left", on ? "bg-brand-soft" : "hover:bg-surface-sunken")}
                  >
                    {h.status && SQUARE[h.status] ? (
                      <i className={cn("h-2 w-2 flex-none rounded-[2px]", SQUARE[h.status])} title={h.status} aria-hidden />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate text-[13.5px]">
                      <span className="font-medium">{h.title}</span>
                      {h.sub ? <span className="ml-2 text-[12.5px] text-ink-muted">{h.sub}</span> : null}
                      {h.status ? <span className="sr-only">, {h.status}</span> : null}
                    </span>
                    {h.mono ? <span className="flex-none font-mono text-[12px] text-ink-muted">{h.mono}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 border-t-1.5 border-line px-4 py-2.5 text-[12px] text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> Move
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>Enter</Kbd> Open
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>Esc</Kbd> Close
          </span>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {trigger}
      {/* The dialog sits in a portal so the sticky top bar's stacking does not put the sidebar above the scrim. */}
      {mounted && dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}
