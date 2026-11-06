import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect, QueryBuilder } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

import type { AuthContext } from '@/auth/guards';
import type { AnswerEnvelope } from '@/data/ask/schema';

/**
 * Cross-tenant rules for the Ask VCFO tables (Path A — enforced here, not RLS):
 *   - a developer is refused before any query runs; managers and Project Leads
 *     use the staff shell only and never manage sources,
 *   - conversations, messages and library items are private to one profile,
 *   - a client conversation / library item needs an engagement the caller can
 *     access, and is written against the approved id,
 *   - knowledge sources are admin / super only; client retrieval never
 *     widens to staff-only sources.
 */

const assertEngagementAccess = vi.fn();
const dbSelect = vi.fn();
const dbInsert = vi.fn();
const dbUpdate = vi.fn();
const dbDelete = vi.fn();
let lastWhere: SQL | undefined;
let selectRows: unknown[] = [];
let inserted: Record<string, unknown> | null = null;

vi.mock('@/db/client', () => ({
  db: {
    select: (...args: unknown[]) => dbSelect(...args),
    insert: (...args: unknown[]) => dbInsert(...args),
    update: (...args: unknown[]) => dbUpdate(...args),
    delete: (...args: unknown[]) => dbDelete(...args),
  },
}));

vi.mock('@/db/repositories/engagements', () => ({
  assertEngagementAccess: (...args: unknown[]) => assertEngagementAccess(...args),
}));

const conversations = await import('@/db/repositories/ask-conversations');
const messages = await import('@/db/repositories/ask-messages');
const library = await import('@/db/repositories/client-library');
const documents = await import('@/db/repositories/ask-documents');
const usage = await import('@/db/repositories/ask-usage');
const { AskForbiddenError } = await import('@/lib/ask/access');

const dialect = new PgDialect();
function whereParams(): unknown[] {
  if (!lastWhere) return [];
  return dialect.sqlToQuery(lastWhere).params;
}

function ctx(role: AuthContext['role'], userId: string): AuthContext {
  return { userId, email: `${userId}@x.test`, name: userId, role };
}
const clientA = ctx('client', 'user-client-a');
const clientB = ctx('client', 'user-client-b');
const admin = ctx('admin', 'user-admin');
const superAdmin = ctx('super_admin', 'user-super');
const manager = ctx('manager', 'user-manager');
const lead = ctx('intern', 'user-lead');
const developer = ctx('developer', 'user-dev');

const ENG_A = '11111111-1111-1111-1111-111111111111';
const ENG_B = '22222222-2222-2222-2222-222222222222';

const answer: AnswerEnvelope = {
  line: 'GST is a tax.',
  citations: [{ id: 'gst-portal', label: 'GST portal' }],
  actions: ['save'],
  origin: 'reviewed',
  depth: 'normal',
};

beforeEach(() => {
  vi.clearAllMocks();
  lastWhere = undefined;
  selectRows = [];
  inserted = null;
  // One fresh chain per db.select() call. A chain that is embedded in another
  // query (for example `notExists(db.select()...)`) must render as SQL, the way a
  // real Drizzle select does; without `getSQL()` PgDialect would bind the mock
  // object itself as a query parameter.
  dbSelect.mockImplementation((fields?: Record<string, unknown>) => {
    let fromTable: unknown;
    let ownWhere: SQL | undefined;
    const chain = {
      from: (table: unknown) => {
        fromTable = table;
        return chain;
      },
      innerJoin: () => chain,
      where: (w: SQL) => {
        ownWhere = w;
        lastWhere = w;
        return chain;
      },
      orderBy: () => chain,
      // limit() stays awaitable (the chain is a thenable) and also allows .offset().
      limit: () => chain,
      offset: () => Promise.resolve(selectRows),
      then: (resolve: (v: unknown[]) => unknown) => resolve(selectRows),
      getSQL: () => {
        const qb = new QueryBuilder();
        const base = (fields ? qb.select(fields as never) : qb.select()).from(fromTable as never);
        return (ownWhere ? base.where(ownWhere) : base).getSQL();
      },
    };
    return chain;
  });
  dbInsert.mockImplementation(() => ({
    values: (values: Record<string, unknown>) => {
      inserted = values;
      return { returning: () => Promise.resolve([{ id: 'new-row', ...values }]) };
    },
  }));
  dbUpdate.mockImplementation(() => ({
    set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }),
  }));
  dbDelete.mockImplementation(() => ({
    where: (w: SQL) => {
      lastWhere = w;
      return { returning: () => Promise.resolve([]) };
    },
  }));
});

