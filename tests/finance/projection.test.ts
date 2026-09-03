// @vitest-environment node
import { expect, it } from 'vitest'
import { projectedBalance, stockWithSnapshot } from '@/lib/finance/projection'

it('calcula saldo atual mais receber menos pagar', () => {
  expect(projectedBalance(1000, 500, 250)).toBe(1250)
})

it('arredonda a projeção em centavos', () => {
  expect(projectedBalance(0.1, 0.2, 0)).toBe(0.3)
})

it('substitui o estoque calculado pelo retrato atual do VHSYS', () => {
  expect(stockWithSnapshot(80, 125)).toBe(125)
  expect(stockWithSnapshot(80, null)).toBe(80)
})
