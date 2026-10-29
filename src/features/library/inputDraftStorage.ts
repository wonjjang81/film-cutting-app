import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { inputDraftActiveKey, inputDraftKey, inputDraftWrites, parseActiveInputProject, parseInputDraftBackup, type InputDraftBackup } from './inputDraftBackup';

let pending = Promise.resolve();
function webStorage(): Storage | null {
  return Platform.OS === 'web' && typeof window !== 'undefined' ? window.localStorage : null;
}
export async function loadInputDraft(ownerId: string, requestedProject?: string | null): Promise<{ draft: InputDraftBackup | null; recovered: boolean }> {
  await pending;
  const storage = webStorage();
  const read = (key: string) => storage ? Promise.resolve(storage.getItem(key)) : AsyncStorage.getItem(key);
  const activeRaw = requestedProject === undefined ? await read(inputDraftActiveKey(ownerId)) : null;
  const projectId = requestedProject === undefined ? parseActiveInputProject(activeRaw) : requestedProject;
  if (activeRaw && projectId === undefined) throw new Error('최근 입력의 프로젝트 정보를 읽지 못했습니다. 기존 백업은 보존했습니다.');
  if (projectId === undefined) return { draft: null, recovered: false };
  const key = inputDraftKey(ownerId, projectId);
  const primaryRaw = await read(key);
  const previousRaw = await read(`${key}:backup`);
  const primary = parseInputDraftBackup(primaryRaw, ownerId, projectId);
  const previous = parseInputDraftBackup(previousRaw, ownerId, projectId);
  if ((primaryRaw || previousRaw) && !primary && !previous) throw new Error('입력 백업을 읽지 못했습니다. 원본은 보존했으며 빈 입력으로 덮어쓰지 않습니다.');
  return { draft: primary ?? previous, recovered: !primary && !!previous };
}
/** Web writes are synchronous, including pagehide: no unload-time network or promise required. */
export function saveInputDraft(draft: InputDraftBackup, backup = false): Promise<void> {
  try {
    const storage = webStorage();
    if (storage) {
      for (const [key, raw] of inputDraftWrites(draft, backup)) storage.setItem(key, raw);
      return Promise.resolve();
    }
    const operation = pending.then(async () => {
      for (const [key, raw] of inputDraftWrites(draft, backup)) await AsyncStorage.setItem(key, raw);
    });
    pending = operation.catch(() => undefined);
    return operation;
  } catch (error) { return Promise.reject(error); }
}

export const INPUT_BACKUP_INTERVAL_MS = 60_000;
/** Timers may be delayed by browsers in background tabs; never accumulates old snapshots. */
export function startInputBackup(getDraft: () => InputDraftBackup | null, onError: (error: unknown) => void): () => void {
  const timer = setInterval(() => {
    const draft = getDraft();
    if (draft) void saveInputDraft({ ...draft, updatedAt: new Date().toISOString() }, true).catch(onError);
  }, INPUT_BACKUP_INTERVAL_MS);
  return () => clearInterval(timer);
}
