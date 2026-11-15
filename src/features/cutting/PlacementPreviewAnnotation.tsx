import React from 'react';
import { G, Line, Text as SvgText } from 'react-native-svg';
import { completionCrossMetrics, formatPlacementAnnotation, placementTextMetrics } from './previewAnnotationModel';

type Props = {
  id: number; x: number; y: number; width: number; height: number;
  rotated: boolean; completed: boolean; color: string; pieceName?: string;
};

/** Preserve the original labels and apply 30% opacity to the completion X as one group. */
export function PlacementPreviewAnnotation({ id, x, y, width, height, rotated, completed, color, pieceName }: Props) {
  const annotation = formatPlacementAnnotation(pieceName ? `#${id} (${pieceName})` : `#${id}`, width, height, rotated);
  const { labelFontSize, dimensionFontSize, rotateText } = placementTextMetrics(width, height, annotation);
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const cross = completionCrossMetrics(width, height);
  return <>
    <G transform={rotateText ? `rotate(90 ${centerX} ${centerY})` : undefined}>
      <SvgText x={centerX} y={centerY - dimensionFontSize * 0.2} textAnchor="middle" fontSize={labelFontSize} fontWeight={pieceName ? "400" : "900"} fill={pieceName ? "#0f172a" : color}>{annotation.label}</SvgText>
      <SvgText x={centerX} y={centerY + labelFontSize * 0.8} textAnchor="middle" fontSize={dimensionFontSize} fontWeight="700" fill="#334155">{annotation.dimensions}</SvgText>
    </G>
    {completed && <G accessibilityLabel={`제품 ${id} 재단 완료 표시`} opacity={0.3}>
      <Line x1={x + cross.insetX} y1={y + cross.insetY} x2={x + width - cross.insetX} y2={y + height - cross.insetY} stroke="#dc2626" strokeWidth={cross.strokeWidth} strokeLinecap="round" />
      <Line x1={x + width - cross.insetX} y1={y + cross.insetY} x2={x + cross.insetX} y2={y + height - cross.insetY} stroke="#dc2626" strokeWidth={cross.strokeWidth} strokeLinecap="round" />
    </G>}
  </>;
}
