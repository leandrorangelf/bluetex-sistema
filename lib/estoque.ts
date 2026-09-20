import type { AjusteEstoque, Produto } from '@/types'
import { melhorMatch, tokens, type LocalProduto } from './vhsys/produto-match'

export type TipoMovimentoEstoque = 'entrada' | 'saida'
export type OrigemMovimentoEstoque = 'compra' | 'venda' | 'ajuste'

export type RelacaoNomeEstoque = { nome: string } | { nome: string }[] | null | undefined
export function nomeRelacaoEstoque(r: RelacaoNomeEstoque): string | undefined {
  return (Array.isArray(r) ? r[0]?.nome : r?.nome) || undefined
}

export interface AberturaEstoqueDb { id: string; produto_id: string; mes: number; ano: number; qtd_carteiras: number }
export interface ItemMovimentoEstoqueDb { id: string; produto_id: string; qtd_carteiras: number; valor?: number }
export interface CompraEstoqueDb { id: string; data_compra: string; numero_nf: string | null; itens: ItemMovimentoEstoqueDb[]; fornecedor?: RelacaoNomeEstoque }
export interface VendaEstoqueDb { id: string; data_venda: string; numero_nf: string | null; itens: ItemMovimentoEstoqueDb[]; cliente?: RelacaoNomeEstoque }

export interface ProdutoEstoque {
  id: string
  nome: string
  fatorConversao: number
  unidadeBase?: string
  unidadeMaior?: string
}

export interface AberturaEstoque {
  id: string
  produtoId: string
  ano: number
  mes: number
  quantidade: number
}

export interface MovimentoEstoque {
  id: string
  produtoId: string
  data: string
  tipo: TipoMovimentoEstoque
  origem: OrigemMovimentoEstoque
  quantidade: number
  documento?: string
  descricao?: string
  // fornecedor (entrada/compra) ou cliente (saída/venda) — "de quem veio" / "pra quem foi"
  contraparte?: string
}

export interface MovimentoEstoqueCalculado extends MovimentoEstoque {
  produtoNome: string
  saldoApos: number
}

export interface SaldoProduto {
  produtoId: string
  produtoNome: string
  fatorConversao: number
  unidadeBase?: string
  unidadeMaior?: string
  saldoInicioMes: number
  compras: number
  vendas: number
  ajustesEntrada: number
  ajustesSaida: number
  saldoAtual: number
}

export interface PainelEstoque {
  resumo: {
    produtos: number
    entradas: number
    saidas: number
    saldoAtual: number
  }
  saldos: SaldoProduto[]
  movimentos: MovimentoEstoqueCalculado[]
}

interface CalcularEstoqueInput {
  ano: number
  mes: number
  produtos: ProdutoEstoque[]
  aberturas: AberturaEstoque[]
  movimentos: MovimentoEstoque[]
  produtoId?: string
}

function dataCompetencia(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-01`
}

function ultimoDiaMes(ano: number, mes: number): string {
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`
}

function efeito(movimento: MovimentoEstoque): number {
  return movimento.tipo === 'entrada' ? movimento.quantidade : -movimento.quantidade
}

function ordenarMovimentos(a: MovimentoEstoque, b: MovimentoEstoque): number {
  return a.data.localeCompare(b.data) || a.id.localeCompare(b.id)
}

