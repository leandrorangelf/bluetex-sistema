export type TipoMovimentoEstoque = 'entrada' | 'saida'
export type OrigemMovimentoEstoque = 'compra' | 'venda' | 'ajuste'

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
      .filter(item => item.produtoId === produto.id && dataCompetencia(item.ano, item.mes) <= inicioMes)
      .sort((a, b) => dataCompetencia(b.ano, b.mes).localeCompare(dataCompetencia(a.ano, a.mes)))[0]
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
