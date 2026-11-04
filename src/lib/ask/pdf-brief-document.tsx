import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { AnswerEnvelope, Visual } from '@/data/ask/schema';
import { visualText } from '@/lib/ask/visual-text';
import { BRIEF_DISCLAIMER, type BriefItem } from './pdf-brief-types';

/** The branded brief document (F3). Plain print styling: no screen tokens reach a PDF. */
const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10.5, fontFamily: 'Helvetica', color: '#1f2433' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 18, borderBottom: '1pt solid #d9dde6', paddingBottom: 10 },
  logo: { width: 110, height: 28, objectFit: 'contain' },
  headerText: { marginLeft: 'auto', textAlign: 'right' },
  company: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  muted: { color: '#5b6478' },
  item: { marginBottom: 18 },
  h: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  badge: { fontSize: 8.5, color: '#2f7a66', marginBottom: 6 },
  line: { fontSize: 11, lineHeight: 1.45, marginBottom: 8 },
  label: { fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  flowRow: { flexDirection: 'row', marginBottom: 8 },
  stage: { flexGrow: 1, flexBasis: 0, border: '1pt solid #d9dde6', borderRadius: 4, padding: 6, marginRight: 4 },
  stageHere: { borderColor: '#2f5fd8', backgroundColor: '#eef3ff' },
  row: { flexDirection: 'row', marginBottom: 2 },
  key: { width: 130, color: '#5b6478' },
  bullet: { marginBottom: 2 },
  sources: { fontSize: 8.5, color: '#5b6478', marginTop: 4 },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, fontSize: 8, color: '#5b6478', textAlign: 'center' },
});

function badgeText(answer: AnswerEnvelope, firmName: string): string {
  if (answer.draft) return 'Not yet reviewed · check with your lead';
  if (answer.origin === 'reviewed' || answer.origin === 'deterministic') return `Reviewed by ${firmName}`;
  return 'AI answer · check with your lead';
}

function VisualBlock({ visual }: { visual: Visual }) {
  switch (visual.type) {
    case 'flow':
      return (
        <View style={s.flowRow}>
          {visual.stages.map((stage, i) => (
            <View key={i} style={stage.state === 'here' ? [s.stage, s.stageHere] : s.stage}>
              <Text style={s.muted}>{stage.state === 'done' ? 'Done' : stage.state === 'here' ? 'You are here' : 'Next'}</Text>
              <Text style={s.label}>{stage.label}</Text>
              {stage.sub ? <Text style={s.muted}>{stage.sub}</Text> : null}
            </View>
          ))}
        </View>
      );
    case 'keyFacts':
    case 'metrics': {
      const rows = visual.type === 'keyFacts' ? visual.facts : visual.items;
      return (
        <View style={{ marginBottom: 8 }}>
          {rows.map((r) => (
            <View key={r.k} style={s.row}>
              <Text style={s.key}>{r.k}</Text>
              <Text style={{ flex: 1 }}>{r.v}</Text>
            </View>
          ))}
        </View>
      );
    }
    case 'steps':
      return (
        <View style={{ marginBottom: 8 }}>
          {visual.items.map((item, i) => (
            <Text key={i} style={s.bullet}>
              {i + 1}. {item.label}
              {item.form ? ` (${item.form})` : ''}
            </Text>
          ))}
        </View>
      );
    default:
      return <Text style={{ marginBottom: 8 }}>{visualText(visual)}</Text>;
  }
}

export function Brief({
  items,
  companyName,
  firmName,
  logo,
  date,
}: {
  items: BriefItem[];
  companyName: string;
  firmName: string;
  /** PNG as a data URI — react-pdf reads a bare Buffer as a file path. */
  logo: string | null;
  date: string;
}) {
  return (
    <Document title={`${companyName} — brief`} author={firmName}>
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          {logo ? <Image style={s.logo} src={logo} /> : <Text style={s.company}>{firmName}</Text>}
          <View style={s.headerText}>
            <Text style={s.company}>{companyName}</Text>
            <Text style={s.muted}>{date}</Text>
          </View>
        </View>
        {items.map((item, i) => (
          <View key={i} style={s.item} wrap={false}>
            <Text style={s.h}>{item.title}</Text>
            <Text style={s.badge}>{badgeText(item.answer, firmName)}</Text>
            <Text style={s.line}>{item.answer.line}</Text>
            {item.answer.visual ? <VisualBlock visual={item.answer.visual} /> : null}
            {item.answer.why ? (
              <View style={{ marginBottom: 4 }}>
                <Text style={s.label}>Why it matters to you</Text>
                <Text>{item.answer.why}</Text>
              </View>
            ) : null}
            {item.answer.citations.length > 0 ? (
              <Text style={s.sources}>Sources: {item.answer.citations.map((c) => c.label).join(' · ')}</Text>
            ) : null}
          </View>
        ))}
        <Text style={s.footer} fixed>
          {BRIEF_DISCLAIMER}
        </Text>
      </Page>
    </Document>
  );
}

