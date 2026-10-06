import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { INSTALLATION_PARTS_STORAGE_KEY, installationPartOptions, parseInstallationParts, type InstallationPartRate } from './installationPartPricing';

export function InstallationPartInput({ part, rate, onChange }: {
  part?: string; rate?: number; onChange(part: string | undefined, rate: number | undefined): void;
}) {
  const [visible, setVisible] = useState(false);
  const [custom, setCustom] = useState<InstallationPartRate[]>([]);
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    setError('');
    setName(part ?? '');
    setCost(rate === undefined ? '' : String(rate));
    setVisible(true);
    try { setCustom(parseInstallationParts(await AsyncStorage.getItem(INSTALLATION_PARTS_STORAGE_KEY))); }
    catch { setError('부위 목록을 불러오지 못했습니다. 저장된 소그룹 설정은 유지됩니다.'); }
    finally { setBusy(false); }
  };
  const apply = async (saveAsOption: boolean) => {
    const trimmed = name.trim();
    const numeric = Number(cost);
    if (!trimmed || !cost.trim() || !Number.isSafeInteger(numeric) || numeric < 0) {
      setError('부위 이름과 0 이상의 정수 단가를 입력해 주세요.'); return;
    }
    setBusy(true);
    try {
      if (saveAsOption) {
        const latest = parseInstallationParts(await AsyncStorage.getItem(INSTALLATION_PARTS_STORAGE_KEY));
        const next = [...latest.filter((item) => item.name !== trimmed), { name: trimmed, costPerM: numeric }];
        await AsyncStorage.setItem(INSTALLATION_PARTS_STORAGE_KEY, JSON.stringify(next));
        setCustom(next);
      }
      onChange(trimmed, numeric);
      setVisible(false);
    } catch { setError('부위 목록 저장에 실패했습니다. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="시공 부위 및 인건비 설정" onPress={() => void open()} style={styles.trigger}>
      <Text style={styles.label}>부위 · {part ?? '미선택 (기존 난이도 적용)'}</Text>
      <Text style={styles.hint}>{part && rate !== undefined ? `${rate.toLocaleString('ko-KR')}원/m · 변경` : '선택 / 추가'}</Text>
    </TouchableOpacity>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.backdrop}><View style={styles.dialog}>
        <View style={styles.row}><Text style={styles.title}>시공 부위 · 인건비 설정</Text><TouchableOpacity accessibilityRole="button" onPress={() => setVisible(false)}><Text style={styles.label}>닫기</Text></TouchableOpacity></View>
        <Text style={styles.hint}>기본 단가는 전체 시공 범위의 중간값입니다. 이 소그룹에 배분된 필름 사용 길이(m)에 적용하며, 단독 시공은 참고 범위를 보고 직접 조정해 주세요.</Text>
        <ScrollView style={styles.options}>
          <TouchableOpacity accessibilityRole="button" onPress={() => { onChange(undefined, undefined); setVisible(false); }} style={styles.option}><Text>부위 미선택 · 기존 난이도 적용</Text></TouchableOpacity>
          {installationPartOptions(custom).map((item) => <TouchableOpacity key={item.name} accessibilityRole="button" onPress={() => { setName(item.name); setCost(String(item.costPerM)); setError(''); }} style={[styles.option, name === item.name && styles.selected]}><View style={styles.optionCopy}><Text>{item.name}</Text>{item.reference && <Text style={styles.hint}>{item.reference}</Text>}</View><Text>{item.costPerM.toLocaleString('ko-KR')}원/m</Text></TouchableOpacity>)}
        </ScrollView>
        <TextInput accessibilityLabel="시공 부위 이름" placeholder="부위 이름 선택 또는 직접 입력" value={name} onChangeText={setName} style={styles.input} />
        <View style={styles.row}><Text style={styles.label}>인건비 원/m</Text><TextInput accessibilityLabel="부위별 인건비 원/m" keyboardType="number-pad" value={cost} onChangeText={(value) => setCost(value.replace(/[^0-9]/g, ''))} style={[styles.input, styles.rate]} /></View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <View style={styles.row}><TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void apply(true)} style={styles.secondary}><Text>부위 추가 / 기본단가 저장</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void apply(false)} style={styles.primary}><Text style={styles.white}>소그룹 적용</Text></TouchableOpacity></View>
        <Text style={styles.hint}>추가한 부위 목록은 이 기기에 보관됩니다. 적용한 부위·단가는 프로젝트에 저장됩니다.</Text>
      </View></View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  trigger: { marginTop: 7, padding: 9, borderRadius: 8, backgroundColor: '#f0fdfa', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 },
  label: { fontSize: 12, color: '#115e59', fontWeight: '700' }, hint: { fontSize: 11, lineHeight: 17, color: '#64748b' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  dialog: { width: '100%', maxWidth: 500, maxHeight: '90%', backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, title: { fontSize: 16, fontWeight: '800' },
  options: { maxHeight: 250, flexShrink: 1 }, option: { padding: 12, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#e2e8f0' }, selected: { backgroundColor: '#ccfbf1' },
  optionCopy: { flex: 1, minWidth: 0, marginRight: 8, gap: 4 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 7, padding: 10, fontSize: 14 }, rate: { width: 140, textAlign: 'right' },
  primary: { backgroundColor: '#0f766e', borderRadius: 8, padding: 11 }, secondary: { backgroundColor: '#f1f5f9', borderRadius: 8, padding: 11 }, white: { color: '#fff', fontWeight: '700' }, error: { color: '#b91c1c', fontSize: 12 },
});
