import { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { estimateWon, expenseLabel, EXPENSE_RATES, extraEstimateHint, extraKindLabel, filmEstimateCategories, type DetailedFilmEstimate, type ExpenseRate, type ExtraEstimateItem, type ExtraKind } from './detailedFilmEstimate';

type Props = { detail: DetailedFilmEstimate; editable: boolean; onChange(items: ExtraEstimateItem[]): void; onExpenseRateChange(rate: ExpenseRate): void };
type DirectExtraKind = Exclude<ExtraKind, 'expense'>;
const catalog: Record<DirectExtraKind, readonly [string, string][]> = {
  auxiliary: [['연마재', '장'], ['보양재', 'm²']],
  preparation: [['바탕 청소·탈지', 'm²'], ['퍼티 보수·연마', 'm²'], ['기존 필름 제거', 'm²'], ['프라이머 도포', 'm²']],
  misc: [['퍼티', 'kg'], ['프라이머', 'L']],
};

export function DetailedFilmEstimatePanel({ detail, editable, onChange, onExpenseRateChange }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const items = [...detail.extras, ...detail.legacyExpenses].map(({ valid: _valid, basis: _basis, amount: _amount, ...item }) => item);
  const update = (id: string, patch: Partial<ExtraEstimateItem>) => onChange(items.map(item => item.id === id ? { ...item, ...patch } : item));
  const add = (kind: ExtraKind, name = '', unit = '식') => {
    let index = 1;
    while (items.some(item => item.id === `extra-${index}`)) index++;
    onChange([...items, { id: `extra-${index}`, kind, name, unit, quantity: '1', rate: '', included: false }]);
  };
  const extras = (kind: DirectExtraKind) => <>
    {items.every(item => item.kind !== kind) && <Text style={styles.hint}>등록된 별도 항목이 없습니다.</Text>}
    {detail.extras.filter(row => row.kind === kind).map((row, i) => {
      const label = `${extraKindLabel[kind]} ${i + 1}`;
      return <View key={row.id} style={styles.editor}>
        <TextInput accessibilityLabel={`${label} 항목명`} placeholder="항목명" editable={editable} value={row.name} onChangeText={name => update(row.id, { name })} style={styles.input} />
        <View style={styles.row}>
          <Field label={`${label} 수량`} placeholder="수량" value={row.quantity} editable={editable && !row.included} numeric onChange={quantity => update(row.id, { quantity })} />
          <Field label={`${label} 단위`} placeholder="단위" value={row.unit} editable={editable && !row.included} onChange={unit => update(row.id, { unit })} />
          <Field label={`${label} 단가`} placeholder="단가(원)" value={row.rate} editable={editable && !row.included} numeric onChange={rate => update(row.id, { rate })} />
        </View>
        <View style={styles.row}>
          <Text style={styles.hint}>기존 견적에 포함</Text><Switch accessibilityLabel={`${label} 기존 견적에 포함`} value={row.included} disabled={!editable} onValueChange={included => update(row.id, { included })} />
          <Text style={[styles.amount, { flex: 1, textAlign: 'right' }]}>{row.valid ? row.included ? '추가 청구 없음' : estimateWon(row.amount) : '미완성'}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label} 삭제`} disabled={!editable} onPress={() => onChange(items.filter(item => item.id !== row.id))}><Text style={styles.remove}>삭제</Text></TouchableOpacity>
        </View>
      </View>;
    })}
    <View style={styles.chips}>
      {catalog[kind].map(([name, unit]) => <TouchableOpacity accessibilityRole="button" key={name} disabled={!editable} onPress={() => add(kind, name, unit)} style={styles.chip}><Text style={styles.chipText}>+ {name}</Text></TouchableOpacity>)}
      <TouchableOpacity accessibilityRole="button" disabled={!editable} onPress={() => add(kind)} style={styles.chip}><Text style={styles.chipText}>+ 직접 추가</Text></TouchableOpacity>
    </View>
  </>;
  const section = (id: string, title: string, amount: number, content: React.ReactNode) => <View style={styles.section}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${title} 상세`} accessibilityState={{ expanded: open === id }} onPress={() => setOpen(open === id ? null : id)} style={styles.header}>
      <Text style={styles.label}>{title}</Text><Text style={styles.amount}>{estimateWon(amount)} {open === id ? '▴' : '▾'}</Text>
    </TouchableOpacity>
    {open === id && <View style={styles.body}>{content}</View>}
  </View>;
  return <View style={styles.card}>
    <Text style={styles.title}>견적 상세내역</Text>
    <Text style={styles.hint}>{extraEstimateHint} 이 브라우저에 저장됩니다.</Text>
    {!detail.valid && <Text style={styles.remove}>미완성 항목을 채우거나 삭제해야 인쇄·복사·제출할 수 있습니다.</Text>}
    {filmEstimateCategories(detail).map(category => <View key={category.id} style={styles.category}>
      {category.id === 'labor' ? <>
        <Text style={styles.label}>인건비 · {estimateWon(category.amount)}</Text>
        {section('preparation', '기초작업', detail.preparation, <>{detail.referencePrep.map(row => <Line key={row.id} {...row} />)}{extras('preparation')}</>)}
        {section('attachment', '필름부착', detail.constructionCost - detail.preparation, detail.labor.map((row, i) => <Line key={i} {...row} />))}
      </> : category.id === 'material' ? <>
        <Text style={styles.label}>자재비 · {estimateWon(category.amount)}</Text>
        {section('film', '주자재비', detail.materialCost - detail.auxiliary, detail.films.map((row, i) => <Line key={i} name={row.name} basis={`${row.length.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}m × ${estimateWon(row.rate)}/m`} amount={row.amount} />))}
        {section('auxiliary', '부자재비', detail.auxiliary, extras('auxiliary'))}
      </> : category.id === 'misc' ? section(category.id, category.name, category.amount, extras('misc')) : section('expense', '경비', detail.expense, <>
        <Text style={styles.hint}>{expenseLabel} · 경비를 포함한 최종 견적액의 {detail.expenseRate}%</Text>
        <View style={styles.chips}>{EXPENSE_RATES.map(rate => <TouchableOpacity key={rate} accessibilityRole="button" accessibilityLabel={`경비 ${rate}%`} accessibilityState={{ selected: rate === detail.expenseRate }} disabled={!editable} onPress={() => onExpenseRateChange(rate)} style={[styles.chip, rate === detail.expenseRate && { backgroundColor: '#ddd6fe' }]}><Text style={styles.chipText}>{rate}%</Text></TouchableOpacity>)}</View>
        <Text style={styles.hint}>경비 제외 금액 {estimateWon(detail.netBeforeExpense)} × {detail.expenseRate} ÷ {100 - detail.expenseRate} = {estimateWon(detail.expense)}</Text>
        {detail.legacyExpenses.length > 0 && <Text style={styles.hint}>이전 수동 경비(참고용, 추가 합산하지 않음): {detail.legacyExpenses.map(row => `${row.name} ${estimateWon(row.amount)}`).join(' · ')}</Text>}
      </>)}
    </View>)}
  </View>;
}

function Field({ label, placeholder, value, editable, numeric, onChange }: { label: string; placeholder: string; value: string; editable: boolean; numeric?: boolean; onChange(text: string): void }) {
  return <TextInput accessibilityLabel={label} placeholder={placeholder} value={value} editable={editable} keyboardType={numeric ? 'decimal-pad' : 'default'} onChangeText={onChange} style={[styles.input, { flex: 1, minWidth: 58 }, !editable && { opacity: 0.5 }]} />;
}
function Line({ name, basis, amount }: { name: string; basis: string; amount: number }) {
  return <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.label}>{name}</Text><Text style={styles.hint}>{basis}</Text></View><Text style={styles.amount}>{estimateWon(amount)}</Text></View>;
}
const styles = StyleSheet.create({
  card: { marginTop: 14, padding: 16, gap: 8, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  title: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  category: { gap: 6, marginTop: 4 },
  section: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8 },
  header: { minHeight: 44, padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  body: { padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  label: { fontSize: 12, fontWeight: '800', color: '#334155' },
  amount: { fontSize: 12, fontWeight: '800', color: '#5b21b6' },
  hint: { fontSize: 11, lineHeight: 17, color: '#475569' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editor: { gap: 6, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 8 },
  input: { minHeight: 40, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1', color: '#0f172a', fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { padding: 8, borderRadius: 6, backgroundColor: '#f5f3ff' },
  chipText: { fontSize: 11, color: '#6d28d9' },
  remove: { color: '#b91c1c', fontSize: 11, paddingVertical: 4 },
});
