export function projectedBalance(
  currentBalance: number,
  openReceivable: number,
  openPayable: number,
): number {
  return Math.round(
    (currentBalance + openReceivable - openPayable) * 100,
  ) / 100
}

export function stockWithSnapshot(
  calculatedStock: number,
  vhsysCurrentStock: number | null | undefined,
): number {
  return vhsysCurrentStock == null ? calculatedStock : vhsysCurrentStock
}
