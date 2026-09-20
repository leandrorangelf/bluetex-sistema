import assert from 'node:assert/strict'
import test from 'node:test'
import { calcularEstoque, calcularPrecoMedioVenda, calcularPrecoMedioVendaHistorico, calcularValorEstoque, mesclarPrecoMedioVenda, type AberturaEstoque, type LinhaHistoricoVendaVhsys, type MovimentoEstoque, type ProdutoEstoque, type SaldoProduto, type VendaEstoqueDb } from '../lib/estoque.ts'

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

test('calcula preço médio de venda ponderado pela quantidade, não pela contagem de vendas', () => {
  const vendas: VendaEstoqueDb[] = [
    { id: 'v1', data_venda: '2026-01-10', numero_nf: '1', itens: [{ id: 'i1', produto_id: 'p1', qtd_carteiras: 100, valor: 500 }] },
    { id: 'v2', data_venda: '2026-02-10', numero_nf: '2', itens: [{ id: 'i2', produto_id: 'p1', qtd_carteiras: 400, valor: 2400 }] },
    { id: 'v3', data_venda: '2026-02-11', numero_nf: '3', itens: [{ id: 'i3', produto_id: 'p2', qtd_carteiras: 0, valor: 0 }] },
  ]
  const precos = calcularPrecoMedioVenda(vendas)

  // (500 + 2400) / (100 + 400) = 5.8 — não a média simples de 5 e 6
  assert.equal(precos.get('p1'), 5.8)
  assert.equal(precos.has('p2'), false)
})

test('valoriza o estoque pelo saldo atual (nunca negativo) vezes o preço médio de venda', () => {
  const saldos: SaldoProduto[] = [
    { produtoId: 'p1', produtoNome: 'Produto A', fatorConversao: 10, saldoInicioMes: 0, compras: 0, vendas: 0, ajustesEntrada: 0, ajustesSaida: 0, saldoAtual: 90 },
    { produtoId: 'p2', produtoNome: 'Produto B', fatorConversao: 20, saldoInicioMes: 0, compras: 0, vendas: 0, ajustesEntrada: 0, ajustesSaida: 0, saldoAtual: -15 },
    { produtoId: 'p3', produtoNome: 'Sem venda', fatorConversao: 1, saldoInicioMes: 0, compras: 0, vendas: 0, ajustesEntrada: 0, ajustesSaida: 0, saldoAtual: 50 },
  ]
  const precos = new Map([['p1', 5.8], ['p2', 3]])

  assert.equal(calcularValorEstoque(saldos, precos), 90 * 5.8)
})

test('preço médio do histórico VHSYS casa a descrição do produto e converte caixas em carteiras', () => {
  const produtosLocais = [{ id: 'p1', nome: 'GUDANG RED', fatorConversao: 480 }]
  const linhas: LinhaHistoricoVendaVhsys[] = [
    { produto: 'El Poncio Gudang Red', qtd_caixas: 9, valor: 71280 },
    { produto: 'El Poncio Gudang Red', qtd_caixas: 4, valor: 31680 },
    { produto: 'Produto sem correspondência', qtd_caixas: 10, valor: 999 },
  ]
  const precos = calcularPrecoMedioVendaHistorico(linhas, produtosLocais)

  // (71280 + 31680) / ((9 + 4) * 480) — preço por carteira, não por caixa
  assert.equal(precos.get('p1'), (71280 + 31680) / (13 * 480))
  assert.equal(precos.size, 1)
})

test('mescla preço ao vivo com fallback do histórico sem sobrescrever quem já tem venda ativa', () => {
  const ativo = new Map([['p1', 20]])
  const historico = new Map([['p1', 10], ['p2', 5]])

  const mesclado = mesclarPrecoMedioVenda(ativo, historico)

  assert.equal(mesclado.get('p1'), 20)
  assert.equal(mesclado.get('p2'), 5)
})
