import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularPainelFinanceiro,
  normalizarMovimentacoes,
  type ParcelaFinanceira,
} from '../lib/financeiro.ts'

const parcela = (overrides: Partial<ParcelaFinanceira> = {}): ParcelaFinanceira => ({
  id: 'p1',
  tipo: 'pagar',
  origem: 'despesa',
  origem_id: null,
  numero_parcela: 1,
  vencimento: '2026-08-10',
  valor: 2800,
  status: 'pendente',
  data_pagamento: null,
  ativo: true,
  numero_boleto: null,
  observacoes: null,
  ...overrides,
})

test('pendente usa vencimento e reduz o saldo a partir desse dia', () => {
  const result = calcularPainelFinanceiro({
    ano: 2026,
    mes: 8,
    hoje: '2026-08-12',
    saldoBase: 11500,
    competenciaBase: '2026-08-01',
    parcelas: [parcela()],
  })

  assert.equal(result.dias[8].saldoFinal, 11500)
  assert.equal(result.dias[9].saidas, 2800)
  assert.equal(result.dias[9].saldoFinal, 8700)
  assert.equal(result.dias[10].saldoFinal, 8700)
  assert.equal(result.movimentacoesMes[0].atrasada, true)
})

test('recebimento do dia 15 aumenta o saldo e compõe o saldo final', () => {
  const result = calcularPainelFinanceiro({
    ano: 2026,
    mes: 8,
    hoje: '2026-08-12',
    saldoBase: 11500,
    competenciaBase: '2026-08-01',
    parcelas: [
      parcela(),
      parcela({ id: 'r1', tipo: 'receber', vencimento: '2026-08-15', valor: 9500 }),
    ],
  })

  assert.equal(result.dias[14].entradas, 9500)
  assert.equal(result.dias[14].saldoFinal, 18200)
  assert.equal(result.resumo.saldoFinal, 18200)
})

test('parcela paga usa a data real, mesmo quando difere do vencimento', () => {
  const [movimento] = normalizarMovimentacoes([
    parcela({ status: 'pago', vencimento: '2026-07-10', data_pagamento: '2026-08-03' }),
  ], '2026-08-12')

  assert.equal(movimento.data, '2026-08-03')
  assert.equal(movimento.inconsistente, false)
})

test('parcela paga sem data usa o vencimento e sinaliza inconsistência', () => {
  const [movimento] = normalizarMovimentacoes([
    parcela({ status: 'pago', data_pagamento: null }),
  ], '2026-08-12')

  assert.equal(movimento.data, '2026-08-10')
  assert.equal(movimento.inconsistente, true)
})

test('parcelas canceladas ou inativas não entram no cálculo', () => {
  const result = calcularPainelFinanceiro({
    ano: 2026,
    mes: 8,
    hoje: '2026-08-12',
    saldoBase: 100,
    competenciaBase: '2026-08-01',
    parcelas: [
      parcela({ status: 'cancelado' }),
      parcela({ id: 'p2', ativo: false }),
    ],
  })

  assert.equal(result.movimentacoesMes.length, 0)
  assert.equal(result.resumo.saldoFinal, 100)
})

test('movimentos anteriores ao mês encadeiam o saldo inicial', () => {
  const result = calcularPainelFinanceiro({
    ano: 2026,
    mes: 8,
    hoje: '2026-08-12',
    saldoBase: 1000,
    competenciaBase: '2026-07-01',
    parcelas: [
      parcela({ vencimento: '2026-07-10', valor: 200 }),
      parcela({ id: 'r1', tipo: 'receber', vencimento: '2026-07-15', valor: 500 }),
    ],
  })

  assert.equal(result.resumo.saldoInicial, 1300)
  assert.equal(result.resumo.saldoFinal, 1300)
})

test('soma várias entradas e saídas no mesmo dia', () => {
  const result = calcularPainelFinanceiro({
    ano: 2026,
    mes: 8,
    hoje: '2026-08-01',
    saldoBase: 1000,
    competenciaBase: '2026-08-01',
    parcelas: [
      parcela({ valor: 200 }),
      parcela({ id: 'p2', valor: 300 }),
      parcela({ id: 'r1', tipo: 'receber', valor: 900 }),
    ],
  })

  assert.equal(result.dias[9].saidas, 500)
  assert.equal(result.dias[9].entradas, 900)
  assert.equal(result.dias[9].saldoFinal, 1400)
})

test('dias sem movimentação carregam o saldo do dia anterior', () => {
  const result = calcularPainelFinanceiro({
    ano: 2026,
    mes: 8,
    hoje: '2026-08-01',
    saldoBase: 2000,
    competenciaBase: '2026-08-01',
    parcelas: [parcela({ valor: 500 })],
  })

  assert.equal(result.dias[9].saldoFinal, 1500)
  assert.equal(result.dias[10].saldoFinal, 1500)
  assert.equal(result.dias[30].saldoFinal, 1500)
})
