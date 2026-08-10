'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { formatMoeda, getMesAnoLabel, mesAtual, anoAtual, formatData, ordenarProdutos } from '@/lib/utils'
import { calcularEstoque, normalizarAberturasEstoque, normalizarMovimentosEstoque, normalizarProdutosEstoque, type AberturaEstoqueDb, type CompraEstoqueDb, type VendaEstoqueDb } from '@/lib/estoque'
import { calcularPainelFinanceiro, chaveCompetencia, type PagamentoParcela as PagamentoCalculo, type ParcelaFinanceira } from '@/lib/financeiro'
import type { AjusteEstoque, CaixaMensal, Produto, Unidade } from '@/types'

const UNIDADES: Unidade[] = ['NEW BLUETEX MG', 'NEW BLUETEX SC', 'NEW BLUETEX AM']
const UNIDADE_SHORT: Record<string, string> = {
  'NEW BLUETEX MG': 'MG', 'NEW BLUETEX SC': 'SC', 'NEW BLUETEX AM': 'AM'
}

interface DashData {
  caixa: number; entradas: number; saidas: number; aReceber: number; aPagar: number; parcelasVencidas: number
}
interface Parcela {
  id: string; vencimento: string; valor: number; tipo: string; status: string; origem: string; unidade: string
}
interface EstoqueItem {
  produto: string; qtd: number; caixas: number; unidade_base: string; unidade_maior: string
}

const EMPTY: DashData = { caixa: 0, entradas: 0, saidas: 0, aReceber: 0, aPagar: 0, parcelasVencidas: 0 }

