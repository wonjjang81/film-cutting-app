import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';

import { FilmLayoutPreview } from '../../src/features/cutting/FilmLayoutPreview';
import { createLayoutSvgMarkup } from '../../src/features/cutting/createLayoutSvgMarkup';
import { createCsv } from '../../src/features/export/createCsv';
import { createWorkOrderHtml } from '../../src/features/export/createWorkOrderHtml';
import { asyncStorageLibraryAdapter } from '../../src/features/library/asyncStorageLibraryAdapter';
import { LibraryDrawer } from '../../src/features/library/LibraryDrawer';
import { createLibraryRepository } from '../../src/features/library/libraryRepository';
import type { FilmPreset, FilmRemnant, LibraryDocument, SavedCuttingJob } from '../../src/features/library/models';
import { buildSavedCuttingJob, createUniqueUiId, type CuttingFormState, toRemnantPlanRequest } from '../../src/features/library/uiWorkflowHelpers';
import { planWithRemnants, type RemnantPlan, type RemnantPlanRequest } from '../../src/features/remnants/planWithRemnants';
import { RemnantInventoryPanel, type PlannedRemnantSummary, type RemnantDraft } from '../../src/features/remnants/RemnantInventoryPanel';
import { EstimateSummary } from '../../src/features/estimate/EstimateSummary';

const repository = createLibraryRepository(asyncStorageLibraryAdapter);
const emptyLibrary: LibraryDocument = { version: 1, presets: [], jobs: [], remnants: [] };
const BRAND_OPTIONS = ['영림', '현대', 'Lx', '삼성'] as const;
const FIXED_ROLL_WIDTH_MM = 1220;
const DEFAULT_GAP_MM = 0;
const DEFAULT_SIDE_MARGIN_MM = 5;
const DEFAULT_START_END_MARGIN_MM = 5;
const initialForm: CuttingFormState = {
  brand: BRAND_OPTIONS[0], productNumber: '', rollWidth: String(FIXED_ROLL_WIDTH_MM), pieceWidth: '250', pieceLength: '500',
  quantity: '20', gap: String(DEFAULT_GAP_MM), sideMargin: String(DEFAULT_SIDE_MARGIN_MM), startEndMargin: String(DEFAULT_START_END_MARGIN_MM), allowRotation: true,
};
const statusCopy = {
  exact: { title: '완전 최적', detail: '안전 예산 안에서 전체 우선순위를 정확히 계산했습니다.', tone: '#047857', bg: '#ecfdf5' },
  certified: { title: '하한 인증', detail: '원단 절약 경로가 물리적 최소 길이에 도달했습니다.', tone: '#0369a1', bg: '#e0f2fe' },
  approximate: { title: '원단 절약 계산', detail: '브라우저 안전 경로의 결과이며 전역 최적을 보장하지 않습니다.', tone: '#b45309', bg: '#fffbeb' },
} as const;

