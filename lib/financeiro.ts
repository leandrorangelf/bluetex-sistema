export type TipoMovimento = 'pagar' | 'receber'
export type StatusMovimento = 'pendente' | 'pago' | 'cancelado'

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

export interface MovimentacaoFinanceira extends ParcelaFinanceira {
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
): MovimentacaoFinanceira[] {
  return parcelas
    .filter(parcela => parcela.ativo && parcela.status !== 'cancelado')
    .map(parcela => {
      const { data, inconsistente } = obterDataEfetiva(parcela)
      const valor = Number(parcela.valor)

      return {
        ...parcela,
        valor,
        data,
        inconsistente,
        entradas: parcela.tipo === 'receber' ? valor : 0,
        saidas: parcela.tipo === 'pagar' ? valor : 0,
        atrasada: parcela.status === 'pendente' && parcela.vencimento < hoje,
      }
    })
    .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id))
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
  const movimentacoes = normalizarMovimentacoes(input.parcelas, input.hoje)
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
