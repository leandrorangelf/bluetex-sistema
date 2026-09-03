// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  digits,
  includeAccount,
  includeDocument,
  isoDate,
  isOpen,
  money,
} from '@/lib/vhsys/normalizers'

describe('normalização VHSYS', () => {
  it('converte moeda e neutraliza valores inválidos', () => {
    expect(money('1234.56')).toBe(1234.56)
    expect(money(null)).toBe(0)
    expect(money('inválido')).toBe(0)
  })

  it('rejeita datas zeradas e mantém datas válidas', () => {
    expect(isoDate('0000-00-00')).toBeNull()
    expect(isoDate('2026-07-01 10:00:00')).toBe('2026-07-01')
  })

  it('normaliza documentos para dígitos', () => {
    expect(digits('12.345.678/0001-99')).toBe('12345678000199')
  })

  it('inclui somente documentos faturados desde o marco zero', () => {
    expect(includeDocument('2026-07-01', 'Faturado')).toBe(true)
    expect(includeDocument('2026-06-30', 'Faturado')).toBe(false)
    expect(includeDocument('2026-07-02', 'Cancelado')).toBe(false)
  })

  it('inclui contas abertas independentemente da data', () => {
    expect(includeAccount('Nao')).toBe(true)
    expect(includeAccount('Sim')).toBe(false)
    expect(isOpen('Em aberto')).toBe(true)
  })
})