describe('role gate', () => {
  it.each([developer])('refuses $role before touching the database', async (who) => {
    await expect(conversations.createAskConversation(who, { shell: 'admin' })).rejects.toBeInstanceOf(
      AskForbiddenError,
    );
    await expect(conversations.getAskConversation(who, 'c-1')).rejects.toBeInstanceOf(AskForbiddenError);
    await expect(library.listLibraryItems(who)).rejects.toBeInstanceOf(AskForbiddenError);
    await expect(
      library.saveLibraryItem(who, { engagementId: ENG_A, title: 't', category: 'tax', answer }),
    ).rejects.toBeInstanceOf(AskForbiddenError);
    await expect(documents.listAskDocuments(who)).rejects.toBeInstanceOf(AskForbiddenError);
    await expect(
      documents.searchAskChunks(who, { query: 'gst', persona: 'staff', limit: 5 }),
    ).rejects.toBeInstanceOf(AskForbiddenError);
    expect(dbSelect).not.toHaveBeenCalled();
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it.each([manager, lead])('keeps $role to the staff shell and away from sources', async (who) => {
    await expect(
      conversations.createAskConversation(who, { shell: 'client', engagementId: ENG_A }),
    ).rejects.toBeInstanceOf(AskForbiddenError);
    await expect(conversations.createAskConversation(who, { shell: 'super' })).rejects.toBeInstanceOf(
      AskForbiddenError,
    );
    await expect(documents.listAskDocuments(who)).rejects.toBeInstanceOf(AskForbiddenError);
    expect(dbSelect).not.toHaveBeenCalled();
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it('keeps each role to its own shell', async () => {
    await expect(conversations.createAskConversation(clientA, { shell: 'admin' })).rejects.toBeInstanceOf(
      AskForbiddenError,
    );
    await expect(
      conversations.createAskConversation(admin, { shell: 'client', engagementId: ENG_A }),
    ).rejects.toBeInstanceOf(AskForbiddenError);
    expect(dbInsert).not.toHaveBeenCalled();
  });
});

describe('conversations', () => {
  it('refuses a client conversation on an engagement the client cannot see', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: false, dbId: ENG_B, forbidden: true });
    await expect(
      conversations.createAskConversation(clientA, { shell: 'client', engagementId: ENG_B }),
    ).resolves.toBeNull();
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it('writes the approved engagement id and the caller as owner', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: ENG_A, row: {} });
    await conversations.createAskConversation(clientA, { shell: 'client', engagementId: 'eng-a-app-id' });
    expect(inserted).toMatchObject({ profileId: clientA.userId, engagementId: ENG_A, shell: 'client', role: 'client' });
  });

  it('lets super admin preview a client shell for one accessible engagement', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: ENG_B, row: {} });
    await conversations.createAskConversation(superAdmin, { shell: 'client', engagementId: ENG_B });
    expect(inserted).toMatchObject({ profileId: superAdmin.userId, engagementId: ENG_B, shell: 'client' });
  });

  it("scopes reads to the caller's profile — client B cannot read client A's thread", async () => {
    selectRows = [];
    await expect(conversations.getAskConversation(clientB, 'conv-of-a')).resolves.toBeNull();
    expect(whereParams()).toContain(clientB.userId);
    expect(whereParams()).not.toContain(clientA.userId);
  });

  it('does not append to a conversation the caller does not own', async () => {
    selectRows = [];
    await expect(
      messages.appendAskMessage(clientB, 'conv-of-a', { sender: 'user', text: 'hi' }),
    ).resolves.toBeNull();
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it('even a firm admin cannot read a client conversation', async () => {
    selectRows = [];
    await expect(conversations.getAskConversation(admin, 'conv-of-a')).resolves.toBeNull();
    expect(whereParams()).toContain(admin.userId);
  });
});

