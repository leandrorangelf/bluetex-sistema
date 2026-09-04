import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularResumoUnidade, consolidarResumos, type EntradaResumo } from '../lib/painel-resumo.ts'
import type { ParcelaFinanceira, PagamentoParcela } from '../lib/financeiro.ts'

const HOJE = '2026-09-10'

const parc = (o: Partial<ParcelaFinanceira> = {}): ParcelaFinanceira => ({
  id: 'p1', tipo: 'pagar', origem: 'despesa', origem_id: 'd1', numero_parcela: 1,
  vencimento: '2026-09-20', valor: 1000, status: 'pendente', data_pagamento: null,
  ativo: true, ...o,
})

const base = (o: Partial<EntradaResumo> = {}): EntradaResumo => ({
  unidade: 'NEW BLUETEX MG', ano: 2026, mes: 9, hoje: HOJE,
  saldoBase: 5000, competenciaBase: '2026-09-01',
  parcelas: [], pagamentos: [], grupoPorDespesa: new Map(), ...o,
})

test('classifica compra como fornecedores', () => {
  const r = calcularResumoUnidade(base({ parcelas: [parc({ origem: 'compra', origem_id: 'c1', valor: 300 })] }))
  assert.equal(r.gruposPagar[0].grupo, 'fornecedores')
  assert.equal(r.gruposPagar[0].subtotal, 300)
})

test('classifica despesa pelo grupo da categoria', () => {
  const r = calcularResumoUnidade(base({
    parcelas: [parc({ origem: 'despesa', origem_id: 'd1', valor: 200 })],
    grupoPorDespesa: new Map([['d1', 'impostos']]),
  }))
  assert.equal(r.gruposPagar[0].grupo, 'impostos')
})

test('despesa sem grupo mapeado cai em outros', () => {
  const r = calcularResumoUnidade(base({ parcelas: [parc({ origem: 'manual', origem_id: null, valor: 50 })] }))
  assert.equal(r.gruposPagar[0].grupo, 'outros')
})

test('resultado = (saldoHoje + aReceberMes) - totalDespesas', () => {
  const r = calcularResumoUnidade(base({
    saldoBase: 1000,
    parcelas: [
      parc({ id: 'r1', tipo: 'receber', origem: 'venda', origem_id: 'v1', valor: 800 }),
      parc({ id: 'x1', tipo: 'pagar', valor: 300 }),
    ],
  }))
  assert.equal(r.saldoHoje, 1000)
  assert.equal(r.aReceberMes, 800)
  assert.equal(r.totalDespesas, 300)
  assert.equal(r.resultado, 1500)
})

test('parcela parcial entra pelo restante', () => {
  const pag: PagamentoParcela = { id: 'g1', parcela_id: 'p1', valor: 400, data_pagamento: '2026-09-05' }
  const r = calcularResumoUnidade(base({
    parcelas: [parc({ status: 'parcial', valor: 1000 })], pagamentos: [pag],
  }))
  assert.equal(r.totalDespesas, 600)
})

test('vencimento fora do mes nao entra', () => {
  const r = calcularResumoUnidade(base({ parcelas: [parc({ vencimento: '2026-10-02' })] }))
  assert.equal(r.totalDespesas, 0)
  assert.equal(r.gruposPagar.length, 0)
})

test('marca vencida', () => {
  const r = calcularResumoUnidade(base({ parcelas: [parc({ vencimento: '2026-09-01' })] }))
  assert.equal(r.contasPagar[0].vencida, true)
  assert.equal(r.parcelasVencidas, 1)
})

test('conta paga aparece na lista mas nao soma no total nem no subtotal do grupo', () => {
  const r = calcularResumoUnidade(base({
    parcelas: [
      parc({ id: 'x1', valor: 300 }),
      parc({ id: 'x2', valor: 700, status: 'pago', data_pagamento: '2026-09-05' }),
    ],
  }))
  assert.equal(r.contasPagar.length, 2)
  assert.equal(r.totalDespesas, 300)
  assert.equal(r.gruposPagar[0].subtotal, 300)
  const paga = r.contasPagar.find(c => c.id === 'x2')!
  assert.equal(paga.paga, true)
  assert.equal(paga.valor, 700)
})

test('recebimento pago aparece em contasReceber mas nao soma em aReceberMes', () => {
  const r = calcularResumoUnidade(base({
    parcelas: [
      parc({ id: 'r1', tipo: 'receber', valor: 500 }),
      parc({ id: 'r2', tipo: 'receber', valor: 900, status: 'pago', data_pagamento: '2026-09-03' }),
    ],
  }))
  assert.equal(r.contasReceber.length, 2)
  assert.equal(r.aReceberMes, 500)
  assert.equal(r.contasReceber.find(c => c.id === 'r2')!.paga, true)
})

test('marca gerenciadoPorVhsys a partir de origem_sistema', () => {
  const r = calcularResumoUnidade(base({
    parcelas: [parc({ id: 'v1', origem_sistema: 'vhsys', valor: 100 })],
  }))
  assert.equal(r.contasPagar[0].gerenciadoPorVhsys, true)
})

test('pagar do vhsys com fornecedor nao classifica como fornecedores automaticamente aqui (grupo vem de origem, nao de origem_sistema)', () => {
  const r = calcularResumoUnidade(base({
    parcelas: [parc({ id: 'v2', origem_sistema: 'vhsys', origem: 'compra', origem_id: null, valor: 100 })],
  }))
  assert.equal(r.gruposPagar[0].grupo, 'fornecedores')
})

test('consolida soma unidades', () => {
  const a = calcularResumoUnidade(base({ saldoBase: 1000, parcelas: [parc({ valor: 100 })] }))
  const b = calcularResumoUnidade(base({ unidade: 'NEW BLUETEX SC', saldoBase: 500, parcelas: [parc({ id: 'p2', valor: 200 })] }))
  const c = consolidarResumos([a, b])
  assert.equal(c.saldoHoje, 1500)
  assert.equal(c.totalDespesas, 300)
  assert.equal(c.gruposPagar[0].contas.length, 2)
})
