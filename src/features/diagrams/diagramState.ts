import { INSTALLATION_LABOR_REFERENCES } from '../estimate/installationLabor';

export const DIAGRAM_PARTS = { upper: '싱크대 상부장', lower: '싱크대 하부장', fridge: '냉장고장', vanity: '화장대', shelf: '책장', sash: '샷시 (내부)', bathdoor: '화장실문/문틀', shoe: '신발장', door: '방문/문틀', island: '아일랜드식탁', wardrobe: '붙박이장', dress: '드레스룸' } as const;
export const DIAGRAM_ROLES = ['side', 'bottom', 'top', 'front', 'molding', 'double', 'single', 'plinth', 'drawer', 'hood', 'empty'] as const;
export type DiagramSelection = { id: string; shapeKey: string; part: string; name: string; quantity?: number };
export const CABINET_PREFIXES = { upper: 'U', lower: 'L', fridge: 'R', vanity: 'V', shelf: 'B', sash: 'S', bathdoor: 'T', shoe: 'H', door: 'D', island: 'I', wardrobe: 'W', dress: 'C' } as const;
export type CabinetState = { version: 4; parts: Record<string, unknown>[]; surfaces: Record<string, unknown>[]; view: string; next: Record<string, number>; selected: string | null; screen: 'diagram'; query: string; queue: unknown[] };
type Size = { cols: number; rows: number };
type Shape = { id: number; role: string; name: string; cells: number[] };
export type DiagramState = { version: 1 | 2 | 3; roles?: Record<string, string>; part: string; next: number; nextPreset: number; selected: number | null; sizes?: Record<string, Size>; drawings: Record<string, Shape[]>; presets: { id: string; part: string; name: string; size?: Size; roles?: Record<string, string>; shapes: Shape[] }[] };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const size = (v: unknown): v is Size => object(v) && Number.isInteger(v.cols) && Number(v.cols) >= 24 && Number(v.cols) <= 128 && Number.isInteger(v.rows) && Number(v.rows) >= 16 && Number(v.rows) <= 128;
const part = (v: unknown): v is string => typeof v === 'string' && Object.hasOwn(DIAGRAM_PARTS, v);
const text = (v: unknown) => typeof v === 'string' && v.length <= 40;
const roleCatalog = (v: unknown): v is Record<string, string> => object(v) && Object.keys(v).length > 0 && Object.keys(v).length <= 30 && Object.entries(v).every(([key, label]) => (DIAGRAM_ROLES.includes(key as typeof DIAGRAM_ROLES[number]) || /^custom[1-9]\d*$/.test(key)) && text(label) && String(label).trim().length > 0);
function shapes(v: unknown, grid: Size, roles?: Record<string, string>): boolean {
  if (!Array.isArray(v) || v.length > 40) return false;
  const ids = new Set<number>();
  for (const s of v) {
    if (!object(s) || !Number.isSafeInteger(s.id) || Number(s.id) < 1 || ids.has(Number(s.id)) || !(roles ? typeof s.role === 'string' && Object.hasOwn(roles, s.role) : DIAGRAM_ROLES.includes(s.role as typeof DIAGRAM_ROLES[number])) || !text(s.name) || !Array.isArray(s.cells) || !s.cells.length || s.cells.length > grid.cols * grid.rows) return false;
    ids.add(Number(s.id));
    const occupied = new Set<number>(); // Different members may overlap; duplicates within one member may not.
    for (const i of s.cells) { if (!Number.isInteger(i) || i < 0 || i >= grid.cols * grid.rows || occupied.has(i)) return false; occupied.add(i); }
  }
  return true;
}
/** Reject malformed state rather than silently overwriting an existing drawing. */
export function parseDiagramState(value: unknown): DiagramState | null {
  if (!object(value) || ![1, 2, 3].includes(Number(value.version)) || !part(value.part) || !object(value.drawings) || !Array.isArray(value.presets) || value.presets.length > 8) return null;
  if (value.roles !== undefined && !roleCatalog(value.roles)) return null;
  if (!Number.isSafeInteger(value.next) || Number(value.next) < 1 || !Number.isSafeInteger(value.nextPreset) || Number(value.nextPreset) < 1 || !(value.selected === null || Number.isSafeInteger(value.selected))) return null;
  if (value.sizes !== undefined && (!object(value.sizes) || !Object.entries(value.sizes).every(([p, s]) => part(p) && size(s)))) return null;
  const sizes = value.sizes as Record<string, Size> | undefined;
  if (!Object.entries(value.drawings).every(([p, s]) => part(p) && shapes(s, sizes?.[p] ?? { cols: 24, rows: 16 }, value.roles as Record<string, string> | undefined))) return null;
  if (!value.presets.every(p => object(p) && typeof p.id === 'string' && /^P[1-9]\d*$/.test(p.id) && part(p.part) && text(p.name) && (p.size === undefined || size(p.size)) && (p.roles === undefined || roleCatalog(p.roles)) && shapes(p.shapes, p.size as Size ?? { cols: 24, rows: 16 }, p.roles as Record<string,string> | undefined))) return null;
  if (new Set(value.presets.map(p => p.id)).size !== value.presets.length) return null;
  if (JSON.stringify(value).length > 250000) return null;
  return JSON.parse(JSON.stringify(value)) as DiagramState;
}

