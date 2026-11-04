import { recordAuditEvent } from '@/db/repositories/audit-events';
import {
  buildDocPackZip,
  docPackErrorResponse,
  loadDocPack,
  ZIP_CONTENT_TYPE,
} from '@/lib/api/doc-pack';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/engagements/[id]/doc-pack/zip — every ready document, one archive. */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const loaded = await loadDocPack(id);
  if (loaded.ok === false) return loaded.response;
  const { ctx, inputs, summary } = loaded.load;

  try {
    const zip = buildDocPackZip(inputs, summary);
    await recordAuditEvent(ctx, {
      engagementId: inputs.engagement.id,
      action: 'doc_pack.download_zip',
      summary: `Downloaded the pre-incorporation document pack (${zip.itemKeys.length} files)`,
      metadata: { itemKeys: zip.itemKeys, filename: zip.filename },
    });
    return new Response(zip.stream, {
      status: 200,
      headers: {
        'Content-Type': ZIP_CONTENT_TYPE,
        'Content-Disposition': `attachment; filename="${zip.filename}"`,
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      },
    });
  } catch (err) {
    return docPackErrorResponse(err);
  }
}
