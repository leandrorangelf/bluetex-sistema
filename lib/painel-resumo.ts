import { calcularSaldoRealizado, type ParcelaFinanceira, type PagamentoParcela } from './financeiro.ts'
import { GRUPOS_CATEGORIA, type GrupoCategoria } from '../types/index.ts'

export interface ContaPagar {
  id: string; descricao: string; vencimento: string; valor: number
  grupo: GrupoCategoria; unidade: string; vencida: boolean; proxima: boolean
}
export interface GrupoPagar {
  grupo: GrupoCategoria; label: string; subtotal: number; contas: ContaPagar[]
}
export interface ResumoUnidade {
  saldoHoje: number; aReceberMes: number
  contasPagar: ContaPagar[]; gruposPagar: GrupoPagar[]
  totalDespesas: number; resultado: number; parcelasVencidas: number
}
export interface EntradaResumo {
  unidade: string; ano: number; mes: number; hoje: string
  saldoBase: number; competenciaBase: string
  parcelas: ParcelaFinanceira[]; pagamentos: PagamentoParcela[]
  grupoPorDespesa: Map<string, GrupoCategoria>
}

const LABEL = new Map(GRUPOS_CATEGORIA.map(g => [g.value, g.label]))
const ORDEM = GRUPOS_CATEGORIA.map(g => g.value)

function addDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function montarGrupos(contas: ContaPagar[]): GrupoPagar[] {
  return ORDEM.flatMap(grupo => {
    const doGrupo = contas
      .filter(c => c.grupo === grupo)
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    if (doGrupo.length === 0) return []
    return [{
      grupo,
      label: LABEL.get(grupo) ?? 'Outros',
      subtotal: doGrupo.reduce((s, c) => s + c.valor, 0),
      contas: doGrupo,
    }]
  })
}

export function calcularResumoUnidade(input: EntradaResumo): ResumoUnidade {
  const mes = String(input.mes).padStart(2, '0')
  const inicioMes = `${input.ano}-${mes}-01`
  const ultimoDia = new Date(input.ano, input.mes, 0).getDate()
  const fimMes = `${input.ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`
  const limiteProxima = addDias(input.hoje, 7)

  const pagoPorParcela = new Map<string, number>()
  for (const p of input.pagamentos) {
    pagoPorParcela.set(p.parcela_id, (pagoPorParcela.get(p.parcela_id) ?? 0) + Number(p.valor))
  }
  const restante = (p: ParcelaFinanceira) => Number(p.valor) - (pagoPorParcela.get(p.id) ?? 0)

  const saldoHoje = Number(input.saldoBase) + calcularSaldoRealizado({
    hoje: input.hoje,
    competenciaInicio: input.competenciaBase,
    parcelas: input.parcelas,
    pagamentos: input.pagamentos,
  })

  const noMes = (p: ParcelaFinanceira) =>
    p.ativo && (p.status === 'pendente' || p.status === 'parcial') &&
    p.vencimento >= inicioMes && p.vencimento <= fimMes

  let aReceberMes = 0
  const contasPagar: ContaPagar[] = []
  for (const p of input.parcelas) {
    if (!noMes(p)) continue
    if (p.tipo === 'receber') { aReceberMes += restante(p); continue }
    const grupo: GrupoCategoria =
      p.origem === 'compra' ? 'fornecedores'
      : p.origem === 'despesa' ? (input.grupoPorDespesa.get(p.origem_id ?? '') ?? 'outros')
      : 'outros'
    const vencida = p.vencimento < input.hoje
    contasPagar.push({
      id: p.id,
      descricao: p.observacoes?.trim() || `${capitalizar(p.origem)} (parc. ${p.numero_parcela})`,
      vencimento: p.vencimento,
      valor: restante(p),
      grupo,
      unidade: input.unidade,
      vencida,
      proxima: !vencida && p.vencimento <= limiteProxima,
    })
  }

  const gruposPagar = montarGrupos(contasPagar)
  const totalDespesas = contasPagar.reduce((s, c) => s + c.valor, 0)

  return {
    saldoHoje,
    aReceberMes,
    contasPagar,
    gruposPagar,
    totalDespesas,
    resultado: saldoHoje + aReceberMes - totalDespesas,
    parcelasVencidas: contasPagar.filter(c => c.vencida).length,
  }
}

export function consolidarResumos(resumos: ResumoUnidade[]): ResumoUnidade {
  const contasPagar = resumos.flatMap(r => r.contasPagar)
  const soma = (f: (r: ResumoUnidade) => number) => resumos.reduce((s, r) => s + f(r), 0)
  return {
    saldoHoje: soma(r => r.saldoHoje),
    aReceberMes: soma(r => r.aReceberMes),
    contasPagar,
    gruposPagar: montarGrupos(contasPagar),
    totalDespesas: soma(r => r.totalDespesas),
    resultado: soma(r => r.resultado),
    parcelasVencidas: soma(r => r.parcelasVencidas),
  }
}
