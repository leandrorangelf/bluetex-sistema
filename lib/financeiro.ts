export type TipoMovimento = 'pagar' | 'receber'
export type StatusMovimento = 'pendente' | 'pago' | 'parcial' | 'cancelado'

export interface ParcelaFinanceira {
  id: string
  tipo: TipoMovimento
  origem: string
  origem_id: string | null
  numero_parcela: number
  vencimento: string
  valor: number
  status: StatusMovimento
  data_pagamento: string | null
  ativo: boolean
  numero_boleto: string | null
  observacoes: string | null
  descricao?: string
}

export interface PagamentoParcela {
  id: string
  parcela_id: string
  valor: number
  data_pagamento: string
}

export interface MovimentacaoFinanceira extends ParcelaFinanceira {
  parcela_id: string
  valor_total: number
  data: string
  entradas: number
  saidas: number
  atrasada: boolean
  inconsistente: boolean
}

export interface DiaFinanceiro {
  data: string
  dia: number
  entradas: number
  saidas: number
  saldoFinal: number
  movimentacoes: MovimentacaoFinanceira[]
}

export interface ResumoFinanceiro {
  saldoInicial: number
  totalEntradas: number
  totalSaidas: number
  saldoFinal: number
}

interface CalculoFinanceiroInput {
  ano: number
  mes: number
  hoje: string
  saldoBase: number
  competenciaBase: string
  parcelas: ParcelaFinanceira[]
  pagamentos?: PagamentoParcela[]
}

export function obterDataEfetiva(parcela: ParcelaFinanceira) {
  const inconsistente = parcela.status === 'pago' && !parcela.data_pagamento
  const data = parcela.status === 'pago' && parcela.data_pagamento
    ? parcela.data_pagamento
    : parcela.vencimento

  return { data, inconsistente }
}

export function normalizarMovimentacoes(
  parcelas: ParcelaFinanceira[],
  hoje: string,
  pagamentosPorParcela: Map<string, PagamentoParcela[]> = new Map(),
): MovimentacaoFinanceira[] {
  const movimentos: MovimentacaoFinanceira[] = []

  for (const parcela of parcelas.filter(item => item.ativo && item.status !== 'cancelado')) {
    const valorTotal = Number(parcela.valor)
    const pagamentos = pagamentosPorParcela.get(parcela.id) ?? []

    if (pagamentos.length === 0) {
      const { data, inconsistente } = obterDataEfetiva(parcela)
      movimentos.push({
        ...parcela,
        parcela_id: parcela.id,
        valor: valorTotal,
        valor_total: valorTotal,
        data,
        inconsistente,
        entradas: parcela.tipo === 'receber' ? valorTotal : 0,
        saidas: parcela.tipo === 'pagar' ? valorTotal : 0,
        atrasada: parcela.status === 'pendente' && parcela.vencimento < hoje,
      })
      continue
    }

    const valorPago = pagamentos.reduce((total, item) => total + Number(item.valor), 0)
    const saldoRestante = Math.max(0, valorTotal - valorPago)

    for (const item of pagamentos) {
      const valor = Number(item.valor)
      movimentos.push({
        ...parcela,
        id: item.id,
        parcela_id: parcela.id,
        status: 'pago',
        valor,
        valor_total: valorTotal,
        data: item.data_pagamento,
        inconsistente: false,
        entradas: parcela.tipo === 'receber' ? valor : 0,
        saidas: parcela.tipo === 'pagar' ? valor : 0,
        atrasada: false,
      })
    }

    if (saldoRestante > 0) {
      movimentos.push({
        ...parcela,
        parcela_id: parcela.id,
        status: 'parcial',
        valor: saldoRestante,
        valor_total: valorTotal,
        data: parcela.vencimento,
        inconsistente: false,
        entradas: parcela.tipo === 'receber' ? saldoRestante : 0,
        saidas: parcela.tipo === 'pagar' ? saldoRestante : 0,
        atrasada: parcela.vencimento < hoje,
      })
    }
  }

  return movimentos.sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id))
}

export function calcularStatusPagamento(
  valorTotal: number,
  pagamentos: PagamentoParcela[],
): { status: StatusMovimento; dataPagamento: string | null } {
  if (pagamentos.length === 0) return { status: 'pendente', dataPagamento: null }

  const valorPago = pagamentos.reduce((total, item) => total + Number(item.valor), 0)
  const dataPagamento = pagamentos.reduce(
    (maior, item) => (item.data_pagamento > maior ? item.data_pagamento : maior),
    pagamentos[0].data_pagamento,
  )

  if (valorPago >= valorTotal) return { status: 'pago', dataPagamento }
  return { status: 'parcial', dataPagamento }
}

export function calcularPainelFinanceiro(input: CalculoFinanceiroInput): {
  movimentacoesMes: MovimentacaoFinanceira[]
  dias: DiaFinanceiro[]
  resumo: ResumoFinanceiro
} {
  const mes = String(input.mes).padStart(2, '0')
  const inicioMes = `${input.ano}-${mes}-01`
  const ultimoDia = new Date(input.ano, input.mes, 0).getDate()
  const fimMes = `${input.ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`

  const pagamentosPorParcela = new Map<string, PagamentoParcela[]>()
  for (const item of input.pagamentos ?? []) {
    const lista = pagamentosPorParcela.get(item.parcela_id) ?? []
    lista.push(item)
    pagamentosPorParcela.set(item.parcela_id, lista)
  }

  const movimentacoes = normalizarMovimentacoes(input.parcelas, input.hoje, pagamentosPorParcela)
    .filter(movimento => movimento.data >= input.competenciaBase && movimento.data <= fimMes)
  const anteriores = movimentacoes.filter(movimento => movimento.data < inicioMes)
  const saldoInicial = anteriores.reduce(
    (saldo, movimento) => saldo + movimento.entradas - movimento.saidas,
    Number(input.saldoBase),
  )
  const movimentacoesMes = movimentacoes.filter(movimento => movimento.data >= inicioMes)
  let saldo = saldoInicial

  const dias: DiaFinanceiro[] = Array.from({ length: ultimoDia }, (_, index) => {
    const dia = index + 1
    const data = `${input.ano}-${mes}-${String(dia).padStart(2, '0')}`
    const movimentosDia = movimentacoesMes.filter(movimento => movimento.data === data)
    const entradas = movimentosDia.reduce((total, movimento) => total + movimento.entradas, 0)
    const saidas = movimentosDia.reduce((total, movimento) => total + movimento.saidas, 0)
    saldo += entradas - saidas

    return {
      data,
      dia,
      entradas,
      saidas,
      saldoFinal: saldo,
      movimentacoes: movimentosDia,
    }
  })

  const totalEntradas = movimentacoesMes.reduce(
    (total, movimento) => total + movimento.entradas,
    0,
  )
  const totalSaidas = movimentacoesMes.reduce(
    (total, movimento) => total + movimento.saidas,
    0,
  )

  return {
    movimentacoesMes,
    dias,
    resumo: {
      saldoInicial,
      totalEntradas,
      totalSaidas,
      saldoFinal: saldo,
    },
  }
}