export function calcularEstoque({
  ano,
  mes,
  produtos,
  aberturas,
  movimentos,
  produtoId,
}: CalcularEstoqueInput): PainelEstoque {
  const inicioMes = dataCompetencia(ano, mes)
  const fimMes = ultimoDiaMes(ano, mes)
  const produtosFiltrados = produtoId ? produtos.filter(produto => produto.id === produtoId) : produtos
  const saldos: SaldoProduto[] = []
  const relatorio: MovimentoEstoqueCalculado[] = []

  for (const produto of produtosFiltrados) {
    const abertura = aberturas
      .filter(item => item.produtoId === produto.id)
      .sort((a, b) => dataCompetencia(a.ano, a.mes).localeCompare(dataCompetencia(b.ano, b.mes)))[0]
    const dataAbertura = abertura ? dataCompetencia(abertura.ano, abertura.mes) : ''
    const movimentosProduto = movimentos
      .filter(item => item.produtoId === produto.id && (!dataAbertura || item.data >= dataAbertura) && item.data <= fimMes)
      .sort(ordenarMovimentos)
    const anteriores = movimentosProduto.filter(item => item.data < inicioMes)
    const movimentosMes = movimentosProduto.filter(item => item.data >= inicioMes)
    const saldoInicioMes = anteriores.reduce((saldo, item) => saldo + efeito(item), abertura?.quantidade ?? 0)
    let saldoProgressivo = saldoInicioMes
    let compras = 0
    let vendas = 0
    let ajustesEntrada = 0
    let ajustesSaida = 0

    for (const movimento of movimentosMes) {
      saldoProgressivo += efeito(movimento)
      if (movimento.origem === 'compra') compras += movimento.quantidade
      if (movimento.origem === 'venda') vendas += movimento.quantidade
      if (movimento.origem === 'ajuste' && movimento.tipo === 'entrada') ajustesEntrada += movimento.quantidade
      if (movimento.origem === 'ajuste' && movimento.tipo === 'saida') ajustesSaida += movimento.quantidade
      relatorio.push({ ...movimento, produtoNome: produto.nome, saldoApos: saldoProgressivo })
    }

    saldos.push({
      produtoId: produto.id,
      produtoNome: produto.nome,
      fatorConversao: produto.fatorConversao,
      unidadeBase: produto.unidadeBase,
      unidadeMaior: produto.unidadeMaior,
      saldoInicioMes,
      compras,
      vendas,
      ajustesEntrada,
      ajustesSaida,
      saldoAtual: saldoProgressivo,
    })
  }

  relatorio.sort((a, b) => ordenarMovimentos(a, b) || a.produtoNome.localeCompare(b.produtoNome))
  return {
    resumo: {
      produtos: saldos.length,
      entradas: saldos.reduce((total, item) => total + item.compras + item.ajustesEntrada, 0),
      saidas: saldos.reduce((total, item) => total + item.vendas + item.ajustesSaida, 0),
      saldoAtual: saldos.reduce((total, item) => total + item.saldoAtual, 0),
    },
    saldos,
    movimentos: relatorio,
  }
}

export function normalizarProdutosEstoque(produtos: Produto[]): ProdutoEstoque[] {
  return produtos.map(produto => ({
    id: produto.id,
    nome: produto.nome,
    fatorConversao: Number(produto.fator_conversao) || 1,
    unidadeBase: produto.unidade_base?.nome,
    unidadeMaior: produto.unidade_maior?.nome,
  }))
}

export function normalizarAberturasEstoque(aberturas: AberturaEstoqueDb[]): AberturaEstoque[] {
  return aberturas.map(item => ({ id: item.id, produtoId: item.produto_id, ano: item.ano, mes: item.mes, quantidade: Number(item.qtd_carteiras) }))
}

// Preço médio de venda por unidade base de cada produto (histórico completo,
// ponderado pela quantidade de cada venda) — usado pra valorizar o estoque
// pelo que ele vale se vendido, não pelo custo de compra.
export function calcularPrecoMedioVenda(vendas: VendaEstoqueDb[]): Map<string, number> {
  const acumulado = new Map<string, { valor: number; qtd: number }>()
  for (const venda of vendas) {
    for (const item of venda.itens ?? []) {
      const qtd = Number(item.qtd_carteiras)
      if (!qtd || item.valor == null) continue
      const atual = acumulado.get(item.produto_id) ?? { valor: 0, qtd: 0 }
      atual.valor += Number(item.valor)
      atual.qtd += qtd
      acumulado.set(item.produto_id, atual)
    }
  }
  const precos = new Map<string, number>()
  for (const [produtoId, { valor, qtd }] of acumulado) {
    if (qtd > 0) precos.set(produtoId, valor / qtd)
  }
  return precos
}

export function calcularValorEstoque(saldos: SaldoProduto[], precoMedioVenda: Map<string, number>): number {
  return saldos.reduce((total, s) => total + Math.max(s.saldoAtual, 0) * (precoMedioVenda.get(s.produtoId) ?? 0), 0)
}

// Preço médio de compra (nota de entrada da fábrica/fornecedor) por unidade
// base de cada produto — pra comparar com o preço de venda (margem). Não
// entra na valorização do estoque, que é sempre pelo preço de venda.
export function calcularPrecoMedioCompra(compras: CompraEstoqueDb[]): Map<string, number> {
  const acumulado = new Map<string, { valor: number; qtd: number }>()
  for (const compra of compras) {
    for (const item of compra.itens ?? []) {
      const qtd = Number(item.qtd_carteiras)
      if (!qtd || item.valor == null) continue
      const atual = acumulado.get(item.produto_id) ?? { valor: 0, qtd: 0 }
      atual.valor += Number(item.valor)
      atual.qtd += qtd
      acumulado.set(item.produto_id, atual)
    }
  }
  const precos = new Map<string, number>()
  for (const [produtoId, { valor, qtd }] of acumulado) {
    if (qtd > 0) precos.set(produtoId, valor / qtd)
  }
  return precos
}

