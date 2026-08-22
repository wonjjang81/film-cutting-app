import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import type { FilmPreset, SavedCuttingJob } from './models';

type Props = {
  presets: readonly FilmPreset[];
  jobs: readonly SavedCuttingJob[];
  identifiersReady: boolean;
  busy: boolean;
  onSavePreset(): void;
  onLoadPreset(preset: FilmPreset): void;
  onDeletePreset(id: string): void;
  onLoadJob(job: SavedCuttingJob): void;
  onRenameJob(id: string, name: string): void;
  onDeleteJob(id: string): void;
};

function includesQuery(values: readonly string[], query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase('ko-KR');
  return normalized.length === 0 || values.some((value) => value.toLocaleLowerCase('ko-KR').includes(normalized));
}

export function LibraryDrawer({
  presets,
  jobs,
  identifiersReady,
  busy,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
  onLoadJob,
  onRenameJob,
  onDeleteJob,
}: Props) {
  const [query, setQuery] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const filteredPresets = useMemo(
    () => presets.filter((preset) => includesQuery([preset.brand, preset.productNumber], query)),
    [presets, query],
  );
  const filteredJobs = useMemo(
    () => jobs.filter((job) => includesQuery([job.name, job.brand, job.productNumber], query)),
    [jobs, query],
  );

  const beginRename = (job: SavedCuttingJob) => {
    setRenameId(job.id);
    setRenameValue(job.name);
  };

  const submitRename = () => {
    if (renameId === null || renameValue.trim().length === 0) return;
    onRenameJob(renameId, renameValue.trim());
    setRenameId(null);
    setRenameValue('');
  };

  return (
    <View style={styles.panel} accessibilityLabel="프리셋과 작업 이력">
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>LIBRARY</Text>
          <Text style={styles.title} accessibilityRole="header">작업 라이브러리</Text>
          <Text style={styles.subtitle}>규격 프리셋과 확정 작업을 한곳에서 관리합니다.</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="현재 규격을 프리셋으로 저장"
          disabled={!identifiersReady || busy}
          onPress={onSavePreset}
          style={[styles.primarySmall, (!identifiersReady || busy) && styles.disabled]}
        >
          <Text style={styles.primarySmallText}>프리셋 저장</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        accessibilityLabel="프리셋과 작업 이력 검색"
        placeholder="브랜드, 제품 번호, 작업명 검색"
        placeholderTextColor="#94a3b8"
        value={query}
        onChangeText={setQuery}
        style={styles.search}
      />

      <SectionTitle title="규격 프리셋" count={filteredPresets.length} />
      {filteredPresets.length === 0 ? (
        <Text style={styles.empty}>저장된 프리셋이 없습니다.</Text>
      ) : filteredPresets.map((preset) => (
        <View key={preset.id} style={styles.item}>
          <View style={styles.itemCopy}>
            <Text style={styles.itemTitle}>{preset.brand} · {preset.productNumber}</Text>
            <Text style={styles.itemMeta}>
              롤 {preset.rollWidthMm}mm · 제품 {preset.pieceWidthMm}×{preset.pieceLengthMm}mm
            </Text>
          </View>
          <View style={styles.actions}>
            <Action label="불러오기" accessibilityLabel={`${preset.brand} ${preset.productNumber} 프리셋 불러오기`} busy={busy} onPress={() => onLoadPreset(preset)} />
            <Action label="삭제" accessibilityLabel={`${preset.brand} ${preset.productNumber} 프리셋 삭제`} busy={busy} danger onPress={() => onDeletePreset(preset.id)} />
          </View>
        </View>
      ))}

      <SectionTitle title="확정 작업 이력" count={filteredJobs.length} />
      {filteredJobs.length === 0 ? (
        <Text style={styles.empty}>확정된 작업 이력이 없습니다.</Text>
      ) : filteredJobs.map((job) => (
        <View key={job.id} style={styles.item}>
          {renameId === job.id ? (
            <View style={styles.renameBox}>
              <TextInput
                accessibilityLabel="새 작업명"
                autoFocus
                value={renameValue}
                onChangeText={setRenameValue}
                onSubmitEditing={submitRename}
                style={styles.renameInput}
              />
              <View style={styles.actions}>
                <Action label="저장" accessibilityLabel="작업명 저장" busy={busy || renameValue.trim().length === 0} onPress={submitRename} />
                <Action label="취소" accessibilityLabel="작업명 변경 취소" busy={busy} onPress={() => setRenameId(null)} />
              </View>
            </View>
          ) : (
            <>
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle}>{job.name}</Text>
                <Text style={styles.itemMeta}>{job.brand} · {job.productNumber} · {new Date(job.updatedAt).toLocaleString('ko-KR')}</Text>
              </View>
              <View style={styles.actions}>
                <Action label="불러오기" accessibilityLabel={`${job.name} 현재 재고로 다시 계산`} busy={busy} onPress={() => onLoadJob(job)} />
                <Action label="이름 변경" accessibilityLabel={`${job.name} 이름 변경`} busy={busy} onPress={() => beginRename(job)} />
                <Action label="삭제" accessibilityLabel={`${job.name} 작업 삭제`} busy={busy} danger onPress={() => onDeleteJob(job.id)} />
              </View>
            </>
          )}
        </View>
      ))}
    </View>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.countBadge}>{count}</Text>
    </View>
  );
}

function Action({
  label,
  accessibilityLabel,
  busy,
  danger = false,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  busy: boolean;
  danger?: boolean;
  onPress(): void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={busy}
      onPress={onPress}
      style={[styles.action, danger && styles.actionDanger, busy && styles.disabled]}
    >
      <Text style={[styles.actionText, danger && styles.actionDangerText]}>{label}</Text>
    </TouchableOpacity>
  );
}

const shadow = { shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 2 } as const;
const styles = StyleSheet.create({
  panel: { flex: 1, minWidth: 0, padding: 20, borderRadius: 20, backgroundColor: '#fff', ...shadow },
  headingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headingCopy: { flex: 1, minWidth: 190 },
  eyebrow: { fontSize: 11, letterSpacing: 1.5, fontWeight: '800', color: '#2563eb' },
  title: { marginTop: 5, fontSize: 20, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 5, fontSize: 12, lineHeight: 18, color: '#64748b' },
  primarySmall: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#2563eb' },
  primarySmallText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  search: { minHeight: 46, marginTop: 18, paddingHorizontal: 13, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 11, fontSize: 14, color: '#0f172a', backgroundColor: '#f8fafc' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 9 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#334155' },
  countBadge: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, fontSize: 11, fontWeight: '800', color: '#1d4ed8', backgroundColor: '#eff6ff' },
  item: { gap: 10, marginBottom: 10, padding: 13, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, backgroundColor: '#f8fafc' },
  itemCopy: { minWidth: 0 },
  itemTitle: { fontSize: 14, fontWeight: '800', color: '#1e293b' },
  itemMeta: { marginTop: 4, fontSize: 11, lineHeight: 17, color: '#64748b' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  action: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 9, backgroundColor: '#eff6ff' },
  actionText: { fontSize: 12, fontWeight: '800', color: '#1d4ed8' },
  actionDanger: { borderColor: '#fecaca', backgroundColor: '#fff1f2' },
  actionDangerText: { color: '#be123c' },
  renameBox: { gap: 9 },
  renameInput: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: '#60a5fa', borderRadius: 9, fontSize: 14, color: '#0f172a', backgroundColor: '#fff' },
  empty: { paddingVertical: 13, fontSize: 12, color: '#94a3b8' },
  disabled: { opacity: 0.45 },
});