export function parseDiagramSelection(v: unknown): DiagramSelection | null {
  if (object(v) && v.quantity !== undefined && (!Number.isSafeInteger(v.quantity) || Number(v.quantity) < 1 || Number(v.quantity) > 32768)) return null;
  if (object(v) && typeof v.shapeKey === 'string' && v.shapeKey.startsWith('cabinet:') && v.quantity !== undefined && v.quantity !== 1 && v.quantity !== 2) return null;
  if (object(v) && typeof v.shapeKey === 'string' && /^preset:P[1-9]\d*:[1-9]\d*$/.test(v.shapeKey) && text(v.name) && typeof v.part === 'string' && INSTALLATION_LABOR_REFERENCES.some(p => p.name === v.part)) {
    const [, preset, id] = v.shapeKey.split(':');
    if (v.id === `${preset}-G${String(Number(id)).padStart(2, '0')}`) return v as DiagramSelection;
  }
  if (object(v) && typeof v.id === 'string' && typeof v.shapeKey === 'string' && v.shapeKey === `cabinet:${v.id}` && text(v.name)) {
    const id = v.id;
    const section = Object.entries(CABINET_PREFIXES).find(([, prefix]) => prefix === id[0])?.[0];
    if (section && /^(?:[A-Z](?:[1-9]\d*|0[1-9])(?:-(?:SL|SR|TOP|BASE|ML|MR|MT))?|[UL]-(?:SL|SR|MT|KB))$/.test(id) && DIAGRAM_PARTS[section as keyof typeof DIAGRAM_PARTS] === v.part) return v as DiagramSelection;
  }
  if (!object(v) || typeof v.id !== 'string' || !/^G\d{2,}$/.test(v.id) || typeof v.shapeKey !== 'string' || !/^[a-z]+:[1-9]\d*$/.test(v.shapeKey) || !text(v.name) || typeof v.part !== 'string' || !INSTALLATION_LABOR_REFERENCES.some(p => p.name === v.part)) return null;
  const [key, id] = v.shapeKey.split(':');
  if (!part(key) || DIAGRAM_PARTS[key as keyof typeof DIAGRAM_PARTS] !== v.part || Number(v.id.slice(1)) !== Number(id)) return null;
  return v as DiagramSelection;
}

export function diagramStorageKey(userId: string): string {
  return `film-cutting-diagrams-v1:${encodeURIComponent(userId)}`;
}

export function parseCabinetState(v: unknown): CabinetState | null {
  if (object(v) && v.illustrationGap !== undefined && (typeof v.illustrationGap !== 'number' || !Number.isFinite(v.illustrationGap) || v.illustrationGap < 0 || v.illustrationGap > 8)) return null;
  if (!object(v) || v.version !== 4 || !part(v.view) || !Array.isArray(v.parts) || !Array.isArray(v.surfaces) || v.parts.length > 30 || v.surfaces.length > 60 || !object(v.next) || JSON.stringify(v).length > 250000) return null;
  const ids = new Set<string>();
  for (const p of [...v.parts, ...v.surfaces]) {
    if (!object(p) || typeof p.id !== 'string' || !/^[A-Z][A-Z0-9-]{1,39}$/.test(p.id) || ids.has(p.id) || !part(p.section) || typeof p.name !== 'string' || p.name.length > 120 || !['double', 'single', 'hood', 'empty', 'surface'].includes(String(p.kind))) return null;
    if (p.id[0] !== CABINET_PREFIXES[p.section as keyof typeof CABINET_PREFIXES]) return null;
    if (!['width', 'height', 'qty', 'a', 'b', 'allowance', 'sites'].every(k => typeof p[k] === 'number' && Number.isFinite(p[k]) && Number(p[k]) >= 0)) return null;
    if (p.hoodDoorKind !== undefined && !['double','single'].includes(String(p.hoodDoorKind))) return null;
    if (p.owner !== undefined && p.owner !== null && typeof p.owner !== 'string') return null;
    ids.add(p.id);
  }
  if (!Object.entries(v.next).every(([p, n]) => part(p) && Number.isSafeInteger(n) && Number(n) > 0)) return null;
  return JSON.parse(JSON.stringify({ ...v, screen: 'diagram', query: '', queue: [] })) as CabinetState;
}