// Confirmado com o cliente: pacote = 10 carteiras (unidade base), fixo pra
// todo o catálogo — não é uma unidade cadastrada no sistema, só uma
// conversão de exibição pro jeito que a operação pensa o produto.
export const CARTEIRAS_POR_PACOTE = 10
export function precoPorPacote(precoPorCarteira: number): number {
  return precoPorCarteira * CARTEIRAS_POR_PACOTE
}

export interface LinhaHistoricoVendaVhsys { produto: string; qtd_caixas: number; valor: number }

// Preço médio de referência a partir do relatório histórico de vendas do
// VHSYS (btx_vhsys_vendas_historico) — só leitura, não move estoque. Serve de
// fallback pra produto sem venda "ativa" recente em btx_vendas (ex.: catálogo
// que só passou a sincronizar depois da virada de estoque), casando a
// descrição do VHSYS com o catálogo local pelo mesmo matcher usado no
// relatório de vendas.
export function calcularPrecoMedioVendaHistorico(
  linhas: LinhaHistoricoVendaVhsys[],
  produtosLocais: { id: string; nome: string; fatorConversao: number }[],
): Map<string, number> {
  const locais: LocalProduto[] = produtosLocais.map(p => ({ id: p.id, nome: p.nome, _tokens: tokens(p.nome) }))
  const acumulado = new Map<string, { valor: number; qtdCarteiras: number }>()
  for (const linha of linhas) {
    if (!linha.qtd_caixas || linha.valor == null) continue
    const match = melhorMatch(linha.produto, locais)
    if (!match) continue
    const produtoLocal = produtosLocais.find(p => p.id === match.id)
    if (!produtoLocal) continue
    const qtdCarteiras = linha.qtd_caixas * produtoLocal.fatorConversao
    const atual = acumulado.get(match.id) ?? { valor: 0, qtdCarteiras: 0 }
    atual.valor += linha.valor
    atual.qtdCarteiras += qtdCarteiras
    acumulado.set(match.id, atual)
  }
  const precos = new Map<string, number>()
  for (const [produtoId, { valor, qtdCarteiras }] of acumulado) {
    if (qtdCarteiras > 0) precos.set(produtoId, valor / qtdCarteiras)
  }
  return precos
}

// Preço "ao vivo" (vendas ativas recentes) manda; histórico do VHSYS só
// preenche o que ainda não tem venda ativa registrada.
export function mesclarPrecoMedioVenda(preferido: Map<string, number>, fallback: Map<string, number>): Map<string, number> {
  const resultado = new Map(preferido)
  for (const [produtoId, preco] of fallback) {
    if (!resultado.has(produtoId)) resultado.set(produtoId, preco)
  }
  return resultado
}

export function normalizarMovimentosEstoque(compras: CompraEstoqueDb[], vendas: VendaEstoqueDb[], ajustes: AjusteEstoque[]): MovimentoEstoque[] {
  const entradas = compras.flatMap(compra => (compra.itens ?? []).map(item => ({
    id: item.id,
    produtoId: item.produto_id,
    data: compra.data_compra,
    tipo: 'entrada' as const,
    origem: 'compra' as const,
    quantidade: Number(item.qtd_carteiras),
    documento: compra.numero_nf ? `NF ${compra.numero_nf}` : 'Compra sem NF',
    contraparte: nomeRelacaoEstoque(compra.fornecedor),
  })))
  const saidas = vendas.flatMap(venda => (venda.itens ?? []).map(item => ({
    id: item.id,
    produtoId: item.produto_id,
    data: venda.data_venda,
    tipo: 'saida' as const,
    origem: 'venda' as const,
    quantidade: Number(item.qtd_carteiras),
    documento: venda.numero_nf ? `NF ${venda.numero_nf}` : 'Venda sem NF',
    contraparte: nomeRelacaoEstoque(venda.cliente),
  })))
  const correcoes = ajustes.filter(item => item.ativo).map(item => ({
    id: item.id,
    produtoId: item.produto_id,
    data: item.data_ajuste,
    tipo: item.tipo,
    origem: 'ajuste' as const,
    quantidade: Number(item.qtd_carteiras),
    descricao: item.motivo || 'Ajuste manual',
  }))
  return [...entradas, ...saidas, ...correcoes]
}
