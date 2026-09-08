// Marco zero financeiro: contas a receber/pagar do mês passado em diante.
export const VHSYS_ZERO_DATE = '2026-08-01'
// Piso absoluto: nada de 2025 ou antes, em hipótese nenhuma.
export const VHSYS_ANO_MINIMO = '2026-01-01'
// Virada de estoque: venda/compra do VHSYS só conta a partir da contagem física.
export const VHSYS_ESTOQUE_ZERO_DATE = '2026-09-08'

export function money(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

export function isoDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.startsWith('0000-00-00')) {
    return null
  }
  const date = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
}

export function digits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

export function isOpen(value: unknown): boolean {
  return ['nao', 'não', 'em aberto', 'aberto', 'pendente'].includes(
    String(value ?? '').trim().toLocaleLowerCase('pt-BR'),
  )
}

export function includeAccount(liquidated: unknown): boolean {
  return isOpen(liquidated)
}