export default function FilmCutInputScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const libraryWide = width >= 1160;
  const [form, setForm] = useState<CuttingFormState>(initialForm);
  const [library, setLibrary] = useState<LibraryDocument>(emptyLibrary);
  const [plan, setPlan] = useState<RemnantPlan | null>(null);
  const [planRequest, setPlanRequest] = useState<RemnantPlanRequest | null>(null);
  const [draftJob, setDraftJob] = useState<SavedCuttingJob | null>(null);
  const [useRemnants, setUseRemnants] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const identifiersReady = form.brand.trim().length > 0;

  const refreshLibrary = useCallback(async (): Promise<LibraryDocument> => {
    const loaded = await repository.load();
    setLibrary(loaded.document);
    if (loaded.warnings.length > 0) setNotice(loaded.warnings.join(' '));
    return loaded.document;
  }, []);
  useEffect(() => { void refreshLibrary().catch((caught) => setError(messageOf(caught))); }, [refreshLibrary]);

  const computeAgainst = useCallback((nextForm: CuttingFormState, inventory: LibraryDocument, timestampMs = Date.now(), remnants = inventory.remnants) => {
    const normalizedForm = withProductionDefaults(nextForm);
    const request = toRemnantPlanRequest(normalizedForm, remnants);
    const nextPlan = planWithRemnants(request);
    const createdAt = new Date(timestampMs).toISOString();
    const nextJob = buildSavedCuttingJob({
      id: createUniqueUiId('job', timestampMs, inventory.jobs.map((job) => job.id)),
      name: request.productNumber ? `${request.brand} ${request.productNumber} 작업` : `${request.brand} 작업`, createdAt, request, plan: nextPlan, inventory: inventory.remnants,
    });
    setForm(normalizedForm); setPlanRequest(request); setPlan(nextPlan); setDraftJob(nextJob); setConfirmed(false);
    return { request, nextPlan, nextJob };
  }, []);

  const calculate = useCallback(async (nextForm = form, nextUseRemnants = useRemnants) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const latest = await refreshLibrary();
      const computed = computeAgainst(nextForm, latest, Date.now(), nextUseRemnants ? latest.remnants : []);
      await repository.saveJob(computed.nextJob);
      await refreshLibrary();
      setNotice('계산 및 프로젝트 저장이 완료되었습니다. 작업 확정 전까지 재고는 변경되지 않습니다.');
    } catch (caught) {
      setPlan(null); setPlanRequest(null); setDraftJob(null); setConfirmed(false); setError(messageOf(caught));
    } finally { setBusy(false); }
  }, [computeAgainst, form, refreshLibrary, useRemnants]);

  const reset = () => {
    setForm(initialForm); setUseRemnants(false); setPlan(null); setPlanRequest(null); setDraftJob(null); setConfirmed(false); setError(null); setNotice(null);
  };

  const confirmJob = async () => {
    if (plan === null || planRequest === null || draftJob === null || confirmed) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await repository.confirmJob(draftJob, plan.inventoryDelta);
      const latest = await refreshLibrary();
      setLibrary(latest); setConfirmed(true);
      const residualCount = plan.inventoryDelta.add.filter((item) => !plan.inventoryDelta.removeIds.includes(item.id)).length;
      setNotice(`작업을 확정했습니다. 재고 반영 완료 · 저장된 잔여 자투리 ${residualCount}건`);
    } catch (caught) {
      setError(`재고가 변경되어 확정하지 못했습니다. 최신 재고로 다시 계산했습니다. ${messageOf(caught)}`);
      try { const latest = await refreshLibrary(); computeAgainst(form, latest, Date.now(), useRemnants ? latest.remnants : []); }
      catch (refreshError) { setPlan(null); setPlanRequest(null); setDraftJob(null); setError(`최신 재고를 불러오지 못했습니다. ${messageOf(refreshError)}`); }
    } finally { setBusy(false); }
  };

  const savePreset = async () => {
    setBusy(true); setError(null);
    try {
      const request = toRemnantPlanRequest(form, []);
      const nowMs = Date.now(); const now = new Date(nowMs).toISOString();
      const preset: FilmPreset = {
        id: createUniqueUiId('preset', nowMs, library.presets.map((item) => item.id)),
        brand: request.brand, productNumber: request.productNumber, rollWidthMm: request.rollWidthMm,
        pieceWidthMm: request.pieceWidthMm, pieceLengthMm: request.pieceLengthMm, gapMm: request.gapMm,
        sideMarginMm: request.sideMarginMm, startEndMarginMm: request.startEndMarginMm,
        allowRotation: request.allowRotation, createdAt: now, updatedAt: now,
      };
      await repository.savePreset(preset); await refreshLibrary(); setNotice('현재 규격을 프리셋으로 저장했습니다.');
    } catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  };

  const loadPreset = (preset: FilmPreset) => void calculate({
    brand: preset.brand, productNumber: preset.productNumber, rollWidth: String(FIXED_ROLL_WIDTH_MM),
    pieceWidth: String(preset.pieceWidthMm), pieceLength: String(preset.pieceLengthMm), quantity: form.quantity,
    gap: String(DEFAULT_GAP_MM), sideMargin: String(DEFAULT_SIDE_MARGIN_MM), startEndMargin: String(DEFAULT_START_END_MARGIN_MM), allowRotation: true,
  });
  const loadJob = (job: SavedCuttingJob) => void calculate({
    brand: job.brand, productNumber: job.productNumber, rollWidth: String(FIXED_ROLL_WIDTH_MM),
    pieceWidth: String(job.input.pieceWidthMm), pieceLength: String(job.input.pieceLengthMm), quantity: String(job.input.quantity),
    gap: String(DEFAULT_GAP_MM), sideMargin: String(DEFAULT_SIDE_MARGIN_MM), startEndMargin: String(DEFAULT_START_END_MARGIN_MM), allowRotation: true,
  });
  const deletePreset = async (id: string) => withBusy(async () => { await repository.deletePreset(id); await refreshLibrary(); }, setBusy, setError);
  const deleteJob = async (id: string) => withBusy(async () => { await repository.deleteJob(id); await refreshLibrary(); }, setBusy, setError);
  const renameJob = async (id: string, name: string) => withBusy(async () => { await repository.renameJob(id, name, new Date().toISOString()); await refreshLibrary(); }, setBusy, setError);
  const saveProject = async () => {
    if (!draftJob) return;
    setBusy(true); setError(null);
    try { await repository.saveJob(draftJob); await refreshLibrary(); setNotice('현재 계산 결과를 프로젝트로 저장했습니다.'); }
    catch (caught) { setError(`프로젝트를 저장하지 못했습니다. ${messageOf(caught)}`); }
    finally { setBusy(false); }
  };

  const saveRemnant = async (draft: RemnantDraft) => {
    const brand = form.brand.trim(); const productNumber = form.productNumber.trim();
    if (!brand) throw new Error('브랜드를 먼저 선택해 주세요.');
    setBusy(true);
    try {
      const nowMs = Date.now(); const now = new Date(nowMs).toISOString();
      const remnant: FilmRemnant = {
        id: createUniqueUiId('remnant', nowMs, library.remnants.map((item) => item.id)), brand, productNumber,
        widthMm: draft.widthMm, lengthMm: draft.lengthMm, quantity: draft.quantity, createdAt: now, updatedAt: now,
        ...(draft.note === undefined ? {} : { note: draft.note }),
      };
      await repository.saveRemnant(remnant);
      const latest = await refreshLibrary(); if (plan !== null) computeAgainst(form, latest, Date.now(), useRemnants ? latest.remnants : []);
      setNotice('자투리의 실제 크기를 저장했습니다.');
    } finally { setBusy(false); }
  };
  const deleteRemnant = async (id: string) => {
    setBusy(true); setError(null);
    try { await repository.deleteRemnant(id); const latest = await refreshLibrary(); if (plan !== null) computeAgainst(form, latest, Date.now(), useRemnants ? latest.remnants : []); setNotice('자투리 재고를 삭제했습니다.'); }
    catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  };

  const preview = useMemo(() => {
    if (plan?.newRollResult) return { result: plan.newRollResult, widthMm: planRequest?.rollWidthMm ?? 0, sideMarginMm: planRequest?.sideMarginMm ?? 0, startEndMarginMm: planRequest?.startEndMarginMm ?? 0, title: '새 연속 롤 배치' };
    const use = plan?.remnantUses[0]; const source = use && planRequest?.remnants.find((item) => item.id === use.remnantId);
    return use && source ? { result: use.result, widthMm: source.widthMm, sideMarginMm: planRequest?.sideMarginMm ?? 0, startEndMarginMm: planRequest?.startEndMarginMm ?? 0, title: '자투리 배치' } : null;
  }, [plan, planRequest]);

  const exportCsv = async () => {
    if (!draftJob) return; setBusy(true); setError(null);
    try {
      const csv = createCsv(draftJob); const filename = `${safeFilename(draftJob.name)}.csv`;
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
      } else {
        const FileSystem = await import('expo-file-system/legacy'); const uri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'CSV 작업지시서 공유' });
        else throw new Error('이 기기에서는 파일 공유를 사용할 수 없습니다.');
      }
      setNotice('CSV 작업지시서를 준비했습니다.');
    } catch (caught) { setError(`CSV를 내보내지 못했습니다. ${messageOf(caught)}`); } finally { setBusy(false); }
  };
  const exportPdf = async () => {
    if (!draftJob) return; setBusy(true); setError(null);
    try {
      const svg = preview ? createLayoutSvgMarkup({ result: preview.result, rollWidthMm: preview.widthMm, displayLengthMm: preview.result.usedLengthMm, sideMarginMm: preview.sideMarginMm, startEndMarginMm: preview.startEndMarginMm }) : '';
      const html = createWorkOrderHtml(draftJob, svg);
      if (Platform.OS === 'web') await Print.printAsync({ html });
      else { const file = await Print.printToFileAsync({ html }); if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'PDF 작업지시서 공유' }); else throw new Error('이 기기에서는 파일 공유를 사용할 수 없습니다.'); }
      setNotice('인쇄용 작업지시서를 준비했습니다.');
    } catch (caught) { setError(`PDF를 내보내지 못했습니다. ${messageOf(caught)}`); } finally { setBusy(false); }
  };

  const plannedUses: PlannedRemnantSummary[] = plan?.remnantUses.map((use) => ({ remnantId: use.remnantId, producedQuantity: use.producedQuantity, savedNewRollLengthMm: use.savedNewRollLengthMm, optimizationStatus: use.result.optimizationStatus })) ?? [];
  const resultStatus = draftJob ? statusCopy[draftJob.result.optimizationStatus] : null;

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.pageContent, width < 420 && styles.pageContentSmall]} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={styles.headerCopy}><Text style={styles.eyebrow}>CONTINUOUS ROLL WORKSPACE</Text><Text style={styles.title} accessibilityRole="header">필름 재단 생산 계획</Text><Text style={styles.description}>자투리를 먼저 사용하고 부족한 수량만 새 연속 롤에서 계산합니다.</Text></View>
        <View style={styles.headerActions}><View style={styles.modeBadge}><Text style={styles.modeText}>원단 절약 우선</Text></View><TouchableOpacity accessibilityRole="button" onPress={reset} disabled={busy} style={[styles.resetButton, busy && styles.disabled]}><Text style={styles.resetText}>입력 초기화</Text></TouchableOpacity></View>
      </View>
      {(error || notice) && <View accessibilityLiveRegion="polite" style={[styles.message, error ? styles.messageError : styles.messageInfo]}><Text style={error ? styles.messageErrorText : styles.messageInfoText}>{error ?? notice}</Text></View>}

      <View style={[styles.workspace, wide && styles.workspaceWide]}>
        <View style={[styles.panel, wide && styles.inputPanelWide]}>
          <PanelHeading step="01" title="생산 조건" subtitle="모든 치수 단위는 mm입니다." />
          <View style={styles.identityGrid}><BrandSelect value={form.brand} onChange={(brand) => setForm((current) => ({ ...current, brand }))} /><TextField label="제품 번호 (선택)" value={form.productNumber} onChange={(productNumber) => setForm((current) => ({ ...current, productNumber }))} /></View>
          <FormSection title="원단과 제품" fields={[[ 'pieceWidth', '재단 폭', 'mm' ], [ 'pieceLength', '재단 길이', 'mm' ], [ 'quantity', '필요 수량', '개' ]]} form={form} setForm={setForm} />
          <FixedProductionConditions />
          <View style={styles.switchCard}><View style={styles.switchCopy}><Text style={styles.switchTitle}>자투리 사용</Text><Text style={styles.switchDescription}>{useRemnants ? '브랜드 기준으로 사용 가능한 자투리를 먼저 배치합니다.' : '새 원본 롤만 계산합니다. 필요할 때 켜 주세요.'}</Text></View><Switch accessibilityLabel="자투리 사용" value={useRemnants} disabled={busy} onValueChange={(value) => { setUseRemnants(value); void calculate(form, value); }} trackColor={{ false: '#cbd5e1', true: '#99f6e4' }} thumbColor={useRemnants ? '#0f766e' : '#f8fafc'} /></View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="자투리 우선 자동 배치 계산" disabled={busy} onPress={() => void calculate()} style={[styles.primaryButton, busy && styles.disabled]}><Text style={styles.primaryButtonText}>{busy ? '처리 중…' : '자투리 우선 자동 배치'}</Text><Text style={styles.arrow}>→</Text></TouchableOpacity>
        </View>
        <View style={[styles.panel, styles.previewPanel]}><PanelHeading step="02" title="배치 미리보기" subtitle={preview?.title ?? '계산 후 연속 롤 도면을 표시합니다.'} dark /><FilmLayoutPreview result={preview?.result ?? null} rollWidthMm={preview?.widthMm ?? Number(form.rollWidth)} sideMarginMm={preview?.sideMarginMm ?? Number(form.sideMargin)} startEndMarginMm={preview?.startEndMarginMm ?? Number(form.startEndMargin)} /></View>
      </View>

      {plan && draftJob && resultStatus && <View style={styles.resultSection} accessibilityRole="summary">
        <View style={styles.resultHeading}><View><Text style={styles.eyebrow}>MATERIAL PLAN</Text><Text style={styles.resultTitle}>원단 사용 계획</Text></View><View style={[styles.statusBadge, { backgroundColor: resultStatus.bg }]}><Text style={[styles.statusText, { color: resultStatus.tone }]}>{resultStatus.title}</Text></View></View>
        <Text style={styles.statusDetail}>{resultStatus.detail}</Text>
        <View style={styles.metrics}><Metric label="자투리 사용" value={`${plan.remnantUses.length}개`} accent="#0f766e" /><Metric label="새 롤 필요 수량" value={`${plan.newRollQuantity}개`} accent="#2563eb" /><Metric label="새 롤 사용 길이" value={`${(plan.newRollResult?.usedLengthMm ?? 0).toLocaleString()} mm`} accent="#7c3aed" /><Metric label="전체 면적 수율" value={`${draftJob.result.utilizationPercent}%`} accent="#059669" /></View>
        {plan.remnantUses.length > 0 && <View style={styles.useList}>{plan.remnantUses.map((use, index) => <Text key={`${use.remnantId}-${index}`} style={styles.useLine}>• {use.remnantId} · {use.producedQuantity}개 생산 · 새 롤 {use.savedNewRollLengthMm.toLocaleString()}mm 절감 · {statusCopy[use.result.optimizationStatus].title}</Text>)}</View>}
        <View style={[styles.confirmBar, confirmed ? styles.confirmedBar : styles.tentativeBar]}><View style={styles.confirmCopy}><Text style={styles.confirmTitle}>{confirmed ? '재고 반영 완료' : '재고 미반영'}</Text><Text style={styles.confirmMeta}>{confirmed ? '작업 이력과 잔여 자투리를 저장했습니다.' : '계산만 완료된 상태입니다. 확정 전에는 재고가 바뀌지 않습니다.'}</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="작업 확정 및 자투리 재고 반영" disabled={busy || confirmed} onPress={confirmJob} style={[styles.confirmButton, (busy || confirmed) && styles.disabled]}><Text style={styles.confirmButtonText}>{confirmed ? '확정 완료' : '작업 확정'}</Text></TouchableOpacity></View>
        <EstimateSummary job={draftJob} compact />
        <View style={styles.exportRow}><TouchableOpacity accessibilityRole="button" accessibilityLabel="프로젝트 저장" disabled={busy} onPress={() => void saveProject()} style={[styles.secondaryButton, busy && styles.disabled]}><Text style={styles.secondaryButtonText}>프로젝트 저장</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="CSV 작업지시서 내보내기" disabled={busy} onPress={exportCsv} style={[styles.secondaryButton, busy && styles.disabled]}><Text style={styles.secondaryButtonText}>CSV 내보내기</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="PDF 작업지시서 인쇄 또는 공유" disabled={busy} onPress={exportPdf} style={[styles.secondaryButton, busy && styles.disabled]}><Text style={styles.secondaryButtonText}>PDF·인쇄</Text></TouchableOpacity></View>
      </View>}

      <View style={[styles.libraryGrid, libraryWide && styles.libraryGridWide]}>
        <RemnantInventoryPanel brand={form.brand} productNumber={form.productNumber} remnants={library.remnants} plannedUses={plannedUses} identifiersReady={identifiersReady} busy={busy} onSave={saveRemnant} onDelete={deleteRemnant} />
        <LibraryDrawer presets={library.presets} jobs={library.jobs} identifiersReady={identifiersReady} busy={busy} onSavePreset={() => void savePreset()} onLoadPreset={loadPreset} onDeletePreset={(id) => void deletePreset(id)} onLoadJob={loadJob} onRenameJob={(id, name) => void renameJob(id, name)} onDeleteJob={(id) => void deleteJob(id)} />
      </View>
    </ScrollView>
  );
}

