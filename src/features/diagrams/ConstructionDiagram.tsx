import { createElement, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Platform, Text, View } from 'react-native';
import { useAuthSession } from '../auth/AuthSession';
import { diagramStorageKey, parseDiagramSelection, parseDiagramState, type DiagramSelection, type DiagramState } from './diagramState';

const queues = new Map<string, Promise<void>>();

/** Sandboxed, network-disabled canvas. Only this host can read/write local state. */
export function ConstructionDiagram({ mode, onSelect }: { mode: 'picker' | 'editor'; onSelect?(selection: DiagramSelection): void }) {
  const auth = useAuthSession();
  const key = diagramStorageKey(auth.user?.id ?? 'local');
  const frame = useRef<HTMLIFrameElement>(null);
  const callback = useRef(onSelect); callback.current = onSelect;
  const current = useRef<DiagramState | null>(null);
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
        const parsed = raw ? parseDiagramState(JSON.parse(raw)) : null;
        if (raw && !parsed) throw new Error('도면 저장 데이터가 손상되었습니다. 원본은 보존했습니다.');
        if (!active) return;
        current.current = parsed; setError(''); setLoadedKey(key); setReady(true);
        frame.current?.contentWindow?.postMessage({ type: 'diagram-init', state: parsed }, '*');
      } catch (e) { if (active) { setReady(false); setError(e instanceof Error ? e.message : '도면 데이터를 읽지 못했습니다.'); } }
    })();
    return () => { active = false; };
  }, [key]);
  useFocusEffect(load);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const receive = (event: MessageEvent) => {
      if (loadedKey !== key || !frame.current || event.source !== frame.current.contentWindow || !event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'diagram-ready' && ready) frame.current.contentWindow?.postMessage({ type: 'diagram-init', state: current.current }, '*');
      if (event.data.type === 'diagram-height' && Number.isFinite(event.data.height)) setHeight(Math.max(180, Math.min(6000, event.data.height)));
      if (event.data.type === 'diagram-select' && mode === 'picker' && ready) {
        const selection = parseDiagramSelection(event.data.selection);
        if (selection) callback.current?.(selection);
      }
      if (event.data.type === 'diagram-save' && mode === 'editor' && ready) {
        const next = parseDiagramState(event.data.state);
        if (!next) { setError('유효하지 않은 도면 변경은 저장하지 않았습니다.'); return; }
        current.current = next;
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
  }, [key, mode, ready, loadedKey]);
  if (Platform.OS !== 'web') return <Text>모눈 도면은 웹 브라우저에서 사용할 수 있습니다.</Text>;
  return <View style={{ marginTop: 14, width: '100%' }}>
    {!!error && <Text accessibilityRole="alert" style={{ color: '#b91c1c', padding: 12 }}>{error}</Text>}
    {!ready && !error && <Text>도면 불러오는 중…</Text>}
    {ready && loadedKey === key && createElement('iframe', {
      key, ref: frame, title: mode === 'editor' ? '모눈 도면제작' : '시공부위 도면선택',
      src: `/construction-diagram.html?mode=${mode}`, sandbox: 'allow-scripts',
      style: { width: '100%', height, border: 0, display: 'block' },
      onLoad: () => frame.current?.contentWindow?.postMessage({ type: 'diagram-init', state: current.current }, '*'),
    })}
  </View>;
}
