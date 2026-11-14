import { StyleSheet, Switch, TouchableOpacity, Text, TextInput, View } from 'react-native';
import type { InstallationLaborLine } from './repriceInstallationLabor';
import { EMPTY_WORKLOAD, type InstallationWorkload } from './installationWorkload';

import { referenceParts, shapeFactors, filmLossFactors, type ReferencePart, type ReferenceShape, type FilmPattern } from './referenceEstimate';

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
    style={[styles.input, selected && styles.selected]}><Text style={styles.text}>{label}</Text></TouchableOpacity>;
}

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
      <View style={styles.choices}>
        <Choice label="직접 작업량" selected={!value.referencePart} onPress={() => onChange({ ...value, referencePart: undefined })} />
        {(Object.keys(referenceParts) as ReferencePart[]).map(part => <Choice key={part} label={referenceParts[part]}
          selected={value.referencePart === part} onPress={() => onChange({ ...value, referencePart: part, quantity: value.referencePart === part ? value.quantity : '' })} />)}
      </View>
      {value.referencePart ? <TextInput accessibilityLabel={line.subgroupName + ' 기준 수량'} style={styles.input}
        keyboardType="decimal-pad" value={value.quantity ?? ''} onChangeText={quantity => onChange({ ...value, quantity })}
        placeholder={value.referencePart === 'kitchen' || value.referencePart === 'trim' ? '전체 가로폭 또는 시공 길이 (m)' : '시공 수량 (세트·개소)'} />
        : <View style={styles.row}>{fields.map(({ key, label }) => <View key={key} style={styles.field}>
        <Text style={styles.text}>{label}</Text>
        <TextInput accessibilityLabel={line.subgroupName + ' ' + label} style={styles.input} keyboardType={key === 'finishingM' ? 'decimal-pad' : 'number-pad'} value={value[key]}
          onChangeText={(raw) => onChange({ ...value, [key]: raw.replace(key === 'finishingM' ? /[^0-9.]/g : /[^0-9]/g, '') })} placeholder={key === 'sheets' ? '1 이상' : '없으면 0'} />
      </View>)}</View>}
      <Text style={styles.text}>형태 난이도</Text>
      <View style={styles.choices}>{(Object.keys(shapeFactors) as ReferenceShape[]).map(shape => <Choice key={shape}
        label={shape + ' ×' + shapeFactors[shape]} selected={(value.shape ?? '평판') === shape} onPress={() => onChange({ ...value, shape })} />)}</View>
      {!value.referencePart && <View style={styles.choices}>{(Object.keys(filmLossFactors) as FilmPattern[]).map(pattern => <Choice key={pattern}
        label={pattern + ' ' + Math.round(filmLossFactors[pattern] * 100) + '%'} selected={value.pattern === pattern}
        onPress={() => onChange({ ...value, pattern: value.pattern === pattern ? undefined : pattern })} />)}</View>}
      {line.referenceMaterialM !== undefined && <Text style={styles.text}>참고 원단 {line.referenceMaterialM.toFixed(2)}m · 청구는 배치 사용량 기준</Text>}
      <TextInput accessibilityLabel={line.subgroupName + ' 밑작업 품수'} style={styles.input} keyboardType="decimal-pad"
        value={value.prepUnits ?? ''} onChangeText={prepUnits => onChange({ ...value, prepUnits })}
        placeholder="추가 밑작업 (품)" />
      <Text style={styles.text}>기초작업 상세에 이미 입력한 작업은 중복 입력하지 마세요.</Text>
      <Text style={styles.text}>{line.workloadMinutes === undefined
        ? '수량과 밑작업 입력값을 확인해 주세요. 입력 중에는 기존 단가로 표시합니다.'
        : line.workloadMinutes.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '인분 · 현장 실측 전 참고값'}</Text>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 5, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  selected: { backgroundColor: '#bae6fd', borderColor: '#0284c7' },
  field: { flex: 1 },
  text: { color: '#475569', fontSize: 11 },
  input: { padding: 6, color: '#0f172a', backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6 },
});
