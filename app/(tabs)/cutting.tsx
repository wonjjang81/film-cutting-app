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

const CANVAS_PADDING = 12;
const SNAP = 5;

function snapToGrid(v: number) { return Math.round(v / SNAP) * SNAP; }
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
  id: string;           // 조각 ID (예: "A_01")
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
      {/* 체크박스 */}
      <View style={[
        checkStyles.checkbox,
        { borderColor: item.checked ? strokeColor : colors.border },
        item.checked && { backgroundColor: strokeColor },
      ]}>
        {item.checked && (
          <Text style={checkStyles.checkMark}>✓</Text>
        )}
      </View>

      {/* 색상 사이즈 뱃지 */}
      <View style={[checkStyles.sizeDot, { backgroundColor: fillColor, borderColor: strokeColor }]} />

      {/* ID */}
      <Text style={[
        checkStyles.idText,
        { color: item.checked ? colors.muted : colors.foreground },
        item.checked && checkStyles.strikethrough,
      ]}>
        {displayId}
      </Text>

      {/* 사이즈 */}
      <Text style={[
        checkStyles.sizeText,
        { color: item.checked ? colors.muted : strokeColor },
        item.checked && checkStyles.strikethrough,
      ]}>
        {item.width}×{item.height}
      </Text>

      {/* 재단 완료 뱃지 */}
      {item.checked && (
        <View style={[checkStyles.doneBadge, { backgroundColor: strokeColor }]}>
          <Text style={checkStyles.doneBadgeText}>재단완료</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const checkStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark: {
    color: "white",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 16,
  },
  sizeDot: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1.5,
  },
  idText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  sizeText: {
    fontSize: 13,
    fontWeight: "600",
    minWidth: 80,
    textAlign: "right",
  },
  strikethrough: {
    textDecorationLine: "line-through",
    opacity: 0.55,
  },
  doneBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  doneBadgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "700",
  },
});

// ─── 모눈종이 캔버스 ──────────────────────────────────────────
interface GridCanvasProps {
  placement: PlacementResult;
  scale: number;
  colors: ReturnType<typeof useColors>;
  sizeColorMap: Map<string, number>;
  checkedKeys: Set<string>;
  onPiecePress: (piece: PlacedPiece) => void;
}

function GridCanvas({ placement, scale, colors, sizeColorMap, checkedKeys, onPiecePress }: GridCanvasProps) {
  const [pieces, setPieces] = useState<PlacedPiece[]>(placement.pieces);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingInstance, setDraggingInstance] = useState<number>(-1);
  const [collisionKey, setCollisionKey] = useState<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; pieceX: number; pieceY: number; moved: boolean } | null>(null);

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

  const createPanResponder = useCallback((piece: PlacedPiece) => {
    const key = pieceKey(piece);
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
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
        if (!wasMoved) {
          const latest = pieces.find((p) => pieceKey(p) === key) ?? piece;
          onPiecePress(latest);
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      },
    });
  }, [pieces, scale, filmW, checkCollision, onPiecePress]);

  return (
    <Svg width={svgW} height={svgH}>
      <Rect x={0} y={0} width={svgW} height={svgH} fill={colors.surface} />
      {Array.from({ length: Math.ceil(filmH / GRID_STEP) + 1 }, (_, i) => i * GRID_STEP).map((y) => (
        <Line key={`h-${y}`} x1={0} y1={y * scale} x2={svgW} y2={y * scale}
          stroke={colors.border} strokeWidth={y % 100 === 0 ? 0.8 : 0.4} />
      ))}
      {Array.from({ length: Math.ceil(filmW / GRID_STEP) + 1 }, (_, i) => i * GRID_STEP).map((x) => (
        <Line key={`v-${x}`} x1={x * scale} y1={0} x2={x * scale} y2={svgH}
          stroke={colors.border} strokeWidth={x % 100 === 0 ? 0.8 : 0.4} />
      ))}
      {pieces.map((p) => {
        const key = pieceKey(p);
        const isDragging = draggingId === p.id && draggingInstance === p.instanceIndex;
        const isCollision = collisionKey === key;
        const isChecked = checkedKeys.has(key);
        const sk = `${p.width}x${p.height}`;
        const ci = sizeColorMap.get(sk) ?? (p.colorIndex % SIZE_FILL_COLORS.length);
        const fill = isCollision ? "#FEE2E2" : SIZE_FILL_COLORS[ci];
        const stroke = isCollision ? "#EF4444" : SIZE_STROKE_COLORS[ci];
        const px = p.x * scale, py = p.y * scale;
        const pw = p.width * scale, ph = p.height * scale;
        // X 표시 크기: 조각 크기의 65% 정도로 크게
        const xSize = Math.min(pw, ph) * 0.65;
        const xCx = px + pw / 2;
        const xCy = py + ph / 2;
        const xHalf = xSize / 2;
        return (
          <G key={key} {...(Platform.OS !== "web" ? createPanResponder(p).panHandlers : {})}>
            {/* 조각 배경 - 체크 시 반투명 처리 */}
            <Rect x={px} y={py} width={pw} height={ph}
              fill={fill} stroke={stroke}
              strokeWidth={isDragging ? 2.5 : 1.5}
              opacity={isChecked ? 0.45 : isDragging ? 0.85 : 1} rx={2} />
            {/* ID / 사이즈 텍스트 */}
            {pw > 28 && ph > 18 && !isChecked && (
              <>
                <SvgText
                  x={px + pw / 2} y={py + ph / 2 - (ph > 36 ? 7 : 0)}
                  textAnchor="middle"
                  fontSize={Math.min(16, pw / 3.5, ph / 2.2)}
                  fontWeight="800"
                  fill={isCollision ? "#EF4444" : SIZE_STROKE_COLORS[ci]}>
                  {p.id}{p.instanceIndex > 0 ? `-${p.instanceIndex + 1}` : ""}
                </SvgText>
                {ph > 36 && (
                  <SvgText
                    x={px + pw / 2} y={py + ph / 2 + 10}
                    textAnchor="middle"
                    fontSize={Math.min(13, pw / 4.5, ph / 3)}
                    fontWeight="600"
                    fill={isCollision ? "#EF4444" : SIZE_STROKE_COLORS[ci] + "CC"}>
                    {`${p.width}×${p.height}`}
                  </SvgText>
                )}
              </>
            )}
            {/* 재단 완료 X 표시 오버레이 */}
            {isChecked && (
              <G>
                {/* 반투명 빨간 배경 오버레이 */}
                <Rect x={px + 1} y={py + 1} width={pw - 2} height={ph - 2}
                  fill="#EF4444" opacity={0.18} rx={2} />
                {/* X 선 1: 좌상 → 우하 */}
                <Line
                  x1={xCx - xHalf} y1={xCy - xHalf}
                  x2={xCx + xHalf} y2={xCy + xHalf}
                  stroke="#DC2626" strokeWidth={Math.max(2.5, xSize * 0.18)}
                  strokeLinecap="round" />
                {/* X 선 2: 우상 → 좌하 */}
                <Line
                  x1={xCx + xHalf} y1={xCy - xHalf}
                  x2={xCx - xHalf} y2={xCy + xHalf}
                  stroke="#DC2626" strokeWidth={Math.max(2.5, xSize * 0.18)}
                  strokeLinecap="round" />
              </G>
            )}
          </G>
        );
      })}
      <Rect x={0} y={0} width={svgW} height={svgH}
        fill="none" stroke={colors.primary} strokeWidth={1.5} />
    </Svg>
  );
}

