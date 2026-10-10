import React from 'react';
import { describe, expect, it, vi } from 'vitest';

const { renderToStaticMarkup } = require('react-dom/server') as { renderToStaticMarkup: (element: React.ReactElement) => string };
vi.mock('react-native-svg', () => ({
  G: ({ accessibilityLabel, ...props }: Record<string, unknown>) => React.createElement('g', { ...props, 'aria-label': accessibilityLabel }),
  Line: 'line', Rect: 'rect', Text: 'text',
}));

import { PlacementPreviewAnnotation } from './PlacementPreviewAnnotation';

describe('completion annotation rendering', () => {
  it.each([[950, 2350], [100, 450]])('keeps original labels without backing and uses a 30% X for #5 on %s×%s pieces', (width, height) => {
    const markup = renderToStaticMarkup(<PlacementPreviewAnnotation id={5} x={10} y={20} width={width} height={height} rotated={false} completed color="#1e3a8a" />);
    expect(markup).not.toContain('<rect');
    expect(markup).not.toContain('#ffffff');
    expect(markup).toMatch(/<g[^>]*opacity="0.3"[^>]*>[\s\S]*<line/);
    expect(markup.match(/<line/g)).toHaveLength(2);
    expect(markup).toContain('#5');
  });
  it.each([[1040, 2200], [100, 450]])('retains original #51 position and rotation for %s×%s pieces', (width, height) => {
    const markup = renderToStaticMarkup(<PlacementPreviewAnnotation id={51} x={0} y={0} width={width} height={height} rotated={false} completed color="#1e3a8a" />);
    expect(markup.indexOf('<text')).toBeLessThan(markup.indexOf('<line'));
    expect(markup).toContain('opacity="0.3"');
    expect(markup).toContain('#51');
    expect(markup).toContain('fill="#1e3a8a"');
    if (height > width * 3) expect(markup).toContain('rotate(90');
  });

  it('does not draw an X on an incomplete piece', () => {
    const markup = renderToStaticMarkup(<PlacementPreviewAnnotation id={51} x={0} y={0} width={1040} height={2200} rotated={false} completed={false} color="#1e3a8a" />);
    expect(markup).not.toContain('<line');
    expect(markup).not.toContain('<rect');
    expect(markup).toContain('#51');
  });
});
