import { describe, expect, it } from 'vitest';
import { recordManualLayoutChange, rebaseManualLayoutHistory, redoManualLayout, resetManualLayout, startManualLayoutHistory, undoManualLayout } from './manualLayoutHistory';

describe('manual layout history', () => {
  it('records, undoes, and redoes layout changes', () => {
    let history = startManualLayoutHistory('base');
    history = recordManualLayoutChange(history, 'base');
    history = recordManualLayoutChange(history, 'first');
    const undo = undoManualLayout(history, 'second')!;
    expect(undo.value).toBe('first');
    const redo = redoManualLayout(undo.history, undo.value)!;
    expect(redo.value).toBe('second');
  });

  it('resets to the baseline and allows undoing that reset', () => {
    const history = startManualLayoutHistory('base');
    const reset = resetManualLayout(history, 'changed');
    expect(reset.value).toBe('base');
    expect(undoManualLayout(reset.history, 'base')?.value).toBe('changed');
  });

  it('uses the most recently saved layout as the new reset baseline', () => {
    let history = startManualLayoutHistory('initial');
    history = recordManualLayoutChange(history, 'initial');
    history = recordManualLayoutChange(history, 'moved-once');

    const saved = rebaseManualLayoutHistory('saved-layout');
    expect(saved).toEqual({ baseline: 'saved-layout', past: [], future: [] });
    expect(resetManualLayout(saved, 'moved-after-save').value).toBe('saved-layout');
  });
});
