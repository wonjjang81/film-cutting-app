import React from 'react';
import { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { completionCrossMetrics, formatPlacementPreview, placementTextMetrics } from './previewAnnotationModel';

type Props = {
  id: number; x: number; y: number; width: number; height: number;
  rotated: boolean; completed: boolean; color: string;
};

/** Completion marks stay behind a white text halo, including rotated annotations. */
export function PlacementPreviewAnnotation({ id, x, y, width, height, rotated, completed, color }: Props) {
  const annotation = formatPlacementPreview(id, width, height, rotated);
  const { labelFontSize, dimensionFontSize, rotateText } = placementTextMetrics(width, height, annotation);
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const cross = completionCrossMetrics(width, height);
  const along = rotateText ? height : width;
  const across = rotateText ? width : height;
  const idBackgroundWidth = Math.min(along * 0.94, labelFontSize * (annotation.label.length * 0.7 + 0.3));
  const idBackgroundHeight = Math.min(across * 0.9, labelFontSize * 1.25);
  const idBackgroundY = Math.max(centerY - across * 0.48, centerY - dimensionFontSize * 0.2 - labelFontSize * 0.98);
  return <>
    {completed && <G accessibilityLabel={`제품 ${id} 재단 완료 표시`}>
      <Line x1={x + cross.insetX} y1={y + cross.insetY} x2={x + width - cross.insetX} y2={y + height - cross.insetY} stroke="#dc2626" strokeWidth={cross.strokeWidth} strokeLinecap="round" />
      <Line x1={x + width - cross.insetX} y1={y + cross.insetY} x2={x + cross.insetX} y2={y + height - cross.insetY} stroke="#dc2626" strokeWidth={cross.strokeWidth} strokeLinecap="round" />
    </G>}
    <G transform={rotateText ? `rotate(90 ${centerX} ${centerY})` : undefined}>
      {completed && <Rect x={centerX - idBackgroundWidth / 2} y={idBackgroundY} width={idBackgroundWidth} height={idBackgroundHeight} rx={labelFontSize * 0.1} fill="#ffffff" />}
      {completed && <>
        <SvgText x={centerX} y={centerY - dimensionFontSize * 0.2} textAnchor="middle" fontSize={labelFontSize} fontWeight="900" fill="#ffffff" stroke="#ffffff" strokeWidth={labelFontSize * 0.16} strokeLinejoin="round">{annotation.label}</SvgText>
        <SvgText x={centerX} y={centerY + labelFontSize * 0.8} textAnchor="middle" fontSize={dimensionFontSize} fontWeight="700" fill="#ffffff" stroke="#ffffff" strokeWidth={dimensionFontSize * 0.16} strokeLinejoin="round">{annotation.dimensions}</SvgText>
      </>}
      <SvgText x={centerX} y={centerY - dimensionFontSize * 0.2} textAnchor="middle" fontSize={labelFontSize} fontWeight="900" fill={color}>{annotation.label}</SvgText>
      <SvgText x={centerX} y={centerY + labelFontSize * 0.8} textAnchor="middle" fontSize={dimensionFontSize} fontWeight="700" fill="#334155">{annotation.dimensions}</SvgText>
    </G>
  </>;
}
