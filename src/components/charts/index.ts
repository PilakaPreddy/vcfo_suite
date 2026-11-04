/**
 * SHARED CHART LAYER (context §9).
 *
 * Every chart in every dashboard is built from these. Do not style a chart
 * ad hoc, and do not import recharts directly in a view — go through
 * `DashBarChart` / `DashLineChart`, or `useRecharts` + `chart-theme` if a chart
 * type is genuinely missing, and then add it here.
 */

export {
  CHART_STATUS,
  chartPhaseColor,
  type ChartColor,
} from '@/components/charts/chart-theme';
export { ChartLegend } from '@/components/charts/ChartLegend';
export { DashBarChart, type ChartRow, type ChartSeries } from '@/components/charts/DashBarChart';
export { DashLineChart, DashSparkline } from '@/components/charts/DashLineChart';
