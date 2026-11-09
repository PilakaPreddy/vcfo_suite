import { describe, expect, it } from 'vitest';
import { isPortalOnlyPath } from './ClientPortalGate';

describe('isPortalOnlyPath', () => {
  it('marks the client Home and Messages pages, which need the portal context', () => {
    expect(isPortalOnlyPath('/app/client/overview')).toBe(true);
    expect(isPortalOnlyPath('/app/client/messages')).toBe(true);
    expect(isPortalOnlyPath('/app/client/messages/abc')).toBe(true);
  });
  it('leaves the client pages that work in the staff shell alone', () => {
    expect(isPortalOnlyPath('/app/client/audit')).toBe(false);
    expect(isPortalOnlyPath('/app/client/overviewx')).toBe(false);
    expect(isPortalOnlyPath(null)).toBe(false);
  });
});
