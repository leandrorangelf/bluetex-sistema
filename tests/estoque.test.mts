import assert from 'node:assert/strict'
import test from 'node:test'
import { calcularEstoque, type AberturaEstoque, type MovimentoEstoque, type ProdutoEstoque } from '../lib/estoque.ts'

const produtos: ProdutoEstoque[] = [
  { id: 'p1', nome: 'Produto A', fatorConversao: 10 },
  { id: 'p2', nome: 'Produto B', fatorConversao: 20 },
]

const aberturas: AberturaEstoque[] = [
  { id: 'a-antiga', produtoId: 'p1', ano: 2026, mes: 1, quantidade: 80 },
  { id: 'a-mensal-ignorada', produtoId: 'p1', ano: 2026, mes: 2, quantidade: 100 },
  { id: 'a-p2', produtoId: 'p2', ano: 2026, mes: 2, quantidade: 50 },
]

const movimentos: MovimentoEstoque[] = [
  { id: 'antes-base', produtoId: 'p1', data: '2025-12-20', tipo: 'entrada', origem: 'compra', quantidade: 999 },
  { id: 'compra-fev', produtoId: 'p1', data: '2026-02-10', tipo: 'entrada', origem: 'compra', quantidade: 30, documento: 'NF 10' },
  { id: 'venda-fev', produtoId: 'p1', data: '2026-02-12', tipo: 'saida', origem: 'venda', quantidade: 20 },
  { id: 'compra-mar', produtoId: 'p1', data: '2026-03-02', tipo: 'entrada', origem: 'compra', quantidade: 15 },
  { id: 'ajuste-saida', produtoId: 'p1', data: '2026-03-03', tipo: 'saida', origem: 'ajuste', quantidade: 5 },
  { id: 'ajuste-entrada', produtoId: 'p1', data: '2026-03-04', tipo: 'entrada', origem: 'ajuste', quantidade: 2 },
  { id: 'venda-mar', produtoId: 'p1', data: '2026-03-05', tipo: 'saida', origem: 'venda', quantidade: 10 },
  { id: 'p2-venda', produtoId: 'p2', data: '2026-03-01', tipo: 'saida', origem: 'venda', quantidade: 10 },
  { id: 'futuro', produtoId: 'p1', data: '2026-04-01', tipo: 'entrada', origem: 'compra', quantidade: 1000 },
]

test('usa uma única abertura inicial e ignora bases mensais posteriores', () => {
  const painel = calcularEstoque({ ano: 2026, mes: 3, produtos, aberturas, movimentos })
  const produto = painel.saldos.find(item => item.produtoId === 'p1')!

  assert.equal(produto.saldoInicioMes, 90)
  assert.equal(produto.saldoAtual, 92)
})

test('separa compras, vendas e ajustes do mês', () => {
  const painel = calcularEstoque({ ano: 2026, mes: 3, produtos, aberturas, movimentos })
  const produto = painel.saldos.find(item => item.produtoId === 'p1')!

  assert.deepEqual({
    compras: produto.compras,
    vendas: produto.vendas,
    ajustesEntrada: produto.ajustesEntrada,
    ajustesSaida: produto.ajustesSaida,
  }, { compras: 15, vendas: 10, ajustesEntrada: 2, ajustesSaida: 5 })
})

test('calcula saldo progressivo no relatório cronológico', () => {
  const painel = calcularEstoque({ ano: 2026, mes: 3, produtos, aberturas, movimentos })
  const relatorio = painel.movimentos.filter(item => item.produtoId === 'p1')

  assert.deepEqual(relatorio.map(item => [item.id, item.saldoApos]), [
    ['compra-mar', 105],
    ['ajuste-saida', 100],
    ['ajuste-entrada', 102],
    ['venda-mar', 92],
  ])
})

test('filtra produto e totaliza somente entradas e saídas do mês', () => {
  const painel = calcularEstoque({ ano: 2026, mes: 3, produtos, aberturas, movimentos, produtoId: 'p1' })

  assert.equal(painel.saldos.length, 1)
  assert.equal(painel.resumo.produtos, 1)
  assert.equal(painel.resumo.entradas, 17)
  assert.equal(painel.resumo.saidas, 15)
  assert.equal(painel.resumo.saldoAtual, 92)
})

test('mantém produtos sem movimento no relatório de saldos', () => {
  const painel = calcularEstoque({ ano: 2026, mes: 3, produtos, aberturas, movimentos })
  const produto = painel.saldos.find(item => item.produtoId === 'p2')!

  assert.equal(produto.saldoInicioMes, 50)
  assert.equal(produto.saldoAtual, 40)
})

test('desempata movimentos do mesmo dia por identificador', () => {
  const painel = calcularEstoque({
    ano: 2026,
    mes: 3,
    produtos: produtos.slice(0, 1),
    aberturas,
    movimentos: [
      { id: 'b', produtoId: 'p1', data: '2026-03-10', tipo: 'saida', origem: 'venda', quantidade: 2 },
      { id: 'a', produtoId: 'p1', data: '2026-03-10', tipo: 'entrada', origem: 'compra', quantidade: 5 },
    ],
  })

  assert.deepEqual(painel.movimentos.map(item => item.id), ['a', 'b'])
  assert.deepEqual(painel.movimentos.map(item => item.saldoApos), [85, 83])
})
