export function groupMaterialRatePlaceholder(materialCostPerM: number, focused: boolean) {
  return focused ? '' : String(materialCostPerM);
}
