import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type CutSubgroupOption = { key: string; label: string; order?: number };

export function SubgroupCutSelection({ options, disabled, onApply }: {
  options: readonly CutSubgroupOption[]; disabled: boolean; onApply(keys: readonly string[]): void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const configured = options.filter(option => option.order !== undefined).sort((a, b) => a.order! - b.order!);
  const button = (label: string, onPress: () => void, off = false) => <TouchableOpacity accessibilityRole="button" disabled={off} onPress={onPress} style={[styles.button, off && { opacity: 0.45 }]}><Text style={styles.label}>{label}</Text></TouchableOpacity>;
  return <View style={styles.container}>
    {button('소그룹 그룹화 배치', () => { setSelected(configured.map(option => option.key)); setOpen(true); }, disabled || !options.length)}
    {configured.length > 0 && <Text style={styles.hint}>우선 배치: {configured.map(option => option.label).join(' → ')}</Text>}
    <Modal visible={open} transparent onRequestClose={() => setOpen(false)}>
      <View style={styles.overlay}><View style={styles.panel} accessibilityViewIsModal>
        <Text style={styles.label}>그룹화할 소그룹 선택</Text>
        <Text style={styles.hint}>선택 순서대로 소그룹 조각을 묶습니다. 선택이 있는 묶음은 자투리를 사용하지 않고 새 원단에 배치하며, 같은 원단의 미선택 조각은 마지막에 배치합니다.</Text>
        <ScrollView style={{ flexGrow: 0 }}>
          {[...selected.flatMap(key => options.filter(option => option.key === key)), ...options.filter(option => !selected.includes(option.key))].map(option => {
            const index = selected.indexOf(option.key);
            return <View key={option.key} style={styles.row}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 9 }} accessibilityRole="checkbox" accessibilityLabel={`${option.label} 그룹화 선택`} accessibilityState={{ checked: index >= 0 }} onPress={() => setSelected(current => index < 0 ? [...current, option.key] : current.filter(key => key !== option.key))}>
                <Text>{index < 0 ? '☐' : `☑ ${index + 1}.`} {option.label}</Text>
              </TouchableOpacity>
              {index > 0 && button(`${option.label} 순서 올리기`, () => setSelected(current => current.map((key, i) => i === index - 1 ? option.key : i === index ? current[index - 1]! : key)))}
            </View>;
          })}
        </ScrollView>
        <View style={styles.row}>{button('그룹화 선택 적용', () => { onApply(selected); setOpen(false); }, disabled)}{button('취소', () => setOpen(false))}</View>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { paddingVertical: 6, gap: 5 },
  overlay: { flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0007' },
  panel: { backgroundColor: '#fff', maxHeight: '90%', width: '100%', maxWidth: 550, borderRadius: 12, padding: 15, gap: 8 },
  label: { color: '#5b21b6', fontSize: 13, fontWeight: '800' },
  hint: { color: '#475569', fontSize: 12, lineHeight: 18 },
  button: { padding: 9, backgroundColor: '#ede9fe', borderRadius: 7 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
});
