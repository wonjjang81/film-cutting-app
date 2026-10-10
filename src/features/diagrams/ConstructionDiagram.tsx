import { createElement, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Platform, Text, View } from 'react-native';
import { useAuthSession } from '../auth/AuthSession';
import { DIAGRAM_PARTS, diagramStorageKey, parseDiagramSelection, parseDiagramState, parseCabinetState, type CabinetState, type DiagramSelection, type DiagramState } from './diagramState';

const queues = new Map<string, Promise<void>>();

/** Sandboxed, network-disabled canvas. Only this host can read/write local state. */
export function ConstructionDiagram({ mode, onSelect, onPartChange, illustrationFocusRequest = 0, onIllustrationCenter }: { mode: 'picker' | 'editor' | 'cabinet'; onSelect?(selection: DiagramSelection): void; onPartChange?(part: string): void; illustrationFocusRequest?: number; onIllustrationCenter?(centerY: number): void }) {
  const auth = useAuthSession();
  const key = diagramStorageKey(auth.user?.id ?? 'local') + (mode === 'cabinet' ? ':cabinets' : '');
  const validate = mode === 'cabinet' ? parseCabinetState : parseDiagramState;
  const frame = useRef<HTMLIFrameElement>(null);
  const callback = useRef(onSelect); callback.current = onSelect;
  const partCallback = useRef(onPartChange); partCallback.current = onPartChange;
  const centerCallback = useRef(onIllustrationCenter); centerCallback.current = onIllustrationCenter;
  const current = useRef<DiagramState | CabinetState | null>(null);
  const presets = useRef<DiagramState['presets']>([]);
  const [ready, setReady] = useState(false);
  const [loadedKey, setLoadedKey] = useState('');
  const [error, setError] = useState('');
  const [height, setHeight] = useState(mode === 'editor' ? 1050 : 430);
  const load = useCallback(() => {
    let active = true;
    void (async () => {
      try {
        await queues.get(key);
        const raw = await AsyncStorage.getItem(key);
        const parsed = raw ? validate(JSON.parse(raw)) : null;
        if (raw && !parsed) throw new Error('도면 저장 데이터가 손상되었습니다. 원본은 보존했습니다.');
        if (mode === 'cabinet') {
          const gridKey = diagramStorageKey(auth.user?.id ?? 'local');
          await queues.get(gridKey);
          const gridRaw = await AsyncStorage.getItem(gridKey);
          const grid = gridRaw ? parseDiagramState(JSON.parse(gridRaw)) : null;
          if (gridRaw && !grid) throw new Error('프리셋 저장 데이터를 읽지 못했습니다. 원본은 보존했습니다.');
          presets.current = grid?.presets ?? [];
        }
        if (!active) return;
        current.current = parsed; setError(''); setLoadedKey(key); setReady(true);
        if (mode === 'cabinet' && parsed && 'view' in parsed) partCallback.current?.(DIAGRAM_PARTS[parsed.view as keyof typeof DIAGRAM_PARTS]);
        frame.current?.contentWindow?.postMessage({ type: 'diagram-init', state: parsed, presets: presets.current, canSelect: !!callback.current }, '*');
      } catch (e) { if (active) { setReady(false); setError(e instanceof Error ? e.message : '도면 데이터를 읽지 못했습니다.'); } }
    })();
    return () => { active = false; };
  }, [key, validate, mode, auth.user?.id]);
  useFocusEffect(load);
  useEffect(() => {
    if (ready && illustrationFocusRequest > 0) frame.current?.contentWindow?.postMessage({ type: 'diagram-focus-illustration' }, '*');
  }, [ready, illustrationFocusRequest]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const receive = (event: MessageEvent) => {
      if (loadedKey !== key || !frame.current || event.source !== frame.current.contentWindow || !event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'diagram-ready' && ready) frame.current.contentWindow?.postMessage({ type: 'diagram-init', state: current.current, presets: presets.current, canSelect: !!callback.current }, '*');
      if (event.data.type === 'diagram-height' && Number.isFinite(event.data.height)) setHeight(Math.max(180, Math.min(6000, event.data.height)));
      if (event.data.type === 'diagram-illustration-center' && ready && Number.isFinite(event.data.centerY) && event.data.centerY >= 0 && event.data.centerY <= 6000) centerCallback.current?.(event.data.centerY);
      if (event.data.type === 'diagram-select' && mode !== 'editor' && ready) {
        const selection = parseDiagramSelection(event.data.selection);
        if (selection) callback.current?.(selection);
      }
      if (event.data.type === 'diagram-save' && mode !== 'picker' && ready) {
        const next = validate(event.data.state);
        if (!next) { setError('유효하지 않은 도면 변경은 저장하지 않았습니다.'); return; }
        current.current = next;
        if (mode === 'cabinet' && 'view' in next) partCallback.current?.(DIAGRAM_PARTS[next.view as keyof typeof DIAGRAM_PARTS]);
        const pending = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
          const previous = await AsyncStorage.getItem(key);
          if (previous) await AsyncStorage.setItem(`${key}:backup`, previous);
          await AsyncStorage.setItem(key, JSON.stringify(next));
        });
        queues.set(key, pending);
        void pending.then(() => setError(''), () => setError('도면 저장에 실패했습니다. 저장 공간을 확인해 주세요.'));
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [key, mode, ready, loadedKey, validate]);
  if (Platform.OS !== 'web') return <Text>모눈 도면은 웹 브라우저에서 사용할 수 있습니다.</Text>;
  return <View style={{ marginTop: 14, width: '100%' }}>
    {!!error && <Text accessibilityRole="alert" style={{ color: '#b91c1c', padding: 12 }}>{error}</Text>}
    {!ready && !error && <Text>도면 불러오는 중…</Text>}
    {ready && loadedKey === key && createElement('iframe', {
      key, ref: frame, title: mode === 'editor' ? '모눈 도면제작' : '시공부위 도면선택',
      src: mode === 'cabinet' ? '/construction-cabinets.html' : `/construction-diagram.html?mode=${mode}`, sandbox: 'allow-scripts',
      style: { width: '100%', height, border: 0, display: 'block' },
      onLoad: () => frame.current?.contentWindow?.postMessage({ type: 'diagram-init', state: current.current, presets: presets.current, canSelect: !!callback.current }, '*'),
    })}
  </View>;
}
