import { describe, expect, it } from 'vitest';
import { errorMessage } from '@/lib/toast-errors';

describe('errorMessage for board-meeting codes (UAT D-T11-01)', () => {
  it('turns the short codes into sentences a person can act on', () => {
    expect(errorMessage(new Error('bad_link'))).toBe('The Teams link must be a full web address starting with https://.');
    expect(errorMessage(new Error('no_director_email'))).toMatch(/director with an email/);
  });
  it('leaves an ordinary sentence alone', () => {
    expect(errorMessage(new Error('Something specific went wrong.'))).toBe('Something specific went wrong.');
  });
});