describe('conversation list and delete (F4)', () => {
  it("lists only the caller's own chats — client A never sees client B's", async () => {
    await conversations.listOwnAskConversations(clientA, { shell: 'client', engagementId: ENG_A });
    const params = whereParams();
    expect(params).toContain(clientA.userId);
    expect(params).not.toContain(clientB.userId);
    const { sql: text } = dialect.sqlToQuery(lastWhere!);
    expect(text).toMatch(/^\("ask_conversations"\."profile_id" = \$1 and/);
  });

  it('client B listing never carries client A as a parameter', async () => {
    await conversations.listOwnAskConversations(clientB);
    expect(whereParams()).toContain(clientB.userId);
    expect(whereParams()).not.toContain(clientA.userId);
  });

  it('a firm admin or super admin lists only their own chats, never a client’s', async () => {
    await conversations.listOwnAskConversations(admin, { shell: 'admin' });
    expect(whereParams()).toContain(admin.userId);
    expect(whereParams()).not.toContain(clientA.userId);
    await conversations.listOwnAskConversations(superAdmin, { shell: 'super' });
    expect(whereParams()).toContain(superAdmin.userId);
  });

  it('refuses a developer before any query', async () => {
    await expect(conversations.listOwnAskConversations(developer)).rejects.toBeInstanceOf(AskForbiddenError);
    await expect(conversations.deleteOwnAskConversation(developer, 'c-1')).rejects.toBeInstanceOf(AskForbiddenError);
    expect(dbSelect).not.toHaveBeenCalled();
    expect(dbDelete).not.toHaveBeenCalled();
  });

  it('maps rows: trimmed first question, count, 40 per page with hasMore', async () => {
    const at = new Date('2026-10-30T10:00:00Z');
    selectRows = Array.from({ length: 41 }, (_, i) => ({
      id: `c-${i}`,
      shell: 'client',
      engagementId: ENG_A,
      lastMessageAt: at,
      firstQuestion: i === 0 ? '  What   is GST?\n ' : i === 1 ? 'x'.repeat(200) : null,
      messageCount: 2,
    }));
    const out = await conversations.listOwnAskConversations(clientA, { shell: 'client', engagementId: ENG_A });
    expect(out.hasMore).toBe(true);
    expect(out.conversations).toHaveLength(conversations.ASK_CONVERSATION_PAGE_SIZE);
    expect(out.conversations[0]).toMatchObject({ id: 'c-0', title: 'What is GST?', messageCount: 2, updatedAt: at });
    expect(out.conversations[1].title.length).toBeLessThanOrEqual(80);
    expect(out.conversations[2].title).toBe('Chat');
  });

  it('delete is keyed on id AND the caller — B cannot delete A’s chat', async () => {
    await expect(conversations.deleteOwnAskConversation(clientB, 'conv-of-a')).resolves.toBe(false);
    expect(whereParams()).toEqual(['conv-of-a', clientB.userId]);
    expect(whereParams()).not.toContain(clientA.userId);
  });
});

describe('client library', () => {
  it('lists only the caller’s items', async () => {
    await library.listLibraryItems(clientB);
    expect(whereParams()).toEqual([clientB.userId]);
  });

  it('the soft-removal filter only narrows the caller’s own items', async () => {
    await library.listLibraryItems(clientB);
    const { sql: text, params } = dialect.sqlToQuery(lastWhere!);
    // profile_id = caller AND NOT EXISTS (a removal row for this item): the
    // subquery joins on the item id only, so it can hide rows but never add any.
    expect(text).toMatch(/"client_library_items"\."profile_id" = \$1 and not exists \(select/);
    expect(text).toContain('"client_library_removals"."item_id" = "client_library_items"."id"');
    expect(params).toEqual([clientB.userId]);
    expect(params).not.toContain(clientA.userId);
  });

  it('a single item read is keyed on id AND the caller', async () => {
    await expect(library.getLibraryItem(clientB, 'item-of-a')).resolves.toBeNull();
    expect(whereParams()).toEqual(['item-of-a', clientB.userId]);
  });

  it('only a client saves; super admin preview is read-only', async () => {
    await expect(
      library.saveLibraryItem(superAdmin, { engagementId: ENG_A, title: 't', category: 'tax', answer }),
    ).rejects.toBeInstanceOf(AskForbiddenError);
    await expect(library.deleteLibraryItem(admin, 'item-1')).rejects.toBeInstanceOf(AskForbiddenError);
  });

  it('refuses to save against another client’s engagement', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: false, dbId: ENG_B, forbidden: true });
    await expect(
      library.saveLibraryItem(clientA, { engagementId: ENG_B, title: 't', category: 'tax', answer }),
    ).resolves.toBeNull();
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it('saves against the approved engagement for the caller', async () => {
    assertEngagementAccess.mockResolvedValue({ ok: true, dbId: ENG_A, row: {} });
    await library.saveLibraryItem(clientA, {
      engagementId: ENG_A,
      title: 'GST basics',
      category: 'tax',
      answer,
      topicSlug: 'gst-basics',
      topicVersion: 2,
    });
    expect(inserted).toMatchObject({
      profileId: clientA.userId,
      engagementId: ENG_A,
      topicSlug: 'gst-basics',
      sourceVersion: 2,
    });
  });

  it('delete is scoped to the caller', async () => {
    await expect(library.deleteLibraryItem(clientB, 'item-of-a')).resolves.toBe(false);
    expect(whereParams()).toContain(clientB.userId);
  });
});

describe('knowledge sources', () => {
  it('clients cannot list or upload sources', async () => {
    await expect(documents.listAskDocuments(clientA)).rejects.toBeInstanceOf(AskForbiddenError);
    await expect(
      documents.createAskDocument(clientA, { title: 'x', sourceType: 'firm_note', audience: 'both' }),
    ).rejects.toBeInstanceOf(AskForbiddenError);
  });

  it('admin and super admin can', async () => {
    await expect(documents.listAskDocuments(admin)).resolves.toEqual([]);
    await expect(documents.listAskDocuments(superAdmin)).resolves.toEqual([]);
  });

  it('client retrieval never reaches staff-only sources, even if it asks for staff persona', async () => {
    await documents.searchAskChunks(clientA, { query: 'gst threshold', persona: 'staff', limit: 5 });
    const params = whereParams();
    expect(params).toContain('client');
    expect(params).toContain('both');
    expect(params).not.toContain('staff');
  });

  it('staff retrieval includes staff sources', async () => {
    await documents.searchAskChunks(admin, { query: 'gst threshold', persona: 'staff', limit: 5 });
    expect(whereParams()).toContain('staff');
  });
});

describe('token report', () => {
  it.each([admin, manager, lead, clientA, developer])('refuses $role before any query runs', async (who) => {
    await expect(usage.askUsageReport(who, { days: 30 })).rejects.toBeInstanceOf(AskForbiddenError);
    expect(dbSelect).not.toHaveBeenCalled();
  });
});