type NumericKey = Exclude<keyof CuttingFormState, 'brand' | 'productNumber' | 'allowRotation'>;
function FormSection({ title, fields, form, setForm }: { title: string; fields: [NumericKey, string, string][]; form: CuttingFormState; setForm: React.Dispatch<React.SetStateAction<CuttingFormState>> }) {
  return <View style={styles.group}><Text style={styles.groupTitle}>{title}</Text><View style={styles.fieldGrid}>{fields.map(([key, label, unit]) => <NumericField key={key} label={label} unit={unit} value={form[key]} integer={key === 'quantity'} onChange={(value) => setForm((current) => ({ ...current, [key]: value }))} />)}</View></View>;
}
function NumericField({ label, unit, value, onChange, integer = false }: { label: string; unit: string; value: string; onChange(value: string): void; integer?: boolean }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={styles.inputWrap}><TextInput accessibilityLabel={`${label} ${unit}`} inputMode="decimal" keyboardType="numeric" selectTextOnFocus style={styles.input} value={value} onChangeText={(text) => onChange(text.replace(integer ? /[^0-9]/g : /[^0-9.]/g, ''))} /><Text style={styles.unit}>{unit}</Text></View></View>; }
function TextField({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) { return <View style={styles.textField}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} autoCapitalize="none" value={value} onChangeText={onChange} style={styles.textInput} placeholder={`${label} 입력`} placeholderTextColor="#94a3b8" /></View>; }
function BrandSelect({ value, onChange }: { value: string; onChange(value: string): void }) {
  const [open, setOpen] = useState(false);
  return <View style={styles.brandField}>
    <Text style={styles.label}>제품 브랜드</Text>
    <TouchableOpacity accessibilityRole="combobox" accessibilityLabel="제품 브랜드" accessibilityState={{ expanded: open }} onPress={() => setOpen((current) => !current)} style={styles.selectButton}>
      <Text style={[styles.selectText, !value && styles.selectPlaceholder]}>{value || '브랜드 선택'}</Text><Text style={styles.selectChevron}>{open ? '⌃' : '⌄'}</Text>
    </TouchableOpacity>
    {open && <View style={styles.optionList}>{BRAND_OPTIONS.map((brand) => <TouchableOpacity key={brand} accessibilityRole="button" accessibilityState={{ selected: value === brand }} onPress={() => { onChange(brand); setOpen(false); }} style={[styles.option, value === brand && styles.optionSelected]}><Text style={[styles.optionText, value === brand && styles.optionTextSelected]}>{brand}</Text></TouchableOpacity>)}</View>}
  </View>;
}
function FixedProductionConditions() {
  return <View style={styles.fixedConditions}><View style={styles.fixedConditionHeader}><Text style={styles.groupTitle}>재단 조건</Text><Text style={styles.fixedBadge}>고정</Text></View><Text style={styles.fixedConditionText}>원본 롤 폭 {FIXED_ROLL_WIDTH_MM.toLocaleString()} mm</Text><Text style={styles.fixedConditionText}>간격 {DEFAULT_GAP_MM} mm · 좌우 여백 {DEFAULT_SIDE_MARGIN_MM} mm · 시작·끝 여백 {DEFAULT_START_END_MARGIN_MM} mm</Text></View>;
}
function PanelHeading({ step, title, subtitle, dark = false }: { step: string; title: string; subtitle: string; dark?: boolean }) { return <View style={styles.panelHeader}><View style={styles.panelHeaderCopy}><Text style={styles.panelTitle}>{title}</Text><Text style={styles.panelSubtitle}>{subtitle}</Text></View><View style={[styles.stepBadge, dark && styles.stepBadgeDark]}><Text style={[styles.stepText, dark && styles.stepTextLight]}>{step}</Text></View></View>; }
function Metric({ label, value, accent }: { label: string; value: string; accent: string }) { return <View style={styles.metric}><View style={[styles.metricAccent, { backgroundColor: accent }]} /><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }
function messageOf(value: unknown): string { return value instanceof Error ? value.message : '요청을 처리하지 못했습니다.'; }
function safeFilename(value: string): string { return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'film-cutting-work-order'; }
function withProductionDefaults(form: CuttingFormState): CuttingFormState {
  const brand = BRAND_OPTIONS.includes(form.brand as (typeof BRAND_OPTIONS)[number]) ? form.brand : BRAND_OPTIONS[0];
  return { ...form, brand, rollWidth: String(FIXED_ROLL_WIDTH_MM), gap: String(DEFAULT_GAP_MM), sideMargin: String(DEFAULT_SIDE_MARGIN_MM), startEndMargin: String(DEFAULT_START_END_MARGIN_MM), allowRotation: true };
}
async function withBusy(operation: () => Promise<void>, setBusy: (value: boolean) => void, setError: (value: string | null) => void) { setBusy(true); setError(null); try { await operation(); } catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); } }