// ─── 결과 화면 ────────────────────────────────────────────────
export default function ResultsScreen() {
  const colors = useColors();
  const { state } = useFilm();
  const result = state.lastResult;

  // ── 모든 hooks는 early return 이전에 선언 (React 규칙) ──
  const [activeGroupId, setActiveGroupId] = useState<string>(() =>
    result?.groupResults[0]?.groupId ?? "",
  );
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [selectedPiece, setSelectedPiece] = useState<PlacedPiece | null>(null);
  // AsyncStorage 키
  const STORAGE_KEY = "film_cutting_checked_map";

  // 체크된 조각 키 Set: "id_instanceIndex" 형태
  const [checkedMap, setCheckedMap] = useState<Record<string, Set<string>>>({})

  // 앱 시작 시 저장된 체크 상태 불러오기
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
  // 뷰 모드: "canvas" | "checklist"
  const [viewMode, setViewMode] = useState<"canvas" | "checklist">("canvas");

  const groupResults = result?.groupResults ?? [];
  const invoice = result?.invoice;
  const currentGroup = groupResults.find((g) => g.groupId === activeGroupId) ?? groupResults[0];
  const currentGroupIndex = groupResults.findIndex((g) => g.groupId === currentGroup?.groupId);
  const fitScale = canvasWidth > 0 ? canvasWidth / FILM_WIDTH : 0.25;
  const currentFilmGroup = state.groups.find((g) => g.groupId === currentGroup?.groupId);

  // 현재 그룹의 체크 Set
  const checkedKeys: Set<string> = useMemo(
    () => checkedMap[activeGroupId] ?? new Set<string>(),
    [checkedMap, activeGroupId],
  );

  // 사이즈별 색상 맵
  const sizeColorMap = useMemo(
    () => buildSizeColorMap(currentGroup?.placement.pieces ?? []),
    [currentGroup?.groupId],
  );

  // 범례 데이터
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
  }, [currentGroup?.groupId, sizeColorMap]);

  // 체크리스트 아이템 목록 (ID + instanceIndex 기준)
  const checkItems: CheckItem[] = useMemo(() => {
    if (!currentGroup) return [];
    return currentGroup.placement.pieces.map((p) => ({
      id: p.id,
      instanceIndex: p.instanceIndex,
      width: p.width,
      height: p.height,
      checked: checkedKeys.has(`${p.id}_${p.instanceIndex}`),
    }));
  }, [currentGroup?.groupId, currentGroup?.placement.pieces, checkedKeys]);

  const checkedCount = checkItems.filter((i) => i.checked).length;
  const totalCount = checkItems.length;

  // 선택된 조각의 색상 인덱스
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

  // checkedMap 변경 시 AsyncStorage에 저장
  useEffect(() => {
    const serialized: Record<string, string[]> = {};
    for (const [gid, keys] of Object.entries(checkedMap)) {
      serialized[gid] = Array.from(keys);
    }
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(serialized)).catch(() => {});
  }, [checkedMap]);

  // 체크 토글 핸들러
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
  // 전체 체크/해제
  const handleToggleAll = useCallback(() => {
    if (!currentGroup) return;
    const allKeys = currentGroup.placement.pieces.map((p) => `${p.id}_${p.instanceIndex}`);
    const allChecked = allKeys.every((k) => checkedKeys.has(k));
    setCheckedMap((prev) => ({
      ...prev,
      [activeGroupId]: allChecked ? new Set<string>() : new Set(allKeys),
    }));
  }, [currentGroup, checkedKeys, activeGroupId]);

  // early return - 결과 없음
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
              onPress={() => setActiveGroupId(gr.groupId)}>
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
        borderBottomColor: GROUP_BORDER_COLORS[currentGroupIndex % GROUP_BORDER_COLORS.length] + "40",
      }]}>
        <View style={styles.groupSummaryRow}>
          <Text style={[styles.groupSummaryText, { color: GROUP_BORDER_COLORS[currentGroupIndex % GROUP_BORDER_COLORS.length], flex: 1 }]}>
            효율 {currentGroup!.placement.efficiency}%  ·  필름 {formatM(currentGroup!.filmLengthM)}m  ·  높이 {formatNumber(currentGroup!.placement.filmHeight)}mm
          </Text>
          {/* 뷰 전환 토글 */}
          <View style={[styles.viewToggle, { borderColor: GROUP_BORDER_COLORS[currentGroupIndex % GROUP_BORDER_COLORS.length] + "60" }]}>
            <TouchableOpacity
              style={[styles.viewToggleBtn, viewMode === "canvas" && { backgroundColor: GROUP_BORDER_COLORS[currentGroupIndex % GROUP_BORDER_COLORS.length] }]}
              onPress={() => setViewMode("canvas")}>
              <Text style={[styles.viewToggleBtnText, { color: viewMode === "canvas" ? "white" : GROUP_BORDER_COLORS[currentGroupIndex % GROUP_BORDER_COLORS.length] }]}>
                캔버스
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewToggleBtn, viewMode === "checklist" && { backgroundColor: GROUP_BORDER_COLORS[currentGroupIndex % GROUP_BORDER_COLORS.length] }]}
              onPress={() => setViewMode("checklist")}>
              <Text style={[styles.viewToggleBtnText, { color: viewMode === "checklist" ? "white" : GROUP_BORDER_COLORS[currentGroupIndex % GROUP_BORDER_COLORS.length] }]}>
                체크리스트
              </Text>
            </TouchableOpacity>
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
        >
          <View style={{ padding: CANVAS_PADDING }}>
            {canvasWidth > 0 && (
              <GridCanvas
                key={currentGroup!.groupId}
                placement={currentGroup!.placement}
                scale={fitScale}
                colors={colors}
                sizeColorMap={sizeColorMap}
                checkedKeys={checkedKeys}
                onPiecePress={(piece) => setSelectedPiece(piece)}
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
          {/* 진행 헤더 */}
          <View style={[styles.checklistHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <View style={styles.checklistProgressRow}>
              <Text style={[styles.checklistProgressText, { color: colors.foreground }]}>
                재단 진행
              </Text>
              <Text style={[styles.checklistProgressCount, { color: checkedCount === totalCount ? "#059669" : colors.primary }]}>
                {checkedCount} / {totalCount}
              </Text>
            </View>
            {/* 진행 바 */}
            <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
              <View style={[
                styles.progressBarFill,
                {
                  backgroundColor: checkedCount === totalCount ? "#059669" : colors.primary,
                  width: totalCount > 0 ? `${(checkedCount / totalCount) * 100}%` as any : "0%",
                },
              ]} />
            </View>
            {/* 전체 체크/해제 버튼 */}
            <TouchableOpacity
              style={[styles.toggleAllBtn, { borderColor: colors.border }]}
              onPress={handleToggleAll}>
              <Text style={[styles.toggleAllBtnText, { color: colors.muted }]}>
                {checkedCount === totalCount ? "전체 해제" : "전체 체크"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 체크리스트 */}
          <FlatList
            data={checkItems}
            keyExtractor={(item) => `${item.id}_${item.instanceIndex}`}
            contentContainerStyle={styles.checklistContent}
            renderItem={({ item }) => {
              const ci = sizeColorMap.get(`${item.width}x${item.height}`) ?? 0;
              return (
                <CheckRow
                  item={item}
                  ci={ci}
                  onToggle={handleToggle}
                  colors={colors}
                />
              );
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
  groupSummaryRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  groupSummaryText: { fontSize: 11, fontWeight: "600" },
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
