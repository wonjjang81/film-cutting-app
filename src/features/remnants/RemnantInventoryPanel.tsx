import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import type { FilmRemnant } from '../library/models';

export type RemnantDraft = {
  widthMm: number;
  lengthMm: number;
  quantity: number;
  note?: string;
};

export type PlannedRemnantSummary = {
  remnantId: string;
  producedQuantity: number;
  savedNewRollLengthMm: number;
  optimizationStatus: 'exact' | 'certified' | 'approximate';
};

type Props = {
  brand: string;
  productNumber: string;
  remnants: readonly FilmRemnant[];
  plannedUses: readonly PlannedRemnantSummary[];
  identifiersReady: boolean;
  busy: boolean;
  onSave(draft: RemnantDraft): Promise<void>;
  onDelete(id: string): Promise<void>;
};

const statusLabel = {
  exact: '완전 최적',
  certified: '하한 인증',
  approximate: '원단 절약 계산',
} as const;

export function RemnantInventoryPanel({
  brand,
  productNumber,
  remnants,
  plannedUses,
  identifiersReady,
  busy,
  onSave,
  onDelete,
}: Props) {
  const [width, setWidth] = useState('');
  const [length, setLength] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const matching = useMemo(
    () => remnants.filter((item) => item.brand.trim() === brand.trim() && (productNumber.trim().length === 0 || item.productNumber.trim() === productNumber.trim())),
    [brand, productNumber, remnants],
  );
  const useById = useMemo(() => {
    const map = new Map<string, PlannedRemnantSummary[]>();
    plannedUses.forEach((use) => map.set(use.remnantId, [...(map.get(use.remnantId) ?? []), use]));
    return map;
  }, [plannedUses]);

  const save = async () => {
    const next = { widthMm: Number(width), lengthMm: Number(length), quantity: Number(quantity), note: note.trim() || undefined };
    if (!identifiersReady) return setLocalError('브랜드를 먼저 선택해 주세요.');
    if (!Number.isFinite(next.widthMm) || next.widthMm <= 0 || !Number.isFinite(next.lengthMm) || next.lengthMm <= 0) {
      return setLocalError('자투리 폭과 길이는 0보다 커야 합니다.');
    }
    if (!Number.isInteger(next.quantity) || next.quantity <= 0) return setLocalError('수량은 1 이상의 정수여야 합니다.');
    try {
      await onSave(next);
      setWidth(''); setLength(''); setQuantity('1'); setNote(''); setLocalError(null);
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : '자투리를 저장하지 못했습니다.');
    }
  };

  return (
    <View style={styles.panel} accessibilityLabel="자투리 필름 재고">
      <Text style={styles.eyebrow}>REMNANT INVENTORY</Text>
      <Text style={styles.title} accessibilityRole="header">자투리 필름</Text>
      <Text style={styles.subtitle}>남은 직사각형의 실제 폭과 길이를 그대로 저장합니다.</Text>
      <View style={styles.identityBadge}>
        <Text style={styles.identityLabel}>현재 제품</Text>
        <Text style={styles.identityValue}>{identifiersReady ? `${brand.trim()}${productNumber.trim() ? ` · ${productNumber.trim()}` : ' · 제품 번호 미입력'}` : '브랜드 필요'}</Text>
      </View>

      <View style={styles.formGrid}>
        <Field label="실제 폭" value={width} unit="mm" onChange={setWidth} />
        <Field label="실제 길이" value={length} unit="mm" onChange={setLength} />
        <Field label="동일 규격 수량" value={quantity} unit="개" onChange={setQuantity} integer />
        <View style={styles.fullField}>
          <Text style={styles.label}>메모</Text>
          <TextInput accessibilityLabel="자투리 메모" value={note} onChangeText={setNote} maxLength={120} style={styles.input} placeholder="선택 입력" placeholderTextColor="#94a3b8" />
        </View>
      </View>
      {localError && <Text accessibilityRole="alert" style={styles.error}>{localError}</Text>}
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="실제 크기로 자투리 저장" disabled={!identifiersReady || busy} onPress={save} style={[styles.saveButton, (!identifiersReady || busy) && styles.disabled]}>
        <Text style={styles.saveText}>실제 크기로 저장</Text>
      </TouchableOpacity>

      <View style={styles.listHeading}><Text style={styles.listTitle}>일치 재고</Text><Text style={styles.count}>{matching.length}</Text></View>
      {matching.length === 0 ? <Text style={styles.empty}>현재 제품과 일치하는 자투리가 없습니다.</Text> : matching.map((item) => {
        const uses = useById.get(item.id) ?? [];
        const plannedCount = uses.reduce((sum, use) => sum + use.producedQuantity, 0);
        const saved = uses.reduce((sum, use) => sum + use.savedNewRollLengthMm, 0);
        const status = uses.some((use) => use.optimizationStatus === 'approximate') ? 'approximate'
          : uses.some((use) => use.optimizationStatus === 'certified') ? 'certified' : 'exact';
        return (
          <View key={item.id} style={[styles.item, uses.length > 0 && styles.itemSelected]}>
            <View style={styles.itemTop}>
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle}>{item.widthMm} × {item.lengthMm} mm · {item.quantity}개</Text>
                <Text style={styles.itemMeta}>{item.note?.trim() || item.id}</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${item.widthMm} × ${item.lengthMm} 자투리 삭제`} disabled={busy} onPress={() => onDelete(item.id)} style={[styles.deleteButton, busy && styles.disabled]}>
                <Text style={styles.deleteText}>삭제</Text>
              </TouchableOpacity>
            </View>
            {uses.length > 0 && (
              <View style={styles.useBox}>
                <Text style={styles.useTitle}>이번 계산에서 사용 예정 · {statusLabel[status]}</Text>
                <Text style={styles.useMeta}>생산 {plannedCount}개 · 새 롤 약 {saved.toLocaleString()}mm 절감</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function Field({ label, value, unit, onChange, integer = false }: { label: string; value: string; unit: string; onChange(value: string): void; integer?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput accessibilityLabel={`${label} ${unit}`} inputMode="decimal" keyboardType="numeric" value={value} onChangeText={(text) => onChange(text.replace(integer ? /[^0-9]/g : /[^0-9.]/g, ''))} style={styles.numberInput} />
        <Text style={styles.unit}>{unit}</Text>
      </View>
    </View>
  );
}

const shadow = { shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 2 } as const;
const styles = StyleSheet.create({
  panel: { flex: 1, minWidth: 0, padding: 20, borderRadius: 20, backgroundColor: '#fff', ...shadow },
  eyebrow: { fontSize: 11, letterSpacing: 1.5, fontWeight: '800', color: '#0f766e' },
  title: { marginTop: 5, fontSize: 20, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 5, fontSize: 12, lineHeight: 18, color: '#64748b' },
  identityBadge: { marginTop: 15, padding: 12, borderRadius: 11, backgroundColor: '#f0fdfa' },
  identityLabel: { fontSize: 10, fontWeight: '800', color: '#0f766e' }, identityValue: { marginTop: 3, fontSize: 13, fontWeight: '800', color: '#134e4a' },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 16 }, field: { minWidth: 130, flex: 1 }, fullField: { width: '100%' },
  label: { marginBottom: 6, fontSize: 11, fontWeight: '700', color: '#475569' },
  inputWrap: { minHeight: 44, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#f8fafc' },
  numberInput: { flex: 1, minHeight: 44, paddingHorizontal: 11, fontSize: 14, color: '#0f172a' },
  input: { minHeight: 44, paddingHorizontal: 11, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, fontSize: 14, color: '#0f172a', backgroundColor: '#f8fafc' },
  unit: { paddingRight: 10, fontSize: 10, fontWeight: '700', color: '#94a3b8' },
  saveButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 12, borderRadius: 10, backgroundColor: '#0f766e' }, saveText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  error: { marginTop: 10, padding: 10, borderRadius: 8, color: '#991b1b', backgroundColor: '#fee2e2' }, disabled: { opacity: 0.45 },
  listHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 9 }, listTitle: { fontSize: 14, fontWeight: '800', color: '#334155' },
  count: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, fontSize: 11, fontWeight: '800', color: '#0f766e', backgroundColor: '#ccfbf1' },
  empty: { paddingVertical: 12, fontSize: 12, color: '#94a3b8' }, item: { marginBottom: 9, padding: 12, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 11, backgroundColor: '#f8fafc' },
  itemSelected: { borderColor: '#5eead4', backgroundColor: '#f0fdfa' }, itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, itemCopy: { flex: 1, minWidth: 0 },
  itemTitle: { fontSize: 13, fontWeight: '800', color: '#1e293b' }, itemMeta: { marginTop: 3, fontSize: 10, color: '#64748b' },
  deleteButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, borderRadius: 9, backgroundColor: '#fff1f2' }, deleteText: { fontSize: 11, fontWeight: '800', color: '#be123c' },
  useBox: { marginTop: 9, padding: 9, borderRadius: 8, backgroundColor: '#ccfbf1' }, useTitle: { fontSize: 11, fontWeight: '800', color: '#115e59' }, useMeta: { marginTop: 3, fontSize: 10, color: '#0f766e' },
});
