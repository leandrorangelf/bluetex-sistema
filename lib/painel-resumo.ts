import { calcularSaldoRealizado, type ParcelaFinanceira, type PagamentoParcela } from './financeiro.ts'
import { GRUPOS_CATEGORIA, type GrupoCategoria } from '../types/index.ts'

export interface ContaPagar {
  id: string; descricao: string; vencimento: string; valor: number
  grupo: GrupoCategoria; unidade: string; vencida: boolean; proxima: boolean
  paga: boolean; gerenciadoPorVhsys: boolean
}
export interface ContaReceber {
  id: string; descricao: string; vencimento: string; valor: number
  unidade: string; vencida: boolean; proxima: boolean; paga: boolean
  gerenciadoPorVhsys: boolean
}
export interface GrupoPagar {
  grupo: GrupoCategoria; label: string
  subtotal: number  // ainda a pagar
  pago: number      // já pago no mês
  contas: ContaPagar[]
}
// Linha de "presta contas": por categoria, quanto já foi pago/recebido e quanto falta
export interface LinhaCategoria {
  categoria: string; realizado: number; previsto: number
}
export interface ResumoUnidade {
  saldoHoje: number; aReceberMes: number
  contasPagar: ContaPagar[]; gruposPagar: GrupoPagar[]
  contasReceber: ContaReceber[]
  entradasPorCategoria: LinhaCategoria[]
  saidasPorCategoria: LinhaCategoria[]
  totalEntrou: number; totalPagou: number
  totalDespesas: number; resultado: number; parcelasVencidas: number
}
export interface EntradaResumo {
  unidade: string; ano: number; mes: number; hoje: string
  saldoBase: number; competenciaBase: string
  parcelas: ParcelaFinanceira[]; pagamentos: PagamentoParcela[]
  grupoPorDespesa: Map<string, GrupoCategoria>
  // saldo real do banco (VHSYS). Quando presente, vira o "saldo hoje" direto —
  // não recalcula por lançamento, porque o extrato já reflete tudo que foi pago.
  saldoBancario?: number | null
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

const GRUPO_LABEL: Record<GrupoCategoria, string> = {
  fornecedores: 'Fornecedores', impostos: 'Impostos', funcionarios: 'Funcionários',
  custos_fixos: 'Custos fixos', outros: 'Outros',
}

function categoriaDe(p: ParcelaFinanceira, grupo: GrupoCategoria): string {
  const cat = p.categoria_vhsys?.trim()
  if (cat) return cat
  if (p.tipo === 'receber') return 'Vendas'
  return GRUPO_LABEL[grupo]
}

function agruparPorCategoria(
  itens: { categoria: string; valor: number; paga: boolean }[],
): { linhas: LinhaCategoria[]; realizado: number; previsto: number } {
  const mapa = new Map<string, LinhaCategoria>()
  for (const i of itens) {
    const linha = mapa.get(i.categoria) ?? { categoria: i.categoria, realizado: 0, previsto: 0 }
    if (i.paga) linha.realizado += i.valor
    else linha.previsto += i.valor
    mapa.set(i.categoria, linha)
  }
  const linhas = [...mapa.values()].sort((a, b) =>
    (b.realizado + b.previsto) - (a.realizado + a.previsto))
  return {
    linhas,
    realizado: linhas.reduce((s, l) => s + l.realizado, 0),
    previsto: linhas.reduce((s, l) => s + l.previsto, 0),
  }
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
      subtotal: doGrupo.filter(c => !c.paga).reduce((s, c) => s + c.valor, 0),
      pago: doGrupo.filter(c => c.paga).reduce((s, c) => s + c.valor, 0),
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

  const saldoHoje = input.saldoBancario != null
    ? Number(input.saldoBancario)
    : Number(input.saldoBase) + calcularSaldoRealizado({
      hoje: input.hoje,
      competenciaInicio: input.competenciaBase,
      parcelas: input.parcelas,
      pagamentos: input.pagamentos,
    })

  // mostra pendente/parcial (falta pagar/receber) e pago (já baixado) — só cancelado fica de fora
  const noMes = (p: ParcelaFinanceira) =>
    p.ativo && p.status !== 'cancelado' &&
    p.vencimento >= inicioMes && p.vencimento <= fimMes

  let aReceberMes = 0
  const contasPagar: ContaPagar[] = []
  const contasReceber: ContaReceber[] = []
  const catReceber: { categoria: string; valor: number; paga: boolean }[] = []
  const catPagar: { categoria: string; valor: number; paga: boolean }[] = []
  for (const p of input.parcelas) {
    if (!noMes(p)) continue
    const paga = p.status === 'pago'
    const valorExibido = paga ? Number(p.valor) : restante(p)
    const vencida = !paga && p.vencimento < input.hoje
    const gerenciadoPorVhsys = p.origem_sistema === 'vhsys'
    const grupo: GrupoCategoria =
      p.origem === 'compra' ? 'fornecedores'
      : p.origem === 'despesa' ? (input.grupoPorDespesa.get(p.origem_id ?? '') ?? 'outros')
      : 'outros'
    const categoria = categoriaDe(p, grupo)
    if (p.tipo === 'receber') {
      if (!paga) aReceberMes += valorExibido
      catReceber.push({ categoria, valor: valorExibido, paga })
      contasReceber.push({
        id: p.id,
        descricao: p.observacoes?.trim() || `Recebimento (parc. ${p.numero_parcela})`,
        vencimento: p.vencimento,
        valor: valorExibido,
        unidade: input.unidade,
        vencida,
        proxima: !vencida && !paga && p.vencimento <= limiteProxima,
        paga,
        gerenciadoPorVhsys,
      })
      continue
    }
    catPagar.push({ categoria, valor: valorExibido, paga })
    contasPagar.push({
      id: p.id,
      descricao: p.observacoes?.trim() || `${capitalizar(p.origem)} (parc. ${p.numero_parcela})`,
      vencimento: p.vencimento,
      valor: valorExibido,
      grupo,
      unidade: input.unidade,
      vencida,
      proxima: !vencida && !paga && p.vencimento <= limiteProxima,
      paga,
      gerenciadoPorVhsys,
    })
  }

  const gruposPagar = montarGrupos(contasPagar)
  const totalDespesas = contasPagar.filter(c => !c.paga).reduce((s, c) => s + c.valor, 0)
  const entradas = agruparPorCategoria(catReceber)
  const saidas = agruparPorCategoria(catPagar)

  return {
    saldoHoje,
    aReceberMes,
    contasPagar,
    gruposPagar,
    contasReceber,
    entradasPorCategoria: entradas.linhas,
    saidasPorCategoria: saidas.linhas,
    totalEntrou: entradas.realizado,
    totalPagou: saidas.realizado,
    totalDespesas,
    resultado: saldoHoje + aReceberMes - totalDespesas,
    parcelasVencidas: contasPagar.filter(c => c.vencida).length,
  }
}

function mesclarCategorias(listas: LinhaCategoria[][]): LinhaCategoria[] {
  const mapa = new Map<string, LinhaCategoria>()
  for (const linha of listas.flat()) {
    const atual = mapa.get(linha.categoria) ?? { categoria: linha.categoria, realizado: 0, previsto: 0 }
    atual.realizado += linha.realizado
    atual.previsto += linha.previsto
    mapa.set(linha.categoria, atual)
  }
  return [...mapa.values()].sort((a, b) =>
    (b.realizado + b.previsto) - (a.realizado + a.previsto))
}

export function consolidarResumos(resumos: ResumoUnidade[]): ResumoUnidade {
  const contasPagar = resumos.flatMap(r => r.contasPagar)
  const contasReceber = resumos.flatMap(r => r.contasReceber)
  const soma = (f: (r: ResumoUnidade) => number) => resumos.reduce((s, r) => s + f(r), 0)
  return {
    saldoHoje: soma(r => r.saldoHoje),
    aReceberMes: soma(r => r.aReceberMes),
    contasPagar,
    gruposPagar: montarGrupos(contasPagar),
    contasReceber,
    entradasPorCategoria: mesclarCategorias(resumos.map(r => r.entradasPorCategoria)),
    saidasPorCategoria: mesclarCategorias(resumos.map(r => r.saidasPorCategoria)),
    totalEntrou: soma(r => r.totalEntrou),
    totalPagou: soma(r => r.totalPagou),
    totalDespesas: soma(r => r.totalDespesas),
    resultado: soma(r => r.resultado),
    parcelasVencidas: soma(r => r.parcelasVencidas),
  }
}
