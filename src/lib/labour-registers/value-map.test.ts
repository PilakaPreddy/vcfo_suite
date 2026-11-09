import { describe, expect, it } from 'vitest';

import { unresolvedCodeCount } from './value-map';

/**
 * The attendance-code count the close blocks on.
 *
 * It lived only in the mapping screen's loader. The batch screen, which is where the close
 * actually happens, passed a constant zero — so `assessReadiness` had a `blocked` line with a
 * fix link that could never fire. A gate that cannot fire is worse than no gate: the screen
 * looks as though it checked.
 */
describe('the count both screens block on', () => {
  it('counts a code nothing recognises', () => {
    /* The batch screen used to pass a constant zero for this, so the `blocked` readiness line
       it feeds — "N attendance codes not matched to ours", with a fix link to the mapping
       screen — could never fire. A preparer could close a month whose muster rolls carried
       codes this product does not understand, and the dialog said nothing. */
    expect(unresolvedCodeCount(['P', 'A', 'ZZZ'])).toBe(1);
  });

  it('counts nothing when every code is one we know', () => {
    expect(unresolvedCodeCount(['P', 'A', 'P', 'A'])).toBe(0);
  });

  it('treats a code the firm has already mapped as resolved', () => {
    /* The preparer has answered. The matcher's own opinion of the code stops mattering. */
    expect(unresolvedCodeCount(['ZZZ'], { ZZZ: 'P' })).toBe(0);
    expect(unresolvedCodeCount(['ZZZ', 'QQQ'], { ZZZ: 'P' })).toBe(1);
  });

  it('ignores blanks and counts a repeated code once', () => {
    expect(unresolvedCodeCount(['', '   ', 'ZZZ', 'ZZZ', 'ZZZ'])).toBe(1);
  });

  it('counts nothing for a sheet with no day block at all', () => {
    expect(unresolvedCodeCount([])).toBe(0);
  });
});
