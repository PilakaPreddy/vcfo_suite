/** DB / API stage values — display labels differ (see STAGE_LABEL). */
export type Stage = 'Pre-Incorporation' | 'Post-Incorporation' | 'Operational Readiness';

export const STAGE_LABEL: Record<Stage, string> = {
  'Pre-Incorporation': 'Incorporation',
  'Post-Incorporation': 'Registration',
  'Operational Readiness': 'Compliance',
};

/** Short display name for any stage string — falls back to the raw value. */
export function stageDisplayLabel(stage: string | null | undefined): string {
  if (!stage) return '';
  return STAGE_LABEL[stage as Stage] ?? stage;
}
