/**
 * The display name of an MCA form. The checklist data writes "Spice Part A"; every page says
 * "SPICe+ Part A", so the form chips use the same spelling.
 */
export function formLabel(form: string): string {
  return form.replace(/^spice\s*(\+|plus)?\s*part\b/i, 'SPICe+ Part');
}