const shadow = { shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 3 } as const;
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f5f9' }, pageContent: { width: '100%', maxWidth: 1400, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 32, paddingBottom: 72 }, pageContentSmall: { paddingHorizontal: 12, paddingTop: 20 },
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18, marginBottom: 24 }, headerCopy: { flex: 1, minWidth: 240 }, headerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, fontWeight: '800', color: '#2563eb' }, title: { marginTop: 6, fontSize: 32, lineHeight: 40, fontWeight: '800', letterSpacing: -0.8, color: '#0f172a' }, description: { marginTop: 7, fontSize: 14, lineHeight: 21, color: '#64748b' },
  modeBadge: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, borderRadius: 999, backgroundColor: '#dbeafe' }, modeText: { fontSize: 12, fontWeight: '800', color: '#1d4ed8' }, resetButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 15, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' }, resetText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  message: { marginBottom: 18, padding: 13, borderRadius: 10, borderWidth: 1 }, messageInfo: { borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }, messageError: { borderColor: '#fecaca', backgroundColor: '#fff1f2' }, messageInfoText: { color: '#1e40af' }, messageErrorText: { color: '#991b1b' },
  workspace: { gap: 20 }, workspaceWide: { flexDirection: 'row', alignItems: 'stretch' }, panel: { minWidth: 0, padding: 21, borderRadius: 20, backgroundColor: '#fff', ...shadow }, inputPanelWide: { width: 450, flexShrink: 0 }, previewPanel: { flex: 1, minHeight: 560 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20 }, panelHeaderCopy: { flex: 1 }, panelTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' }, panelSubtitle: { marginTop: 5, fontSize: 12, lineHeight: 18, color: '#64748b' }, stepBadge: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#eff6ff' }, stepBadgeDark: { backgroundColor: '#0f172a' }, stepText: { fontSize: 12, fontWeight: '800', color: '#2563eb' }, stepTextLight: { color: '#fff' },
  identityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, textField: { minWidth: 170, flex: 1 }, brandField: { minWidth: 170, flex: 1, zIndex: 10 }, label: { marginBottom: 6, fontSize: 12, fontWeight: '700', color: '#475569' }, textInput: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, fontSize: 15, fontWeight: '700', color: '#0f172a', backgroundColor: '#f8fafc' }, selectButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#f8fafc' }, selectText: { fontSize: 15, fontWeight: '700', color: '#0f172a' }, selectPlaceholder: { color: '#94a3b8' }, selectChevron: { fontSize: 18, color: '#64748b' }, optionList: { position: 'absolute', top: 73, left: 0, right: 0, overflow: 'hidden', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#fff', ...shadow }, option: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }, optionSelected: { backgroundColor: '#eff6ff' }, optionText: { fontSize: 14, color: '#334155' }, optionTextSelected: { color: '#1d4ed8', fontWeight: '800' },
  group: { marginTop: 18, paddingTop: 17, borderTopWidth: 1, borderTopColor: '#e2e8f0' }, groupTitle: { marginBottom: 11, fontSize: 14, fontWeight: '800', color: '#1e293b' }, fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, field: { minWidth: 130, flexGrow: 1, flexBasis: '46%' }, inputWrap: { minHeight: 46, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#f8fafc' }, input: { flex: 1, minHeight: 44, paddingHorizontal: 12, fontSize: 15, fontWeight: '700', color: '#0f172a' }, unit: { paddingRight: 11, fontSize: 10, fontWeight: '700', color: '#94a3b8' }, fixedConditions: { marginTop: 18, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }, fixedConditionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, fixedBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: 10, fontWeight: '800' }, fixedConditionText: { marginTop: 5, fontSize: 11, color: '#1e40af' }, switchCard: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 13, marginTop: 15, padding: 14, borderRadius: 12, backgroundColor: '#f0fdfa' }, switchCopy: { flex: 1 }, switchTitle: { fontSize: 13, fontWeight: '800', color: '#115e59' }, switchDescription: { marginTop: 3, fontSize: 10, lineHeight: 15, color: '#0f766e' }, primaryButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16, borderRadius: 12, backgroundColor: '#2563eb' }, primaryButtonText: { fontSize: 14, fontWeight: '800', color: '#fff' }, arrow: { fontSize: 19, color: '#bfdbfe' }, disabled: { opacity: 0.45 },
  resultSection: { marginTop: 22, padding: 22, borderRadius: 20, backgroundColor: '#fff', ...shadow }, resultHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, resultTitle: { marginTop: 4, fontSize: 23, fontWeight: '800', color: '#0f172a' }, statusBadge: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 }, statusText: { fontSize: 12, fontWeight: '800' }, statusDetail: { marginTop: 8, fontSize: 12, lineHeight: 18, color: '#64748b' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 }, metric: { minWidth: 170, flex: 1, padding: 15, overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' }, metricAccent: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4 }, metricLabel: { marginLeft: 3, fontSize: 11, color: '#64748b' }, metricValue: { marginTop: 6, marginLeft: 3, fontSize: 19, fontWeight: '800', color: '#0f172a' }, useList: { marginTop: 14, gap: 5 }, useLine: { fontSize: 11, lineHeight: 17, color: '#475569' },
  confirmBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 17, padding: 14, borderRadius: 12, borderWidth: 1 }, tentativeBar: { borderColor: '#fbbf24', backgroundColor: '#fffbeb' }, confirmedBar: { borderColor: '#6ee7b7', backgroundColor: '#ecfdf5' }, confirmCopy: { flex: 1, minWidth: 210 }, confirmTitle: { fontSize: 14, fontWeight: '800', color: '#1e293b' }, confirmMeta: { marginTop: 3, fontSize: 11, lineHeight: 17, color: '#64748b' }, confirmButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#0f172a' }, confirmButtonText: { fontSize: 13, fontWeight: '800', color: '#fff' }, exportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 }, secondaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#fff' }, secondaryButtonText: { fontSize: 12, fontWeight: '800', color: '#334155' }, libraryGrid: { gap: 20, marginTop: 22 }, libraryGridWide: { flexDirection: 'row', alignItems: 'flex-start' },
});
