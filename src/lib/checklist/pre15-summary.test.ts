import { describe, expect, it } from 'vitest';
import { getItem } from '@/data/checklist';
import { formatResponseSummary } from '@/lib/checklist/checklist-responses';
import { repeatFieldId } from '@/lib/checklist/checklist-repeat';

describe('Proposed Directors summary (pre-15)', () => {
  it('names the directors instead of showing the entry ids', () => {
    const item = getItem('pre-15')!;
    const r: Record<string, string> = {
      directors: 'e413bd3d9,e41b60775',
      [repeatFieldId('directors', 'e413bd3d9', 'firstName')]: 'Ravi',
      [repeatFieldId('directors', 'e413bd3d9', 'lastName')]: 'Kumar Test',
      [repeatFieldId('directors', 'e41b60775', 'firstName')]: 'John',
      [repeatFieldId('directors', 'e41b60775', 'lastName')]: 'Test Smith',
    };
    expect(formatResponseSummary(item, r).summary).toBe('Ravi Kumar Test, John Test Smith');
  });
});
