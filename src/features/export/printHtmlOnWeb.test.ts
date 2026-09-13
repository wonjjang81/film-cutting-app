import { describe, expect, it, vi } from 'vitest';

import { printHtmlOnWeb } from './printHtmlOnWeb';

describe('printHtmlOnWeb', () => {
  it('prints the generated HTML in an isolated iframe and removes it afterward', async () => {
    const print = vi.fn();
    const focus = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn((frame: FakeFrame) => { frame.onload?.(); });
    const frame: FakeFrame = { style: {}, contentWindow: { print, focus }, remove, setAttribute: vi.fn() };
    const documentRef = { body: { appendChild }, createElement: vi.fn(() => frame) };

    await printHtmlOnWeb('<html><body>배치 도면</body></html>', documentRef as never);

    expect(frame.srcdoc).toContain('배치 도면');
    expect(focus).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });
});

type FakeFrame = {
  style: Record<string, string>;
  srcdoc?: string;
  onload?: (() => void) | null;
  contentWindow: { print(): void; focus(): void };
  remove(): void;
  setAttribute(name: string, value: string): void;
};