export default function DashboardPage() {
  const { profile, unidadeAtiva } = useAuth()
  const sb = createClient()
  const isAdmin = profile?.role === 'admin'
  const [abaAtiva, setAbaAtiva] = useState<'consolidado' | Unidade>('consolidado')
  const [dados, setDados] = useState<Record<string, DashData>>({})
  const [parcelas, setParcelas] = useState<Parcela[]>([])
  const [estoque, setEstoque] = useState<EstoqueItem[]>([])
  const [loading, setLoading] = useState(true)
  const mes = mesAtual()
  const ano = anoAtual()
  const hoje = new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (!profile) return
    if (profile.role === 'admin') {
      carregarTodas()
    } else if (unidadeAtiva) {
      carregarUnidade(unidadeAtiva).then(d => {
        setDados({ [unidadeAtiva]: d })
        carregarParcelas(unidadeAtiva)
        carregarEstoque(unidadeAtiva)
        setLoading(false)
      })
    }
  }, [profile, unidadeAtiva])

  async function carregarTodas() {
    setLoading(true)
    const results: Record<string, DashData> = {}
    for (const u of UNIDADES) results[u] = await carregarUnidade(u)
    setDados(results)
    await carregarParcelas(null)
    await carregarEstoque(null)
    setLoading(false)
  }

  async function carregarUnidade(unidade: string): Promise<DashData> {
    const competenciaSelecionada = chaveCompetencia(ano, mes)

    const [basesRes, parcelasRes] = await Promise.all([
      sb.from('btx_caixa_mensal').select('*').eq('unidade', unidade).order('ano', { ascending: false }).order('mes', { ascending: false }),
      sb.from('btx_parcelas').select('*').eq('unidade', unidade).eq('ativo', true).neq('status', 'cancelado'),
    ])

    const bases = (basesRes.data ?? []) as CaixaMensal[]
    const base = bases.find(item => chaveCompetencia(item.ano, item.mes) <= competenciaSelecionada)
    const competenciaBase = base ? chaveCompetencia(base.ano, base.mes) : competenciaSelecionada

    const parcelas = (parcelasRes.data ?? []) as ParcelaFinanceira[]
    const parcelaIds = parcelas.map(item => item.id)
    const pagamentosRes = parcelaIds.length
      ? await sb.from('btx_pagamentos_parcela').select('*').in('parcela_id', parcelaIds)
      : { data: [] as PagamentoCalculo[] }
    const pagamentos: PagamentoCalculo[] = (pagamentosRes.data ?? []).map((item: { id: string; parcela_id: string; valor: number; data_pagamento: string }) => ({
      id: item.id, parcela_id: item.parcela_id, valor: Number(item.valor), data_pagamento: item.data_pagamento,
    }))

    const calculado = calcularPainelFinanceiro({
      ano, mes, hoje, saldoBase: Number(base?.saldo_inicial ?? 0), competenciaBase, parcelas, pagamentos,
    })

    const valorPagoPorParcela = new Map<string, number>()
    for (const item of pagamentos) {
      valorPagoPorParcela.set(item.parcela_id, (valorPagoPorParcela.get(item.parcela_id) ?? 0) + item.valor)
    }
    let aReceber = 0
    let aPagar = 0
    let parcelasVencidas = 0
    for (const parcela of parcelas) {
      if (parcela.status !== 'pendente' && parcela.status !== 'parcial') continue
      const restante = Number(parcela.valor) - (valorPagoPorParcela.get(parcela.id) ?? 0)
      if (parcela.tipo === 'receber') aReceber += restante
      else aPagar += restante
      if (parcela.vencimento < hoje) parcelasVencidas++
    }

    return { caixa: calculado.resumo.saldoFinal, entradas: calculado.resumo.totalEntradas, saidas: calculado.resumo.totalSaidas, aReceber, aPagar, parcelasVencidas }
  }

  async function carregarParcelas(unidade: string | null) {
    let q = sb.from('btx_parcelas').select('id,vencimento,valor,tipo,status,origem,unidade').eq('ativo', true).in('status', ['pendente', 'parcial']).order('vencimento')
    if (unidade) q = q.eq('unidade', unidade)
    const { data } = await q
    const lista = (data ?? []) as Parcela[]
    const parciais = lista.filter(item => item.status === 'parcial')
    if (parciais.length) {
      const { data: pagamentos } = await sb.from('btx_pagamentos_parcela').select('parcela_id,valor').in('parcela_id', parciais.map(item => item.id))
      const pagoPorParcela = new Map<string, number>()
      for (const item of (pagamentos ?? []) as { parcela_id: string; valor: number }[]) {
        pagoPorParcela.set(item.parcela_id, (pagoPorParcela.get(item.parcela_id) ?? 0) + Number(item.valor))
      }
      for (const item of lista) {
        if (item.status === 'parcial') item.valor = Number(item.valor) - (pagoPorParcela.get(item.id) ?? 0)
      }
    }
    setParcelas(lista)
  }

  async function carregarEstoque(unidadeFiltro: string | null) {
    const [produtosRes, aberturasRes, comprasRes, vendasRes, ajustesRes] = await Promise.all([
      sb.from('btx_produtos').select('*, unidade_base:btx_unidades_medida!unidade_base_id(nome), unidade_maior:btx_unidades_medida!unidade_maior_id(nome)').eq('ativo', true),
      (() => { let q = sb.from('btx_estoque_inicial').select('id,unidade,produto_id,mes,ano,qtd_carteiras'); if (unidadeFiltro) q = q.eq('unidade', unidadeFiltro); return q })(),
      (() => { let q = sb.from('btx_compras').select('id,unidade,data_compra,numero_nf,itens:btx_compras_itens(id,produto_id,qtd_carteiras)').eq('ativo', true); if (unidadeFiltro) q = q.eq('unidade', unidadeFiltro); return q })(),
      (() => { let q = sb.from('btx_vendas').select('id,unidade,data_venda,numero_nf,itens:btx_vendas_itens(id,produto_id,qtd_carteiras)').eq('ativo', true); if (unidadeFiltro) q = q.eq('unidade', unidadeFiltro); return q })(),
      (() => { let q = sb.from('btx_ajustes_estoque').select('*').eq('ativo', true); if (unidadeFiltro) q = q.eq('unidade', unidadeFiltro); return q })(),
    ])

    const produtos = ordenarProdutos((produtosRes.data ?? []) as Produto[])
    const produtosNormalizados = normalizarProdutosEstoque(produtos)
    const unidadesAlvo = unidadeFiltro ? [unidadeFiltro] : UNIDADES

    const aberturas = (aberturasRes.data ?? []) as (AberturaEstoqueDb & { unidade: string })[]
    const compras = (comprasRes.data ?? []) as unknown as (CompraEstoqueDb & { unidade: string })[]
    const vendas = (vendasRes.data ?? []) as unknown as (VendaEstoqueDb & { unidade: string })[]
    const ajustes = (ajustesRes.data ?? []) as AjusteEstoque[]

    const totais = new Map<string, { qtd: number; fatorConversao: number; unidadeBase?: string; unidadeMaior?: string }>()
    for (const u of unidadesAlvo) {
      const painelUnidade = calcularEstoque({
        ano, mes,
        produtos: produtosNormalizados,
        aberturas: normalizarAberturasEstoque(aberturas.filter(item => item.unidade === u)),
        movimentos: normalizarMovimentosEstoque(compras.filter(item => item.unidade === u), vendas.filter(item => item.unidade === u), ajustes.filter(item => item.unidade === u)),
      })
      for (const saldo of painelUnidade.saldos) {
        const atual = totais.get(saldo.produtoId) ?? { qtd: 0, fatorConversao: saldo.fatorConversao, unidadeBase: saldo.unidadeBase, unidadeMaior: saldo.unidadeMaior }
        atual.qtd += saldo.saldoAtual
        totais.set(saldo.produtoId, atual)
      }
    }

    setEstoque(produtosNormalizados.map(produto => {
      const info = totais.get(produto.id)
      const qtd = info?.qtd ?? 0
      return {
        produto: produto.nome,
        qtd,
        caixas: qtd / produto.fatorConversao,
        unidade_base: info?.unidadeBase ?? produto.unidadeBase ?? '',
        unidade_maior: info?.unidadeMaior ?? produto.unidadeMaior ?? '',
      }
    }))
  }

  function consolidado(): DashData {
    return Object.values(dados).reduce((acc, d) => ({
      caixa: acc.caixa + d.caixa, entradas: acc.entradas + d.entradas, saidas: acc.saidas + d.saidas,
      aReceber: acc.aReceber + d.aReceber, aPagar: acc.aPagar + d.aPagar, parcelasVencidas: acc.parcelasVencidas + d.parcelasVencidas
    }), { ...EMPTY })
  }

  useEffect(() => {
    if (!profile || !isAdmin) return
    const u = abaAtiva === 'consolidado' ? null : abaAtiva as string
    carregarParcelas(u)
    carregarEstoque(u)
  }, [abaAtiva, profile])

  const dadosAtivos = isAdmin ? (abaAtiva === 'consolidado' ? consolidado() : (dados[abaAtiva] ?? EMPTY)) : (unidadeAtiva ? (dados[unidadeAtiva] ?? EMPTY) : EMPTY)
  const resultado = dadosAtivos.aReceber - dadosAtivos.aPagar

  const vencidas = parcelas.filter(p => p.vencimento < hoje)
  const aPagarList = parcelas.filter(p => p.tipo === 'pagar' && p.status === 'pendente').sort((a, b) => a.vencimento.localeCompare(b.vencimento))

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">{getMesAnoLabel(mes, ano)}</div>
        </div>
      </div>

      {isAdmin && (
        <div className="tabs">
          <button className={`tab${abaAtiva === 'consolidado' ? ' active' : ''}`} onClick={() => setAbaAtiva('consolidado')}>◈ Consolidado</button>
          {UNIDADES.map(u => <button key={u} className={`tab${abaAtiva === u ? ' active' : ''}`} onClick={() => setAbaAtiva(u)}>{UNIDADE_SHORT[u]}</button>)}
        </div>
      )}

      {loading ? <div className="empty-state">Carregando...</div> : (
        <>
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <div className="stat-card">
              <div className="stat-card-label">Caixa do Mês</div>
              <div className={`stat-card-value ${dadosAtivos.caixa < 0 ? 'text-red' : 'text-green'}`}>{formatMoeda(dadosAtivos.caixa)}</div>
              <div className="stat-card-sub">saldo em banco + fluxo do mês (igual ao Painel Financeiro)</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Entradas</div>
              <div className="stat-card-value text-green">{formatMoeda(dadosAtivos.entradas)}</div>
              <div className="stat-card-sub">realizadas e previstas no mês</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Saídas</div>
              <div className="stat-card-value text-red">{formatMoeda(dadosAtivos.saidas)}</div>
              <div className="stat-card-sub">realizadas e previstas no mês</div>
            </div>
          </div>

          <div className="grid-3" style={{ marginBottom: 24 }}>
            <div className="stat-card">
              <div className="stat-card-label">A Receber</div>
              <div className="stat-card-value" style={{ color: 'var(--purple)' }}>{formatMoeda(dadosAtivos.aReceber)}</div>
              <div className="stat-card-sub">saldo pendente, inclusive parcelas parciais</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">A Pagar</div>
              <div className="stat-card-value text-amber">{formatMoeda(dadosAtivos.aPagar)}</div>
              <div className="stat-card-sub">saldo pendente, inclusive parcelas parciais</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Resultado Previsto</div>
              <div className={`stat-card-value ${resultado >= 0 ? 'text-green' : 'text-red'}`}>{formatMoeda(resultado)}</div>
              <div className="stat-card-sub">a receber − a pagar</div>
            </div>
          </div>

          {dadosAtivos.parcelasVencidas > 0 && (
            <div className="alert alert-red" style={{ marginBottom: 24 }}>⚠ {dadosAtivos.parcelasVencidas} parcela(s) vencida(s) sem pagamento</div>
          )}

          <div className="grid-2" style={{ gap: 24, marginBottom: 24 }}>
            <div className="card">
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 16 }}>
                Contas a Pagar
              </div>
              {vencidas.filter(p => p.tipo === 'pagar').length > 0 && (
                <div className="alert alert-red" style={{ marginBottom: 12, fontSize: 11 }}>
                  {vencidas.filter(p => p.tipo === 'pagar').length} vencida(s) — {formatMoeda(vencidas.filter(p => p.tipo === 'pagar').reduce((s, p) => s + p.valor, 0))}
                </div>
              )}
              {aPagarList.length === 0 ? (
                <div className="empty-state" style={{ padding: '24px 0' }}>Nenhuma conta a pagar</div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {aPagarList.slice(0, 20).map(p => {
                    const vencida = p.vencimento < hoje
                    const hoje7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
                    const proxima = !vencida && p.vencimento <= hoje7
                    return (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: vencida ? 'var(--red)' : proxima ? 'var(--amber)' : 'var(--text)' }}>
                            {vencida ? '⚠ ' : proxima ? '⏰ ' : ''}{formatData(p.vencimento)}
                            {isAdmin && <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--text-muted)' }}>{UNIDADE_SHORT[p.unidade]}</span>}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.origem}</div>
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: vencida ? 'var(--red)' : 'var(--text)' }}>
                          {formatMoeda(p.valor)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="card">
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 16 }}>
                Estoque Atual
              </div>
              {estoque.length === 0 ? (
                <div className="empty-state" style={{ padding: '24px 0' }}>Sem dados de estoque</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Produto</th><th>Qtd</th><th>Equivalente</th></tr>
                    </thead>
                    <tbody>
                      {estoque.map((e, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: 12 }}>{e.produto}</td>
                          <td className="mono">{e.qtd.toLocaleString('pt-BR')} {e.unidade_base}</td>
                          <td className="mono" style={{ color: e.caixas < 0 ? 'var(--red)' : 'var(--text)' }}>{e.caixas.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {e.unidade_maior}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {isAdmin && abaAtiva === 'consolidado' && (
            <div className="card">
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 16 }}>
                Comparativo por Unidade
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Unidade</th><th>Caixa</th><th>Entradas</th><th>Saídas</th><th>A Receber</th><th>A Pagar</th><th>Vencidas</th></tr>
                  </thead>
                  <tbody>
                    {UNIDADES.map(u => {
                      const d = dados[u] ?? EMPTY
                      return (
                        <tr key={u} style={{ cursor: 'pointer' }} onClick={() => setAbaAtiva(u)}>
                          <td><span className="badge badge-purple">{UNIDADE_SHORT[u]}</span></td>
                          <td className={`mono ${d.caixa < 0 ? 'text-red' : 'text-green'}`}>{formatMoeda(d.caixa)}</td>
                          <td className="mono text-green">{formatMoeda(d.entradas)}</td>
                          <td className="mono text-red">{formatMoeda(d.saidas)}</td>
                          <td className="mono" style={{ color: 'var(--purple)' }}>{formatMoeda(d.aReceber)}</td>
                          <td className="mono text-amber">{formatMoeda(d.aPagar)}</td>
                          <td>{d.parcelasVencidas > 0 ? <span className="badge badge-red">{d.parcelasVencidas}</span> : <span className="text-muted">—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
