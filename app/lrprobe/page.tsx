'use client';
import { BatchPage, type BatchView } from '@/views/labour-registers/BatchPage';
import { assessReadiness, closeSentence } from '@/lib/labour-registers/readiness';
import { formsFor, monthPeriod } from '@/lib/labour-registers/catalogue';

const period = monthPeriod(2026, 9);
const forms = formsFor('TG', period);
const readiness = assessReadiness({
  forms,
  uploads: { paysheet: { rowCount: 422, fileName: 'p.xlsx' }, attendance: { rowCount: 419, fileName: 'a.xlsx' } },
  requiredFields: ['employeeId', 'name', 'basic'],
  mappedFields: ['employeeId', 'name', 'basic'],
  unresolvedValues: 0, employees: 422, employeesShort: 2,
  activeHeads: ['attendance-lop'], headsAwaited: ['overtime'], overtimeCoverageUnresolved: 0,
});
const view: BatchView = {
  batchId: 'b1', stateCode: 'TG', period, status: 'generated', locked: true,
  provenance: { periodFrom: period.from, periodTo: period.to, status: 'generated',
    markedReadyAt: '2026-11-03T09:00:00Z', markedReadyByName: 'Krishna',
    generatedAt: '2026-11-03T14:05:00Z', registers: 20, fromStorage: 17, reopenCount: 1,
    reopenReason: 'HR sent a corrected attendance sheet' },
  acts: new Set(forms.map(f => f.act)).size,
  formsByAct: Object.entries(forms.reduce<Record<string, {id:string;formNumber:string;title:string;rule:string}[]>>((a,f)=>{(a[f.act] ??= []).push({id:f.id,formNumber:f.formNumber,title:f.title,rule:f.rule});return a;},{})).map(([act,items])=>({act,forms:items})),
  uploads: { paysheet: { rowCount: 422, fileName: 'p.xlsx' } },
  readiness, sentence: closeSentence(readiness, period),
};
export default function P() { return <div style={{padding:24,background:'var(--canvas,#f6f8fb)'}}><BatchPage view={view} shellBase="/app/manager" /></div>; }
