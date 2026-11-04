import 'server-only';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { AuthContext } from '@/auth/guards';
import { getSuperFirmInsights } from '@/db/repositories/super-overview';
import { firmDisplayName } from '@/lib/shell/brand';
import { plainDay } from '@/lib/date-format';
import {
  buildPartnerReport,
  partnerReportFilename,
  pickReportMonth,
  type PartnerReportParams,
  type ReportSchedule,
} from './partner-report';
import { PartnerReportDocument } from './partner-report-document';
import { partnerReportCsv, partnerReportCsvFilename } from './partner-report-csv';

/**
 * Render the partner report PDF for the caller (G-21).
 *
 * The data is read through `getSuperFirmInsights(ctx)`, the same scoped repository read the
 * Reports page uses, so the PDF matches the screen. Returns null when the month asked for is
 * outside the twelve months the insights hold.
 */
function loadLogo(): string | null {
  try {
    const png = readFileSync(path.join(process.cwd(), 'public', 'sbc-logo-light.png'));
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function renderPartnerReportPdf(
  ctx: AuthContext,
  params: PartnerReportParams,
  opts: { schedule?: ReportSchedule; now?: Date } = {},
): Promise<{ pdf: Buffer; filename: string; monthLabel: string } | null> {
  const now = opts.now ?? new Date();
  const insights = await getSuperFirmInsights(ctx, now);
  const month = pickReportMonth(insights, params, { schedule: opts.schedule });
  if (!month) return null;
  const data = buildPartnerReport(insights, month, now);
  const pdf = await renderToBuffer(
    createElement(PartnerReportDocument, {
      data,
      firmName: firmDisplayName(),
      logo: loadLogo(),
      preparedOn: plainDay(insights.generatedAt),
    }) as Parameters<typeof renderToBuffer>[0],
  );
  return { pdf, filename: partnerReportFilename(data.monthLabel), monthLabel: data.monthLabel };
}

/**
 * The same report as a CSV file that Excel opens (P-225), read the same way as the PDF.
 * Returns null when the month asked for is outside the insights.
 */
export async function renderPartnerReportCsv(
  ctx: AuthContext,
  params: PartnerReportParams,
  opts: { schedule?: ReportSchedule; now?: Date } = {},
): Promise<{ csv: Buffer; filename: string; monthLabel: string } | null> {
  const now = opts.now ?? new Date();
  const insights = await getSuperFirmInsights(ctx, now);
  const month = pickReportMonth(insights, params, { schedule: opts.schedule });
  if (!month) return null;
  const data = buildPartnerReport(insights, month, now);
  const csv = partnerReportCsv(data, { firmName: firmDisplayName(), preparedOn: plainDay(insights.generatedAt) });
  return { csv: Buffer.from(csv, 'utf8'), filename: partnerReportCsvFilename(data.monthLabel), monthLabel: data.monthLabel };
}
