import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  FlatList,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useFilm } from "@/lib/filmContext";
import {
  FILM_WIDTH,
  FilmGroup,
  GROUP_BORDER_COLORS,
  GROUP_COLORS,
  PlacedPiece,
  PlacementResult,
  formatM,
  formatNumber,
} from "@/lib/filmCutting";
import { exportCuttingLayoutPDF } from "@/lib/pdfGenerator";

const CANVAS_PADDING = 12;
const SNAP = 5;
const SNAP_EDGE = 30; // 인접 조각 스냅 임계값 (mm)

function snapToGrid(v: number) { return Math.round(v / SNAP) * SNAP; }

/**
 * 드래그 중인 조각(nx, ny, w, h)을 주변 조각 및 필름 경계에 스냅시킨다.
 * 스냅 가이드라인 좌표도 반환한다.
 */
function applyEdgeSnap(
  nx: number, ny: number, w: number, h: number,
  filmW: number,
  others: PlacedPiece[],
  dragKey: string,
): { x: number; y: number; guideX: number | null; guideY: number | null } {
  let bestX = nx;
  let bestY = ny;
  let minDX = SNAP_EDGE;
  let minDY = SNAP_EDGE;
  let guideX: number | null = null;
  let guideY: number | null = null;

  // 후보 X 스냅 가장자리: 필름 경계 + 다른 조각의 left/right
  const xCandidates: { edge: number; guide: number }[] = [
    { edge: 0, guide: 0 },                   // 필름 왼쪽 경계 (조각 left → 0)
    { edge: filmW - w, guide: filmW },        // 필름 오른쪽 경계 (조각 right → filmW)
  ];
  // 후보 Y 스냅 가장자리: y=0 + 다른 조각의 top/bottom
  const yCandidates: { edge: number; guide: number }[] = [
    { edge: 0, guide: 0 },                   // 필름 상단 경계
  ];

  for (const p of others) {
    if (`${p.id}_${p.instanceIndex}` === dragKey) continue;
    // X: 내 right → 상대 left (붙이기), 내 left → 상대 right
    xCandidates.push({ edge: p.x - w, guide: p.x });        // 내 오른쪽이 상대 왼쪽에 붙음
    xCandidates.push({ edge: p.x + p.width, guide: p.x + p.width }); // 내 왼쪽이 상대 오른쪽에 붙음
    xCandidates.push({ edge: p.x, guide: p.x });            // 내 왼쪽이 상대 왼쪽 정렬
    xCandidates.push({ edge: p.x + p.width - w, guide: p.x + p.width }); // 내 오른쪽이 상대 오른쪽 정렬
    // Y: 내 bottom → 상대 top, 내 top → 상대 bottom
    yCandidates.push({ edge: p.y - h, guide: p.y });         // 내 아래쪽이 상대 위쪽에 붙음
    yCandidates.push({ edge: p.y + p.height, guide: p.y + p.height }); // 내 위쪽이 상대 아래쪽에 붙음
    yCandidates.push({ edge: p.y, guide: p.y });             // 내 위쪽이 상대 위쪽 정렬
    yCandidates.push({ edge: p.y + p.height - h, guide: p.y + p.height }); // 내 아래쪽이 상대 아래쪽 정렬
  }

  for (const { edge, guide } of xCandidates) {
    const d = Math.abs(nx - edge);
    if (d < minDX) { minDX = d; bestX = edge; guideX = guide; }
  }
  for (const { edge, guide } of yCandidates) {
    const d = Math.abs(ny - edge);
    if (d < minDY) { minDY = d; bestY = edge; guideY = guide; }
  }

  // 스냅 없으면 5mm 그리드 스냅으로 폴백
  if (minDX >= SNAP_EDGE) bestX = snapToGrid(nx);
  if (minDY >= SNAP_EDGE) bestY = snapToGrid(ny);

  // 경계 클램프
  bestX = Math.max(0, Math.min(bestX, filmW - w));
  bestY = Math.max(0, bestY);

  return { x: bestX, y: bestY, guideX: minDX < SNAP_EDGE ? guideX : null, guideY: minDY < SNAP_EDGE ? guideY : null };
}
function isOverlapping(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ─── 사이즈별 색상 팔레트 ────────────────────────────────────
const SIZE_FILL_COLORS = [
  "#BFDBFE", "#BBF7D0", "#FDE68A", "#FBCFE8", "#DDD6FE",
  "#FED7AA", "#A5F3FC", "#D9F99D", "#FECACA", "#E9D5FF",
  "#CFFAFE", "#FEF08A",
];
const SIZE_STROKE_COLORS = [
  "#2563EB", "#059669", "#D97706", "#DB2777", "#7C3AED",
  "#EA580C", "#0891B2", "#65A30D", "#DC2626", "#9333EA",
  "#0E7490", "#CA8A04",
];

function buildSizeColorMap(pieces: PlacedPiece[]): Map<string, number> {
  const map = new Map<string, number>();
  let counter = 0;
  for (const p of pieces) {
    const key = `${p.width}x${p.height}`;
    if (!map.has(key)) {
      map.set(key, counter % SIZE_FILL_COLORS.length);
      counter++;
    }
  }
  return map;
}

// ─── 조각 상세 팝업 ──────────────────────────────────────────
interface PieceDetailPopupProps {
  piece: PlacedPiece | null;
  group: FilmGroup | undefined;
  totalCount: number;
  sizeCount: number;
  ci: number;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}

function PieceDetailPopup({ piece, group, totalCount, sizeCount, ci, onClose, colors }: PieceDetailPopupProps) {
  if (!piece) return null;

  const areaM2 = (piece.width / 1000) * (piece.height / 1000);
  const fillColor = SIZE_FILL_COLORS[ci % SIZE_FILL_COLORS.length];
  const strokeColor = SIZE_STROKE_COLORS[ci % SIZE_STROKE_COLORS.length];

  const rows: { label: string; value: string; highlight?: boolean }[] = [
    { label: "조각 ID", value: piece.instanceIndex > 0 ? `${piece.id}-${piece.instanceIndex + 1}` : piece.id, highlight: true },
    { label: "너비", value: `${piece.width} mm` },
    { label: "높이", value: `${piece.height} mm` },
    { label: "면적", value: `${areaM2.toFixed(4)} m²` },
    { label: "배치 위치 X", value: `${Math.round(piece.x)} mm` },
    { label: "배치 위치 Y", value: `${Math.round(piece.y)} mm` },
    { label: "동일 ID 수량", value: `${totalCount}개` },
    { label: "동일 사이즈 수", value: `${sizeCount}개` },
  ];
  if (group) {
    rows.push({ label: "그룹", value: group.groupName });
    rows.push({ label: "브랜드", value: group.filmName ? `${group.brand} · ${group.filmName}` : group.brand });
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={popupStyles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View style={[popupStyles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={[popupStyles.header, { backgroundColor: fillColor, borderBottomColor: strokeColor + "40" }]}>
              <View style={[popupStyles.colorDot, { backgroundColor: fillColor, borderColor: strokeColor }]} />
              <Text style={[popupStyles.headerTitle, { color: strokeColor }]}>조각 상세 정보</Text>
              <TouchableOpacity style={popupStyles.closeBtn} onPress={onClose}>
                <Text style={[popupStyles.closeBtnText, { color: strokeColor }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={[popupStyles.sizeBadge, { backgroundColor: fillColor + "80", borderColor: strokeColor + "60" }]}>
              <Text style={[popupStyles.sizeBadgeText, { color: strokeColor }]}>
                {piece.width} × {piece.height} mm
              </Text>
            </View>
            <View style={popupStyles.table}>
              {rows.map((row, idx) => (
                <View key={row.label} style={[
                  popupStyles.tableRow,
                  idx < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  row.highlight && { backgroundColor: fillColor + "30" },
                ]}>
                  <Text style={[popupStyles.tableLabel, { color: colors.muted }]}>{row.label}</Text>
                  <Text style={[popupStyles.tableValue, { color: row.highlight ? strokeColor : colors.foreground }, row.highlight && { fontWeight: "700" }]}>
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={[popupStyles.closeFullBtn, { backgroundColor: strokeColor }]} onPress={onClose}>
              <Text style={popupStyles.closeFullBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const popupStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  card: { width: 300, borderRadius: 16, borderWidth: 1, overflow: "hidden", elevation: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 8 },
  colorDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: "700" },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 16, fontWeight: "700" },
  sizeBadge: { marginHorizontal: 16, marginTop: 12, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  sizeBadgeText: { fontSize: 18, fontWeight: "800", letterSpacing: 0.5 },
  table: { marginHorizontal: 16, marginVertical: 10, borderRadius: 8, overflow: "hidden" },
  tableRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 9 },
  tableLabel: { flex: 1, fontSize: 12 },
  tableValue: { fontSize: 13, fontWeight: "500", textAlign: "right" },
  closeFullBtn: { marginHorizontal: 16, marginBottom: 16, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  closeFullBtnText: { color: "white", fontSize: 15, fontWeight: "700" },
});

// ─── 체크리스트 아이템 타입 ───────────────────────────────────
interface CheckItem {
  id: string;
  instanceIndex: number;
  width: number;
  height: number;
  checked: boolean;
}

// ─── 체크리스트 행 컴포넌트 ──────────────────────────────────
interface CheckRowProps {
  item: CheckItem;
  ci: number;
  onToggle: (id: string, instanceIndex: number) => void;
  colors: ReturnType<typeof useColors>;
}

function CheckRow({ item, ci, onToggle, colors }: CheckRowProps) {
  const fillColor = SIZE_FILL_COLORS[ci % SIZE_FILL_COLORS.length];
  const strokeColor = SIZE_STROKE_COLORS[ci % SIZE_STROKE_COLORS.length];
  const displayId = item.instanceIndex > 0 ? `${item.id}-${item.instanceIndex + 1}` : item.id;

  return (
    <TouchableOpacity
      style={[
        checkStyles.row,
        { borderColor: item.checked ? strokeColor + "60" : colors.border },
        item.checked && { backgroundColor: fillColor + "30" },
      ]}
      onPress={() => {
        onToggle(item.id, item.instanceIndex);
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      activeOpacity={0.7}
    >
      <View style={[
        checkStyles.checkbox,
        { borderColor: item.checked ? strokeColor : colors.border },
        item.checked && { backgroundColor: strokeColor },
      ]}>
        {item.checked && <Text style={checkStyles.checkMark}>✓</Text>}
      </View>
      <View style={[checkStyles.sizeDot, { backgroundColor: fillColor, borderColor: strokeColor }]} />
      <Text style={[
        checkStyles.idText,
        { color: item.checked ? colors.muted : colors.foreground },
        item.checked && checkStyles.strikethrough,
      ]}>
        {displayId}
      </Text>
      <Text style={[
        checkStyles.sizeText,
        { color: item.checked ? colors.muted : strokeColor },
        item.checked && checkStyles.strikethrough,
      ]}>
        {item.width}×{item.height}
      </Text>
      {item.checked && (
        <View style={[checkStyles.doneBadge, { backgroundColor: strokeColor }]}>
          <Text style={checkStyles.doneBadgeText}>재단완료</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const checkStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, borderWidth: 1, marginBottom: 6, gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  checkMark: { color: "white", fontSize: 13, fontWeight: "800", lineHeight: 16 },
  sizeDot: { width: 14, height: 14, borderRadius: 3, borderWidth: 1.5 },
  idText: { flex: 1, fontSize: 14, fontWeight: "700", letterSpacing: 0.3 },
  sizeText: { fontSize: 13, fontWeight: "600", minWidth: 80, textAlign: "right" },
  strikethrough: { textDecorationLine: "line-through", opacity: 0.55 },
  doneBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  doneBadgeText: { color: "white", fontSize: 10, fontWeight: "700" },
});

// ─── 모눈종이 캔버스 ──────────────────────────────────────────
interface GridCanvasProps {
  placement: PlacementResult;
  scale: number;
  colors: ReturnType<typeof useColors>;
  sizeColorMap: Map<string, number>;
  checkedKeys: Set<string>;
  onPiecePress: (piece: PlacedPiece) => void;
  editMode: boolean;
  patternFixed?: boolean; // 무늬 고정 시 회전 버튼 비활성화
}

function GridCanvas({ placement, scale, colors, sizeColorMap, checkedKeys, onPiecePress, editMode, patternFixed }: GridCanvasProps) {
  const [pieces, setPieces] = useState<PlacedPiece[]>(placement.pieces);
  // 편집 모드에서 선택된 조각 키
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // 드래그 상태
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingInstance, setDraggingInstance] = useState<number>(-1);
  const [collisionKey, setCollisionKey] = useState<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; pieceX: number; pieceY: number; moved: boolean } | null>(null);
  // 웹 드래그용 컨테이너 ref (웹에서는 div DOM 노드를 직접 사용)
  const svgRef = useRef<any>(null);
  const webContainerRef = useRef<HTMLDivElement | null>(null);
  const containerLayoutRef = useRef<{ x: number; y: number; width: number; height: number }>({ x: 0, y: 0, width: 0, height: 0 });
  // 웹 드래그 중인 조각 키
  // offsetX/Y: 마우스 다운 시 마우스의 조각 내 상대 오프셋 (스크롤 무관한 드래그 계산용)
  const webDragRef = useRef<{ key: string; offsetX: number; offsetY: number; startPieceX: number; startPieceY: number } | null>(null);
  // 회전 실패 시 빨간 테두리 표시용
  const [rotateFailKey, setRotateFailKey] = useState<string | null>(null);
  // 스냅 가이드라인 좌표 (SVG 단위, null이면 표시 안 함)
  const [snapGuide, setSnapGuide] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });

  // placement prop이 변경될 때 (재계산 시) pieces 상태를 동기화
  useEffect(() => {
    if (draggingId === null && webDragRef.current === null) {
      setPieces(placement.pieces);
      setSelectedKey(null);
    }
  }, [placement.pieces, placement.filmHeight]);

  // 편집 모드 해제 시 선택 초기화
  useEffect(() => {
    if (!editMode) setSelectedKey(null);
  }, [editMode]);

  const filmW = placement.filmWidth;
  const filmH = Math.max(placement.filmHeight, 10);
  const svgW = filmW * scale;
  const svgH = filmH * scale;
  const GRID_STEP = 50;

  const pieceKey = (p: PlacedPiece) => `${p.id}_${p.instanceIndex}`;

  const checkCollision = useCallback((
    key: string, nx: number, ny: number, w: number, h: number, cur: PlacedPiece[],
  ) => {
    for (const p of cur) {
      if (pieceKey(p) === key) continue;
      if (isOverlapping(nx, ny, w, h, p.x, p.y, p.width, p.height)) return true;
    }
    return nx < 0 || ny < 0 || nx + w > filmW;
  }, [filmW]);

  // ── 90도 회전 핸들러 ──────────────────────────────────────
  const handleRotate = useCallback((key: string) => {
    setPieces((prev) => {
      const target = prev.find((p) => pieceKey(p) === key);
      if (!target) return prev;
      const newW = target.height;
      const newH = target.width;
      // 1) 원래 위치에서 회전 시도
      const nx0 = Math.min(target.x, filmW - newW);
      if (!checkCollision(key, nx0, target.y, newW, newH, prev)) {
        return prev.map((p) => pieceKey(p) === key ? { ...p, width: newW, height: newH, x: nx0, y: target.y } : p);
      }
      // 2) 빈 공간 탐색 (50mm 그리드 단위로 스캔)
      const step = 50;
      for (let ty = 0; ty + newH <= filmH; ty += step) {
        for (let tx = 0; tx + newW <= filmW; tx += step) {
          if (!checkCollision(key, tx, ty, newW, newH, prev)) {
            return prev.map((p) => pieceKey(p) === key ? { ...p, width: newW, height: newH, x: tx, y: ty } : p);
          }
        }
      }
      // 3) 빈 공간 없으면 회전 취소 → 선택 조각 빨간 테두리 표시
      setRotateFailKey(key);
      setTimeout(() => setRotateFailKey(null), 600);
      return prev;
    });
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [filmW, filmH, checkCollision]);

  // ── 네이티브 PanResponder ─────────────────────────────────
  const createPanResponder = useCallback((piece: PlacedPiece) => {
    const key = pieceKey(piece);
    return PanResponder.create({
      onStartShouldSetPanResponder: () => editMode,
      onMoveShouldSetPanResponder: () => editMode,
      onPanResponderGrant: (e) => {
        dragStartRef.current = {
          x: e.nativeEvent.pageX,
          y: e.nativeEvent.pageY,
          pieceX: piece.x,
          pieceY: piece.y,
          moved: false,
        };
        setDraggingId(piece.id);
        setDraggingInstance(piece.instanceIndex);
        setSelectedKey(key);
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (e) => {
        if (!dragStartRef.current) return;
        const dx = (e.nativeEvent.pageX - dragStartRef.current.x) / scale;
        const dy = (e.nativeEvent.pageY - dragStartRef.current.y) / scale;
        if (Math.abs(dx) > 5 / scale || Math.abs(dy) > 5 / scale) {
          dragStartRef.current.moved = true;
        }
        const nx = Math.max(0, Math.min(snapToGrid(dragStartRef.current.pieceX + dx), filmW - piece.width));
        const ny = Math.max(0, snapToGrid(dragStartRef.current.pieceY + dy));
        setCollisionKey(checkCollision(key, nx, ny, piece.width, piece.height, pieces) ? key : null);
        setPieces((prev) => prev.map((p) => pieceKey(p) === key ? { ...p, x: nx, y: ny } : p));
      },
      onPanResponderRelease: () => {
        setDraggingId(null);
        setDraggingInstance(-1);
        const wasMoved = dragStartRef.current?.moved ?? false;
        const cur = pieces.find((p) => pieceKey(p) === key);
        if (cur && checkCollision(key, cur.x, cur.y, cur.width, cur.height, pieces)) {
          setPieces((prev) => prev.map((p) => pieceKey(p) === key ? { ...p, x: piece.x, y: piece.y } : p));
        }
        setCollisionKey(null);
        if (!wasMoved && !editMode) {
          const latest = pieces.find((p) => pieceKey(p) === key) ?? piece;
          onPiecePress(latest);
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      },
    });
  }, [pieces, scale, filmW, checkCollision, onPiecePress, editMode]);

  // ── 웹 마우스 이벤트 핸들러 ──────────────────────────────
  const getSvgCoords = useCallback((e: React.MouseEvent) => {
    // 웹에서는 div DOM의 getBoundingClientRect를 사용하여 스크롤 오프셋도 자동 반영
    if (Platform.OS === 'web' && webContainerRef.current) {
      const rect = webContainerRef.current.getBoundingClientRect();
      containerLayoutRef.current = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    }
    const layout = containerLayoutRef.current;
    return {
      x: (e.clientX - layout.x) / scale,
      y: (e.clientY - layout.y) / scale,
    };
  }, [scale]);

  const handleWebMouseDown = useCallback((e: React.MouseEvent, piece: PlacedPiece) => {
    if (!editMode) return;
    e.stopPropagation();
    // preventDefault 호출하지 않음 → 스크롤 허용
    const key = pieceKey(piece);
    setSelectedKey(key);
    // 드래그 시작 시 마우스의 조각 내 상대 오프셋 계산
    // offsetX = mouseDownSvgX - piece.x, offsetY = mouseDownSvgY - piece.y
    // 이렇게 저장하면 스크롤 발생 후에도 newPieceX = curSvgX - offsetX 로 정확하게 계산 가능
    let svgLeft0 = 0, svgTop0 = 0;
    if (webContainerRef.current) {
      const rect = webContainerRef.current.getBoundingClientRect();
      svgLeft0 = rect.left;
      svgTop0 = rect.top;
    }
    const mouseDownSvgX = (e.clientX - svgLeft0) / scale;
    const mouseDownSvgY = (e.clientY - svgTop0) / scale;
    webDragRef.current = {
      key,
      offsetX: mouseDownSvgX - piece.x,  // 마우스의 조각 내 상대 오프셋
      offsetY: mouseDownSvgY - piece.y,
      startPieceX: piece.x,
      startPieceY: piece.y,
    };
    setDraggingId(piece.id);
    setDraggingInstance(piece.instanceIndex);
    // 전역 mousemove/mouseup 이벤트 등록 (passive: true로 스크롤 차단 방지)
    const handleMouseMove = (ev: MouseEvent) => {
      if (!webDragRef.current) return;
      const drag = webDragRef.current;
      if (!drag) return;
      // 매번 getBoundingClientRect 갱신 → 스크롤 중에도 정확한 SVG 위치 반영
      let svgLeft = 0, svgTop = 0;
      if (webContainerRef.current) {
        const rect = webContainerRef.current.getBoundingClientRect();
        svgLeft = rect.left;
        svgTop = rect.top;
      }
      // 현재 마우스 위치를 SVG 좌표로 변환
      const curSvgX = (ev.clientX - svgLeft) / scale;
      const curSvgY = (ev.clientY - svgTop) / scale;
      // newPieceX = curSvgX - offsetX (스크롤과 무관하게 항상 정확)
      // dx/dy 방식 대신 절대 위치 계산 방식 사용
      const rawX = curSvgX - drag.offsetX;
      const rawY = curSvgY - drag.offsetY;
      // rawX/rawY는 handleMouseMove 클로저에서 이미 계산됨
      setPieces((prev) => {
        if (!drag) return prev;
        const target = prev.find((p) => pieceKey(p) === drag.key);
        if (!target) return prev;
        const snapped = applyEdgeSnap(rawX, rawY, target.width, target.height, filmW, prev, drag.key);
        setSnapGuide({ x: snapped.guideX, y: snapped.guideY });
        const hasCollision = checkCollision(drag.key, snapped.x, snapped.y, target.width, target.height, prev);
        setCollisionKey(hasCollision ? drag.key : null);
        return prev.map((p) => pieceKey(p) === drag.key ? { ...p, x: snapped.x, y: snapped.y } : p);
      });
    };
    const handleMouseUp = () => {
      const dragSnap = webDragRef.current;
      if (!dragSnap) return;
      const dragKey = dragSnap.key;
      const startX = dragSnap.startPieceX;
      const startY = dragSnap.startPieceY;
      // 먼저 ref를 null로 초기화하여 추가 mousemove 이벤트 차단
      webDragRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      setPieces((prev) => {
        const target = prev.find((p) => pieceKey(p) === dragKey);
        if (target && checkCollision(dragKey, target.x, target.y, target.width, target.height, prev)) {
          // 충돌 시 원래 위치로 복원
          return prev.map((p) => pieceKey(p) === dragKey
            ? { ...p, x: startX, y: startY }
            : p);
        }
        return prev;
      });
      setCollisionKey(null);
      setSnapGuide({ x: null, y: null });
      setDraggingId(null);
      setDraggingInstance(-1);
    };
    // passive: true → 스크롤 차단 방지 (preventDefault 호출을 안 하므로 passive여도 문제 없음)
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseup", handleMouseUp);
  }, [editMode, getSvgCoords, scale, filmW, checkCollision]);

  // SVG 빈 영역 클릭 시 선택 해제
  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    if (editMode && e.target === svgRef.current) {
      setSelectedKey(null);
    }
  }, [editMode]);

  // 선택된 조각 찾기 (회전 버튼 위치 계산용)
  const selectedPieceData = selectedKey ? pieces.find((p) => pieceKey(p) === selectedKey) : null;

  return (
    <View style={{ position: 'relative' }}>
      {/* 웹 전용: div로 감싸서 getBoundingClientRect 사용 가능하게 함 */}
      {Platform.OS === 'web' && (
        <div ref={webContainerRef} style={{ position: 'absolute', top: 0, left: 0, width: svgW, height: svgH, pointerEvents: 'none' }} />
      )}
      <Svg
        ref={svgRef}
        width={svgW}
        height={svgH}
        {...(Platform.OS === "web" ? { onClick: handleSvgClick } : {})}
      >
        <Rect x={0} y={0} width={svgW} height={svgH} fill={colors.surface} />
        {/* 모눈 가로선 */}
        {Array.from({ length: Math.ceil(filmH / GRID_STEP) + 1 }, (_, i) => i * GRID_STEP).map((y) => (
          <Line key={`h-${y}`} x1={0} y1={y * scale} x2={svgW} y2={y * scale}
            stroke={colors.border} strokeWidth={y % 100 === 0 ? 0.8 : 0.4} />
        ))}
        {/* 모눈 세로선 */}
        {Array.from({ length: Math.ceil(filmW / GRID_STEP) + 1 }, (_, i) => i * GRID_STEP).map((x) => (
          <Line key={`v-${x}`} x1={x * scale} y1={0} x2={x * scale} y2={svgH}
            stroke={colors.border} strokeWidth={x % 100 === 0 ? 0.8 : 0.4} />
        ))}
        {/* 조각 렌더링 */}
        {pieces.map((p) => {
          const key = pieceKey(p);
          const isDragging = draggingId === p.id && draggingInstance === p.instanceIndex;
          const isCollision = collisionKey === key;
          const isChecked = checkedKeys.has(key);
          const isSelected = editMode && selectedKey === key;
          const sk = `${p.width}x${p.height}`;
          const ci = sizeColorMap.get(sk) ?? (p.colorIndex % SIZE_FILL_COLORS.length);
          const isRotateFail = rotateFailKey === key;
          const fill = isCollision ? "#FEE2E2" : isRotateFail ? "#FEE2E2" : SIZE_FILL_COLORS[ci];
          const stroke = isCollision ? "#EF4444" : isRotateFail ? "#EF4444" : isSelected ? "#1D4ED8" : SIZE_STROKE_COLORS[ci];
          const px = p.x * scale, py = p.y * scale;
          const pw = p.width * scale, ph = p.height * scale;
          const xSize = Math.min(pw, ph) * 0.65;
          const xCx = px + pw / 2;
          const xCy = py + ph / 2;
          const xHalf = xSize / 2;

          // 웹 이벤트 props
          const webProps = Platform.OS === "web" ? {
            onMouseDown: (e: React.MouseEvent) => handleWebMouseDown(e, p),
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              if (!editMode) onPiecePress(p);
            },
            style: { cursor: editMode ? "grab" : "pointer" } as React.CSSProperties,
          } : {};

          return (
            <G
              key={key}
              {...(Platform.OS !== "web" ? createPanResponder(p).panHandlers : {})}
              {...(webProps as any)}
            >
              {/* 선택 하이라이트 배경 */}
              {isSelected ? (
                <Rect
                  x={px - 3} y={py - 3} width={pw + 6} height={ph + 6}
                  fill="none" stroke="#1D4ED8" strokeWidth={2.5}
                  strokeDasharray="6,3" rx={4} opacity={0.8}
                />
              ) : (null as any)}
              {/* 조각 배경 */}
              <Rect x={px} y={py} width={pw} height={ph}
                fill={fill} stroke={stroke}
                strokeWidth={isDragging || isSelected ? 2.5 : 1.5}
                opacity={isChecked ? 0.45 : isDragging ? 0.85 : 1} rx={2} />
              {/* ID / 사이즈 텍스트 */}
              {pw > 28 && ph > 18 && !isChecked ? (
                <>
                  <SvgText
                    x={px + pw / 2} y={py + ph / 2 - (ph > 36 ? 7 : 0)}
                    textAnchor="middle"
                    fontSize={Math.min(16, pw / 3.5, ph / 2.2)}
                    fontWeight="800"
                    fill={isCollision ? "#EF4444" : SIZE_STROKE_COLORS[ci]}>
                    {p.id}{p.instanceIndex > 0 ? `-${p.instanceIndex + 1}` : ""}
                  </SvgText>
                  {ph > 36 ? (
                    <SvgText
                      x={px + pw / 2} y={py + ph / 2 + 10}
                      textAnchor="middle"
                      fontSize={Math.min(13, pw / 4.5, ph / 3)}
                      fontWeight="600"
                      fill={isCollision ? "#EF4444" : SIZE_STROKE_COLORS[ci] + "CC"}>
                      {`${p.width}×${p.height}`}
                    </SvgText>
                  ) : null}
                </>
              ) : (null as any)}
              {/* 재단 완료 X 표시 */}
              {isChecked ? (
                <G>
                  <Rect x={px + 1} y={py + 1} width={pw - 2} height={ph - 2}
                    fill="#EF4444" opacity={0.18} rx={2} />
                  <Line x1={xCx - xHalf} y1={xCy - xHalf} x2={xCx + xHalf} y2={xCy + xHalf}
                    stroke="#DC2626" strokeWidth={Math.max(2.5, xSize * 0.18)} strokeLinecap="round" />
                  <Line x1={xCx + xHalf} y1={xCy - xHalf} x2={xCx - xHalf} y2={xCy + xHalf}
                    stroke="#DC2626" strokeWidth={Math.max(2.5, xSize * 0.18)} strokeLinecap="round" />
                </G>
              ) : (null as any)}

            </G>
          );
        })}
        {/* 스냅 가이드라인 */}
        {snapGuide.x !== null ? (
          <Line
            x1={snapGuide.x * scale} y1={0}
            x2={snapGuide.x * scale} y2={svgH}
            stroke="#3B82F6" strokeWidth={1.5}
            strokeDasharray="6,4" opacity={0.85}
          />
        ) : (null as any)}
        {snapGuide.y !== null ? (
          <Line
            x1={0} y1={snapGuide.y * scale}
            x2={svgW} y2={snapGuide.y * scale}
            stroke="#3B82F6" strokeWidth={1.5}
            strokeDasharray="6,4" opacity={0.85}
          />
        ) : (null as any)}
        {/* 필름 경계 */}
        <Rect x={0} y={0} width={svgW} height={svgH}
          fill="none" stroke={colors.primary} strokeWidth={1.5} />
      </Svg>

      {/* 웹 전용: 절대 위치 회전 버튼 오버레이 */}
      {Platform.OS === 'web' && editMode && selectedPieceData && !patternFixed && (
        <View
          style={{
            position: 'absolute',
            left: selectedPieceData.x * scale + selectedPieceData.width * scale - 24,
            top: selectedPieceData.y * scale + 2,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: '#1D4ED8',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            opacity: 0.92,
            // @ts-ignore
            cursor: 'pointer',
          }}
          // @ts-ignore
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            handleRotate(selectedKey!);
          }}
        >
          <Text style={{ color: 'white', fontSize: 14, fontWeight: '700', lineHeight: 18 }}>↻</Text>
        </View>
      )}

      {/* 편집 모드 안내 텍스트 */}
      {editMode && (
        <View style={canvasEditStyles.hint}>
          <Text style={canvasEditStyles.hintText}>
            {patternFixed
              ? '조각을 드래그하여 이동 (무늬 고정: 회전 불가)'
              : '조각을 드래그하여 이동 · 선택 후 우상단 ↻ 버튼으로 90° 회전'
            }
          </Text>
        </View>
      )}

      {/* 선택된 조각 편집 툴바 (네이티브 전용 회전 버튼) */}
      {editMode && selectedKey && Platform.OS !== "web" && !patternFixed && (
        <View style={canvasEditStyles.toolbar}>
          <TouchableOpacity
            style={canvasEditStyles.rotateBtn}
            onPress={() => handleRotate(selectedKey)}>
            <Text style={canvasEditStyles.rotateBtnText}>↻ 90° 회전</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const canvasEditStyles = StyleSheet.create({
  hint: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#EFF6FF",
    borderRadius: 6,
    alignItems: "center",
  },
  hintText: {
    fontSize: 11,
    color: "#1D4ED8",
    fontWeight: "600",
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 8,
    gap: 10,
  },
  rotateBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#1D4ED8",
    borderRadius: 8,
  },
  rotateBtnText: {
    color: "white",
    fontSize: 13,
    fontWeight: "700",
  },
});

// ─── 결과 화면 ────────────────────────────────────────────────
export default function ResultsScreen() {
  const colors = useColors();
  const { state } = useFilm();
  const result = state.lastResult;

  const [activeGroupId, setActiveGroupId] = useState<string>(() =>
    result?.groupResults[0]?.groupId ?? "",
  );
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [selectedPiece, setSelectedPiece] = useState<PlacedPiece | null>(null);
  // 편집 모드 상태
  const [editMode, setEditMode] = useState(false);
  const STORAGE_KEY = "film_cutting_checked_map";

  const [checkedMap, setCheckedMap] = useState<Record<string, Set<string>>>({});

  // result 변경 시 activeGroupId를 첫 번째 그룹으로 초기화
  useEffect(() => {
    if (result?.groupResults[0]?.groupId) {
      setActiveGroupId(result.groupResults[0].groupId);
      setEditMode(false);
    }
  }, [result]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed: Record<string, string[]> = JSON.parse(raw);
        const restored: Record<string, Set<string>> = {};
        for (const [gid, keys] of Object.entries(parsed)) {
          restored[gid] = new Set(keys);
        }
        setCheckedMap(restored);
      } catch (_) {}
    });
  }, []);

  const [viewMode, setViewMode] = useState<"canvas" | "checklist">("canvas");

  const groupResults = result?.groupResults ?? [];
  const invoice = result?.invoice;
  const currentGroup = groupResults.find((g) => g.groupId === activeGroupId) ?? groupResults[0];
  const currentGroupIndex = groupResults.findIndex((g) => g.groupId === currentGroup?.groupId);
  const fitScale = canvasWidth > 0 ? canvasWidth / FILM_WIDTH : 0.25;
  const currentFilmGroup = state.groups.find((g) => g.groupId === currentGroup?.groupId);

  const checkedKeys: Set<string> = useMemo(
    () => checkedMap[activeGroupId] ?? new Set<string>(),
    [checkedMap, activeGroupId],
  );

  const sizeColorMap = useMemo(
    () => buildSizeColorMap(currentGroup?.placement.pieces ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentGroup?.groupId, currentGroup?.placement.pieces.length, currentGroup?.placement.filmHeight],
  );

  const legendItems = useMemo(() => {
    if (!currentGroup) return [];
    const seen = new Map<string, { sizeKey: string; label: string; ci: number; count: number }>();
    for (const p of currentGroup.placement.pieces) {
      const sk = `${p.width}x${p.height}`;
      if (!seen.has(sk)) {
        const ci = sizeColorMap.get(sk) ?? 0;
        seen.set(sk, { sizeKey: sk, label: `${p.width}×${p.height}mm`, ci, count: 0 });
      }
      seen.get(sk)!.count++;
    }
    return Array.from(seen.values()).sort((a, b) => a.ci - b.ci);
  }, [currentGroup?.groupId, currentGroup?.placement.pieces.length, currentGroup?.placement.filmHeight, sizeColorMap]);

  const checkItems: CheckItem[] = useMemo(() => {
    if (!currentGroup) return [];
    return currentGroup.placement.pieces.map((p) => ({
      id: p.id,
      instanceIndex: p.instanceIndex,
      width: p.width,
      height: p.height,
      checked: checkedKeys.has(`${p.id}_${p.instanceIndex}`),
    }));
  }, [currentGroup?.groupId, currentGroup?.placement.pieces, currentGroup?.placement.pieces.length, currentGroup?.placement.filmHeight, checkedKeys]);

  const checkedCount = checkItems.filter((i) => i.checked).length;
  const totalCount = checkItems.length;

  const selectedCi = selectedPiece
    ? (sizeColorMap.get(`${selectedPiece.width}x${selectedPiece.height}`) ?? 0)
    : 0;
  const selectedTotalCount = selectedPiece && currentGroup
    ? currentGroup.placement.pieces.filter((p) => p.id === selectedPiece.id).length
    : 0;
  const selectedSizeCount = selectedPiece && currentGroup
    ? currentGroup.placement.pieces.filter(
        (p) => p.width === selectedPiece.width && p.height === selectedPiece.height,
      ).length
    : 0;

  useEffect(() => {
    const serialized: Record<string, string[]> = {};
    for (const [gid, keys] of Object.entries(checkedMap)) {
      serialized[gid] = Array.from(keys);
    }
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(serialized)).catch(() => {});
  }, [checkedMap]);

  // PDF 내보내기 로딩 상태
  const [pdfExporting, setPdfExporting] = useState(false);
  const handleExportPDF = useCallback(async () => {
    if (!groupResults.length || pdfExporting) return;
    setPdfExporting(true);
    try {
      await exportCuttingLayoutPDF(groupResults, state.projectName || '배치도');
    } catch (err: any) {
      if (Platform.OS === 'web') {
        alert('PDF 내보내기 실패: ' + (err?.message ?? String(err)));
      }
    } finally {
      setPdfExporting(false);
    }
  }, [groupResults, state.projectName, pdfExporting]);

  const handleToggle = useCallback((id: string, instanceIndex: number) => {
    const key = `${id}_${instanceIndex}`;
    setCheckedMap((prev) => {
      const prevSet = prev[activeGroupId] ?? new Set<string>();
      const next = new Set(prevSet);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...prev, [activeGroupId]: next };
    });
  }, [activeGroupId]);

  const handleToggleAll = useCallback(() => {
    if (!currentGroup) return;
    const allKeys = currentGroup.placement.pieces.map((p) => `${p.id}_${p.instanceIndex}`);
    const allChecked = allKeys.every((k) => checkedKeys.has(k));
    setCheckedMap((prev) => ({
      ...prev,
      [activeGroupId]: allChecked ? new Set<string>() : new Set(allKeys),
    }));
  }, [currentGroup, checkedKeys, activeGroupId]);

  if (!result || groupResults.length === 0) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={[styles.noDataText, { color: colors.muted }]}>
            배치 결과가 없습니다.{"\n"}홈 화면에서 계산을 먼저 실행해 주세요.
          </Text>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/(tabs)/input" as any)}>
            <Text style={styles.backBtnText}>← 입력으로 돌아가기</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const groupBorderColor = GROUP_BORDER_COLORS[currentGroupIndex % GROUP_BORDER_COLORS.length];

  return (
    <ScreenContainer containerClassName="bg-background">
      {/* 헤더 */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.push("/(tabs)/input" as any)} style={styles.backArrow}>
          <Text style={styles.backArrowText}>← 입력</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>배치 결과</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* 전체 요약 패널 */}
      <View style={[styles.summaryPanel, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>총 필름 길이</Text>
          <Text style={[styles.summaryValue, { color: colors.primary }]}>{formatM(invoice!.totalFilmLengthM)}m</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>총 면적</Text>
          <Text style={[styles.summaryValue, { color: colors.primary }]}>{invoice!.totalFilmAreaM2.toFixed(2)}m²</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>그룹 수</Text>
          <Text style={[styles.summaryValue, { color: colors.muted }]}>{groupResults.length}개</Text>
        </View>
      </View>

      {/* 그룹 탭 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabBar, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.tabBarContent}>
        {groupResults.map((gr, idx) => {
          const bc = GROUP_BORDER_COLORS[idx % GROUP_BORDER_COLORS.length];
          const isActive = activeGroupId === gr.groupId;
          return (
            <TouchableOpacity
              key={gr.groupId}
              style={[styles.tab, isActive && [styles.tabActive, { borderBottomColor: bc }]]}
              onPress={() => { setActiveGroupId(gr.groupId); setEditMode(false); }}>
              <Text style={[styles.tabText, { color: isActive ? bc : colors.muted }]}>
                {gr.groupName}
              </Text>
              <Text style={[styles.tabSubText, { color: isActive ? bc + "CC" : colors.muted + "99" }]} numberOfLines={1}>
                {gr.brand}{gr.filmName ? ` · ${gr.filmName}` : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 현재 그룹 요약 + 뷰 전환 버튼 */}
      <View style={[styles.groupSummaryBar, {
        backgroundColor: GROUP_COLORS[currentGroupIndex % GROUP_COLORS.length],
        borderBottomColor: groupBorderColor + "40",
      }]}>
        <View style={styles.groupSummaryRow}>
          <Text style={[styles.groupSummaryText, { color: groupBorderColor, flex: 1 }]}>
            효율 {currentGroup!.placement.efficiency}%  ·  필름 {formatM(currentGroup!.filmLengthM)}m  ·  높이 {formatNumber(currentGroup!.placement.filmHeight)}mm
          </Text>
          <View style={styles.groupSummaryActions}>
            {/* 편집 모드 토글 버튼 */}
            {viewMode === "canvas" && (
              <TouchableOpacity
                style={[
                  styles.editModeBtn,
                  editMode
                    ? { backgroundColor: "#1D4ED8", borderColor: "#1D4ED8" }
                    : { backgroundColor: "transparent", borderColor: groupBorderColor + "80" },
                ]}
                onPress={() => setEditMode((v) => !v)}>
                <Text style={[styles.editModeBtnText, { color: editMode ? "white" : groupBorderColor }]}>
                  {editMode ? "✓ 편집 완료" : "✎ 수동 편집"}
                </Text>
              </TouchableOpacity>
            )}
            {/* 뷰 전환 토글 */}
            <View style={[styles.viewToggle, { borderColor: groupBorderColor + "60" }]}>
              <TouchableOpacity
                style={[styles.viewToggleBtn, viewMode === "canvas" && { backgroundColor: groupBorderColor }]}
                onPress={() => setViewMode("canvas")}>
                <Text style={[styles.viewToggleBtnText, { color: viewMode === "canvas" ? "white" : groupBorderColor }]}>
                  캔버스
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.viewToggleBtn, viewMode === "checklist" && { backgroundColor: groupBorderColor }]}
                onPress={() => setViewMode("checklist")}>
                <Text style={[styles.viewToggleBtnText, { color: viewMode === "checklist" ? "white" : groupBorderColor }]}>
                  체크리스트
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* 캔버스 뷰 */}
      {viewMode === "canvas" && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.canvasContainer}
          showsVerticalScrollIndicator={false}
          onLayout={(e) => setCanvasWidth(e.nativeEvent.layout.width - CANVAS_PADDING * 2)}
          // 편집 모드에서 스크롤 비활성화 (드래그와 충돌 방지)
          scrollEnabled={!editMode}
        >
          <View style={{ padding: CANVAS_PADDING }}>
            {canvasWidth > 0 && (
              <GridCanvas
                key={`${currentGroup!.groupId}_${currentGroup!.placement.filmHeight}_${currentGroup!.placement.pieces.length}`}
                placement={currentGroup!.placement}
                scale={fitScale}
                colors={colors}
                sizeColorMap={sizeColorMap}
                checkedKeys={checkedKeys}
                onPiecePress={(piece) => { if (!editMode) setSelectedPiece(piece); }}
                editMode={editMode}
                patternFixed={currentFilmGroup?.patternFixed}
              />
            )}
          </View>
          {/* 사이즈별 색상 범례 */}
          <View style={[styles.legendSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.legendTitle, { color: colors.foreground }]}>사이즈별 색상 범례</Text>
            <View style={styles.legendGrid}>
              {legendItems.map((item) => (
                <View key={item.sizeKey} style={styles.legendItem}>
                  <View style={[styles.legendSwatch, {
                    backgroundColor: SIZE_FILL_COLORS[item.ci],
                    borderColor: SIZE_STROKE_COLORS[item.ci],
                  }]} />
                  <View style={styles.legendTextBlock}>
                    <Text style={[styles.legendLabel, { color: colors.foreground }]}>{item.label}</Text>
                    <Text style={[styles.legendCount, { color: colors.muted }]}>{item.count}개</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* 체크리스트 뷰 */}
      {viewMode === "checklist" && (
        <View style={{ flex: 1 }}>
          <View style={[styles.checklistHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <View style={styles.checklistProgressRow}>
              <Text style={[styles.checklistProgressText, { color: colors.foreground }]}>재단 진행</Text>
              <Text style={[styles.checklistProgressCount, { color: checkedCount === totalCount ? "#059669" : colors.primary }]}>
                {checkedCount} / {totalCount}
              </Text>
            </View>
            <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
              <View style={[
                styles.progressBarFill,
                {
                  backgroundColor: checkedCount === totalCount ? "#059669" : colors.primary,
                  width: totalCount > 0 ? `${(checkedCount / totalCount) * 100}%` as any : "0%",
                },
              ]} />
            </View>
            <TouchableOpacity
              style={[styles.toggleAllBtn, { borderColor: colors.border }]}
              onPress={handleToggleAll}>
              <Text style={[styles.toggleAllBtnText, { color: colors.muted }]}>
                {checkedCount === totalCount ? "전체 해제" : "전체 체크"}
              </Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={checkItems}
            keyExtractor={(item) => `${item.id}_${item.instanceIndex}`}
            contentContainerStyle={styles.checklistContent}
            renderItem={({ item }) => {
              const ci = sizeColorMap.get(`${item.width}x${item.height}`) ?? 0;
              return <CheckRow item={item} ci={ci} onToggle={handleToggle} colors={colors} />;
            }}
            ListHeaderComponent={
              checkedCount === totalCount && totalCount > 0 ? (
                <View style={[styles.allDoneBanner, { backgroundColor: "#D1FAE5", borderColor: "#059669" }]}>
                  <Text style={styles.allDoneBannerText}>✅ 모든 조각 재단 완료!</Text>
                </View>
              ) : null
            }
          />
        </View>
      )}

      {/* 하단 버튼 */}
      <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.secondaryBtn, { borderColor: colors.primary }]}
          onPress={() => router.push("/(tabs)/input" as any)}>
          <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>다시 계산</Text>
        </TouchableOpacity>
        {/* PDF 내보내기 버튼 */}
        <TouchableOpacity
          style={[
            styles.secondaryBtn,
            {
              borderColor: pdfExporting ? colors.muted : "#059669",
              backgroundColor: pdfExporting ? colors.surface : "#ECFDF5",
            },
          ]}
          onPress={handleExportPDF}
          disabled={pdfExporting}>
          <Text style={[styles.secondaryBtnText, { color: pdfExporting ? colors.muted : "#059669" }]}>
            {pdfExporting ? "⏳ 생성 중..." : "📄 PDF"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/(tabs)/estimate" as any)}>
          <Text style={styles.primaryBtnText}>견적 확인하기 →</Text>
        </TouchableOpacity>
      </View>

      {/* 조각 상세 팝업 */}
      <PieceDetailPopup
        piece={selectedPiece}
        group={currentFilmGroup}
        totalCount={selectedTotalCount}
        sizeCount={selectedSizeCount}
        ci={selectedCi}
        onClose={() => setSelectedPiece(null)}
        colors={colors}
      />
    </ScreenContainer>
  );
}

// ─── 스타일 ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  noDataText: { fontSize: 16, textAlign: "center", lineHeight: 26, marginBottom: 24 },
  backBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  backBtnText: { color: "white", fontSize: 15, fontWeight: "600" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  backArrow: { width: 60 },
  backArrowText: { color: "white", fontSize: 15 },
  headerTitle: { flex: 1, color: "white", fontSize: 18, fontWeight: "700", textAlign: "center" },
  summaryPanel: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryLabel: { fontSize: 11, marginBottom: 2 },
  summaryValue: { fontSize: 14, fontWeight: "700" },
  summaryDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },
  tabBar: { borderBottomWidth: StyleSheet.hairlineWidth, maxHeight: 58 },
  tabBarContent: { paddingHorizontal: 8, gap: 4, alignItems: "center" },
  tab: { paddingHorizontal: 14, paddingVertical: 8, alignItems: "center", borderBottomWidth: 2.5, borderBottomColor: "transparent" },
  tabActive: {},
  tabText: { fontSize: 14, fontWeight: "700" },
  tabSubText: { fontSize: 10, marginTop: 1 },
  groupSummaryBar: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1 },
  groupSummaryRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  groupSummaryText: { fontSize: 11, fontWeight: "600" },
  groupSummaryActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  editModeBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1.5 },
  editModeBtnText: { fontSize: 11, fontWeight: "700" },
  viewToggle: { flexDirection: "row", borderRadius: 8, borderWidth: 1, overflow: "hidden" },
  viewToggleBtn: { paddingHorizontal: 10, paddingVertical: 5 },
  viewToggleBtnText: { fontSize: 11, fontWeight: "700" },
  canvasContainer: { paddingBottom: 16 },
  legendSection: { marginHorizontal: 12, marginBottom: 12, borderRadius: 10, borderWidth: 1, padding: 12 },
  legendTitle: { fontSize: 13, fontWeight: "700", marginBottom: 10 },
  legendGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: "45%", flex: 1 },
  legendSwatch: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5 },
  legendTextBlock: { flex: 1 },
  legendLabel: { fontSize: 12, fontWeight: "600" },
  legendCount: { fontSize: 10, marginTop: 1 },
  checklistHeader: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  checklistProgressRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  checklistProgressText: { fontSize: 13, fontWeight: "700" },
  checklistProgressCount: { fontSize: 16, fontWeight: "800" },
  progressBarBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressBarFill: { height: 6, borderRadius: 3 },
  toggleAllBtn: { alignSelf: "flex-end", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  toggleAllBtnText: { fontSize: 12, fontWeight: "600" },
  checklistContent: { padding: 12, paddingBottom: 24 },
  allDoneBanner: { borderRadius: 10, borderWidth: 1.5, padding: 14, marginBottom: 12, alignItems: "center" },
  allDoneBannerText: { fontSize: 15, fontWeight: "800", color: "#059669" },
  bottomBar: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  secondaryBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1.5, alignItems: "center" },
  secondaryBtnText: { fontSize: 15, fontWeight: "600" },
  primaryBtn: { flex: 2, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  primaryBtnText: { color: "white", fontSize: 15, fontWeight: "700" },
});
