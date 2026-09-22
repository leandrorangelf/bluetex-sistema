import { calcularSaldoRealizado, type ParcelaFinanceira, type PagamentoParcela } from './financeiro.ts'
import { GRUPOS_CATEGORIA, type GrupoCategoria } from '../types/index.ts'

export interface ContaPagar {
  id: string; descricao: string; observacoes: string; vencimento: string; dataPagamento: string | null; valor: number
  grupo: GrupoCategoria; categoria: string; unidade: string; vencida: boolean; proxima: boolean
  paga: boolean; gerenciadoPorVhsys: boolean; formaPagamento: 'boleto' | 'especie' | 'pix' | 'debito' | 'tarifa_bancaria' | null
}
export interface ContaReceber {
  id: string; descricao: string; observacoes: string; vencimento: string; dataPagamento: string | null; valor: number
  categoria: string; unidade: string; vencida: boolean; proxima: boolean; paga: boolean
  gerenciadoPorVhsys: boolean; formaPagamento: 'boleto' | 'especie' | 'pix' | 'debito' | 'tarifa_bancaria' | null
  numeroParcela: number; numeroNf: string | null
}
// Info da venda de origem (cliente, NF) pra exibir em colunas próprias na
// lista de recebíveis, em vez de embutir tudo na descrição.
export interface VendaInfo { cliente: string | null; numeroNf: string | null }
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
// Recebíveis em aberto (pendente/parcial), independente do mês selecionado —
// "quanto tenho na rua": tudo que ainda vai entrar, vencido ou a vencer.
export interface RecebiveisEmAberto {
  total: number; vencido: number; aVencer: number; contas: ContaReceber[]
}
export interface ResumoUnidade {
  saldoHoje: number; saldoInicioMes: number; aReceberMes: number
  contasPagar: ContaPagar[]; gruposPagar: GrupoPagar[]
  contasReceber: ContaReceber[]
  recebiveisEmAberto: RecebiveisEmAberto
  entradasPorCategoria: LinhaCategoria[]
  saidasPorCategoria: LinhaCategoria[]
  totalEntrou: number; totalPagou: number
  totalDespesas: number; resultado: number; parcelasVencidas: number
  // saldo real do extrato bancário (VHSYS), só como referência pra conferir
  // contra o saldo calculado — não é mais usado pra calcular nada aqui,
  // porque o saldo do mês (editável) é que tem que fechar a conta.
  saldoBancarioReferencia: number | null
}
export interface EntradaResumo {
  unidade: string; ano: number; mes: number; hoje: string
  saldoBase: number; competenciaBase: string
  parcelas: ParcelaFinanceira[]; pagamentos: PagamentoParcela[]
  grupoPorDespesa: Map<string, GrupoCategoria>
  // cliente/NF da venda de origem, por origem_id — só pra parcelas de receber
  // vindas de venda (ver VendaInfo).
  vendaInfoPorId?: Map<string, VendaInfo>
  // descrição real de despesa/compra de origem, por chave "${origem}:${origem_id}"
  // — sem isso, parcela sem observação própria cai no genérico "Despesa (parc. N)".
  pagarInfoPorId?: Map<string, string>
  // saldo real do banco (VHSYS), só pra exibir como referência — ver
  // saldoBancarioReferencia no retorno.
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

// Descrição (cliente/observação) e NF de uma parcela de receber: quando vem
// de venda, usa cliente/numero_nf da venda; senão, observação/numero_boleto.
function infoReceber(
  p: ParcelaFinanceira, vendaInfoPorId?: Map<string, VendaInfo>,
): { descricao: string; numeroNf: string | null } {
  if (p.origem === 'venda' && p.origem_id) {
    const info = vendaInfoPorId?.get(p.origem_id)
    return { descricao: info?.cliente?.trim() || '—', numeroNf: info?.numeroNf?.trim() || null }
  }
  return { descricao: p.observacoes?.trim() || 'Recebimento', numeroNf: p.numero_boleto ?? null }
}

// Descrição de uma parcela a pagar: quando vem de despesa/compra, usa a
// descrição/fornecedor real de lá (via pagarInfoPorId); senão, a observação
// da própria parcela; só cai no genérico se nada disso existir.
function descricaoPagar(p: ParcelaFinanceira, pagarInfoPorId?: Map<string, string>): string {
  if (p.origem_id) {
    const info = pagarInfoPorId?.get(`${p.origem}:${p.origem_id}`)
    if (info?.trim()) return info.trim()
  }
  return p.observacoes?.trim() || `${capitalizar(p.origem)} (parc. ${p.numero_parcela})`
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

  // saldo do mês (editável) + o que já foi realizado desde então = saldo hoje.
  // Sempre calculado assim, pra fechar a conta por construção — o extrato do
  // banco (saldoBancarioReferencia) fica só como referência pra conferir.
  const saldoHoje = Number(input.saldoBase) + calcularSaldoRealizado({
    hoje: input.hoje,
    competenciaInicio: input.competenciaBase,
    parcelas: input.parcelas,
    pagamentos: input.pagamentos,
  })

  const dentro = (d: string | null | undefined) =>
    d != null && d >= inicioMes && d <= fimMes
  // "conta do mês" na lista: venceu no mês (ainda em aberto) OU foi paga no mês
  const abertaNoMes = (p: ParcelaFinanceira) =>
    p.status !== 'pago' && dentro(p.vencimento)
  // "paga no mês" só conta o que já aconteceu até hoje — uma baixa com data
  // futura (ex.: boleto que só compensa daqui a 2 dias) não pode entrar como
  // "recebido/pago" antes da hora, senão o saldo início do mês (que é
  // saldoHoje − recebido + pago) descasa do saldoHoje e vai pro negativo à toa.
  const pagaNoMes = (p: ParcelaFinanceira) =>
    p.status === 'pago' && dentro(p.data_pagamento) && (p.data_pagamento as string) <= input.hoje

  let aReceberMes = 0
  const contasPagar: ContaPagar[] = []
  const contasReceber: ContaReceber[] = []
  const catReceber: { categoria: string; valor: number; paga: boolean }[] = []
  const catPagar: { categoria: string; valor: number; paga: boolean }[] = []
  for (const p of input.parcelas) {
    if (!p.ativo || p.status === 'cancelado') continue
    const paga = pagaNoMes(p)
    const aberta = abertaNoMes(p)
    if (!paga && !aberta) continue
    const valorExibido = paga ? Number(p.valor) : restante(p)
    const vencida = aberta && p.vencimento < input.hoje
    const gerenciadoPorVhsys = p.origem_sistema === 'vhsys'
    const grupo: GrupoCategoria =
      p.origem === 'compra' ? 'fornecedores'
      : p.origem === 'despesa' ? (input.grupoPorDespesa.get(p.origem_id ?? '') ?? 'outros')
      : 'outros'
    const categoria = categoriaDe(p, grupo)
    if (p.tipo === 'receber') {
      if (aberta) aReceberMes += valorExibido
      catReceber.push({ categoria, valor: valorExibido, paga })
      contasReceber.push({
        id: p.id,
        ...infoReceber(p, input.vendaInfoPorId),
        observacoes: p.observacoes?.trim() ?? '',
        vencimento: p.vencimento,
        dataPagamento: paga ? p.data_pagamento : null,
        valor: valorExibido,
        categoria,
        formaPagamento: p.forma_pagamento ?? null,
        unidade: input.unidade,
        vencida,
        proxima: !vencida && !paga && p.vencimento <= limiteProxima,
        paga,
        gerenciadoPorVhsys,
        numeroParcela: p.numero_parcela,
      })
      continue
    }
    catPagar.push({ categoria, valor: valorExibido, paga })
    contasPagar.push({
      id: p.id,
      descricao: descricaoPagar(p, input.pagarInfoPorId),
      observacoes: p.observacoes?.trim() ?? '',
      vencimento: p.vencimento,
      dataPagamento: paga ? p.data_pagamento : null,
      valor: valorExibido,
      grupo,
      categoria,
      formaPagamento: p.forma_pagamento ?? null,
      unidade: input.unidade,
      vencida,
      proxima: !vencida && !paga && p.vencimento <= limiteProxima,
      paga,
      gerenciadoPorVhsys,
    })
  }

  // Recebíveis em aberto (boletos e outros) — vencidos + a vencer, olhando
  // TODAS as parcelas de receber ainda não pagas, sem restringir ao mês.
  const recebiveisAbertosContas: ContaReceber[] = []
  let recebivelVencido = 0
  let recebivelAVencer = 0
  for (const p of input.parcelas) {
    if (p.tipo !== 'receber' || !p.ativo || p.status === 'pago' || p.status === 'cancelado') continue
    const valorRestante = restante(p)
    if (valorRestante <= 0) continue
    const vencida = p.vencimento < input.hoje
    const categoria = categoriaDe(p, 'outros')
    recebiveisAbertosContas.push({
      id: p.id,
      ...infoReceber(p, input.vendaInfoPorId),
      observacoes: p.observacoes?.trim() ?? '',
      vencimento: p.vencimento,
      dataPagamento: null,
      valor: valorRestante,
      categoria,
      formaPagamento: p.forma_pagamento ?? null,
      unidade: input.unidade,
      vencida,
      proxima: !vencida && p.vencimento <= limiteProxima,
      paga: false,
      gerenciadoPorVhsys: p.origem_sistema === 'vhsys',
      numeroParcela: p.numero_parcela,
    })
    if (vencida) recebivelVencido += valorRestante
    else recebivelAVencer += valorRestante
  }
  recebiveisAbertosContas.sort((a, b) => a.vencimento.localeCompare(b.vencimento))
  const recebiveisEmAberto: RecebiveisEmAberto = {
    total: recebivelVencido + recebivelAVencer,
    vencido: recebivelVencido,
    aVencer: recebivelAVencer,
    contas: recebiveisAbertosContas,
  }

  const gruposPagar = montarGrupos(contasPagar)
  const totalDespesas = contasPagar.filter(c => !c.paga).reduce((s, c) => s + c.valor, 0)
  const entradas = agruparPorCategoria(catReceber)
  const saidas = agruparPorCategoria(catPagar)

  return {
    saldoHoje,
    // saldo antes dos lançamentos realizados deste mês — dá pra fechar a
    // conta: saldo início + recebido no mês − pago no mês = saldo hoje.
    saldoInicioMes: saldoHoje - entradas.realizado + saidas.realizado,
    aReceberMes,
    contasPagar,
    gruposPagar,
    contasReceber,
    recebiveisEmAberto,
    entradasPorCategoria: entradas.linhas,
    saidasPorCategoria: saidas.linhas,
    totalEntrou: entradas.realizado,
    totalPagou: saidas.realizado,
    totalDespesas,
    resultado: saldoHoje + aReceberMes - totalDespesas,
    parcelasVencidas: contasPagar.filter(c => c.vencida).length,
    saldoBancarioReferencia: input.saldoBancario ?? null,
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
    saldoInicioMes: soma(r => r.saldoInicioMes),
    aReceberMes: soma(r => r.aReceberMes),
    contasPagar,
    gruposPagar: montarGrupos(contasPagar),
    contasReceber,
    recebiveisEmAberto: {
      contas: resumos.flatMap(r => r.recebiveisEmAberto.contas).sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
      vencido: soma(r => r.recebiveisEmAberto.vencido),
      aVencer: soma(r => r.recebiveisEmAberto.aVencer),
      total: soma(r => r.recebiveisEmAberto.total),
    },
    entradasPorCategoria: mesclarCategorias(resumos.map(r => r.entradasPorCategoria)),
    saidasPorCategoria: mesclarCategorias(resumos.map(r => r.saidasPorCategoria)),
    totalEntrou: soma(r => r.totalEntrou),
    totalPagou: soma(r => r.totalPagou),
    totalDespesas: soma(r => r.totalDespesas),
    resultado: soma(r => r.resultado),
    parcelasVencidas: soma(r => r.parcelasVencidas),
    saldoBancarioReferencia: resumos.every(r => r.saldoBancarioReferencia != null) ? soma(r => r.saldoBancarioReferencia ?? 0) : null,
  }
}
