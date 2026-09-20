import assert from 'node:assert/strict'
import test from 'node:test'
import { calcularSituacaoPorNf } from '../lib/vendas-situacao.ts'

test('NF sem venda correspondente fica "não conciliado"', () => {
  const situacoes = calcularSituacaoPorNf([], [])
  assert.equal(situacoes.size, 0)
})

test('todas as parcelas pagas marca a NF como paga', () => {
  const vendas = [{ id: 'v1', numero_nf: '100' }]
  const parcelas = [{ origem_id: 'v1', status: 'pago' }, { origem_id: 'v1', status: 'pago' }]
  const situacoes = calcularSituacaoPorNf(vendas, parcelas)
  assert.equal(situacoes.get('100'), 'pago')
})

test('mistura de paga e pendente marca como parcial', () => {
  const vendas = [{ id: 'v1', numero_nf: '101' }]
  const parcelas = [{ origem_id: 'v1', status: 'pago' }, { origem_id: 'v1', status: 'pendente' }]
  const situacoes = calcularSituacaoPorNf(vendas, parcelas)
  assert.equal(situacoes.get('101'), 'parcial')
})

test('só pendente marca como pendente', () => {
  const vendas = [{ id: 'v1', numero_nf: '102' }]
  const parcelas = [{ origem_id: 'v1', status: 'pendente' }]
  const situacoes = calcularSituacaoPorNf(vendas, parcelas)
  assert.equal(situacoes.get('102'), 'pendente')
})

test('parcela cancelada não conta pra situação', () => {
  const vendas = [{ id: 'v1', numero_nf: '103' }]
  const parcelas = [{ origem_id: 'v1', status: 'cancelado' }, { origem_id: 'v1', status: 'pago' }]
  const situacoes = calcularSituacaoPorNf(vendas, parcelas)
  assert.equal(situacoes.get('103'), 'pago')
})

test('venda sem nenhuma parcela cadastrada não entra no mapa (fica "não conciliado" na tela)', () => {
  const vendas = [{ id: 'v1', numero_nf: '104' }]
  const situacoes = calcularSituacaoPorNf(vendas, [])
  assert.equal(situacoes.has('104'), false)
})

test('venda sem número de NF é ignorada', () => {
  const vendas = [{ id: 'v1', numero_nf: null }]
  const parcelas = [{ origem_id: 'v1', status: 'pago' }]
  const situacoes = calcularSituacaoPorNf(vendas, parcelas)
  assert.equal(situacoes.size, 0)
})
