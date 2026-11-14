import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { InstallationLaborLine } from './repriceInstallationLabor';
import { EMPTY_WORKLOAD, type InstallationWorkload } from './installationWorkload';

const fields = [
  { key: 'sheets', label: '부착 시트 (장)' },
  { key: 'finishingM', label: '이음·감아붙임 (m)' },
  { key: 'details', label: '코너·타공 (개)' },
] as const;

export function InstallationWorkloadFields({ line, value = EMPTY_WORKLOAD, onChange }: {
  line: InstallationLaborLine;
  value?: InstallationWorkload;
  onChange(value: InstallationWorkload): void;
}) {
  if (line.installationAreaM2 <= 0) return null;
  return <View style={styles.section}>
    <View style={styles.row}>
      <Text style={styles.text}>작업량 기준 · 참고 견적</Text>
      <Switch accessibilityLabel={line.subgroupName + ' 작업량 기준'} value={value.enabled} onValueChange={(enabled) => onChange({ ...value, enabled })} />
    </View>
    {value.enabled && <>
      <Text style={styles.text}>부착 면적 {line.installationAreaM2.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}㎡ · 소그룹 전체 수량 기준</Text>
      <View style={styles.row}>{fields.map(({ key, label }) => <View key={key} style={styles.field}>
        <Text style={styles.text}>{label}</Text>
        <TextInput accessibilityLabel={line.subgroupName + ' ' + label} style={styles.input} keyboardType={key === 'finishingM' ? 'decimal-pad' : 'number-pad'} value={value[key]}
          onChangeText={(raw) => onChange({ ...value, [key]: raw.replace(key === 'finishingM' ? /[^0-9.]/g : /[^0-9]/g, '') })} placeholder={key === 'sheets' ? '1 이상' : '없으면 0'} />
      </View>)}</View>
      <Text style={styles.text}>{line.workloadMinutes === undefined
        ? '시트 장수와 마감 수량을 입력하면 적용됩니다. 입력 중에는 기존 단가로 표시합니다.'
        : line.workloadMinutes.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '인분 · 현장 실측 전 참고값'}</Text>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 5, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  field: { flex: 1 },
  text: { color: '#475569', fontSize: 11 },
  input: { padding: 6, color: '#0f172a', backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6 },
});
