import type { SheetRow } from '@/db/repositories/receivables';

/** The sheet as the manager area sees it. The key travels inside `publicUrl`, built by the route. */
export function sheetDto(s: SheetRow) {
  return {
    id: s.id,
    name: s.name,
    clientOrgName: s.clientOrgName,
    requireKey: s.requireKey,
    reminderRules: s.reminderRules,
    publishedVersionId: s.publishedVersionId,
  };
}

export type SheetDto = ReturnType<typeof sheetDto>;
