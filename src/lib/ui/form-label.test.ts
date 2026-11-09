import { describe, expect, it } from 'vitest';
import { formLabel } from './form-label';

describe('formLabel', () => {
  it('spells SPICe+ the way every page does', () => {
    expect(formLabel('Spice Part A')).toBe('SPICe+ Part A');
    expect(formLabel('SPICe+ Part B')).toBe('SPICe+ Part B');
    expect(formLabel('spice plus part B')).toBe('SPICe+ Part B');
  });

  it('leaves other forms alone', () => {
    expect(formLabel('RUN')).toBe('RUN');
    expect(formLabel('INC-9')).toBe('INC-9');
  });
});
