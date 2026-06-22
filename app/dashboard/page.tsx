'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { formatMoeda, getMesAnoLabel, mesAtual, anoAtual, formatData } from '@/lib/utils'
import type { Unidade } from '@/types'

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
  produto: string; qtd: number; caixas: number; carteiras_por_caixa: number
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
    const mesStr = String(mes).padStart(2, '0')
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const dataInicio = `${ano}-${mesStr}-01`
    const dataFim = `${ano}-${mesStr}-${String(ultimoDia).padStart(2, '0')}`

    const [caixaRes, parcelasPagasRes, parcelasRes] = await Promise.all([
      sb.from('btx_caixa_mensal')
        .select('saldo_inicial')
        .eq('unidade', unidade)
        .eq('mes', mes)
        .eq('ano', ano)
        .maybeSingle(),

      sb.from('btx_parcelas')
        .select('valor,tipo,status,vencimento,data_pagamento')
        .eq('unidade', unidade)
        .eq('ativo', true)
        .eq('status', 'pago')
        .gte('data_pagamento', dataInicio)
        .lte('data_pagamento', dataFim),

      sb.from('btx_parcelas')
        .select('valor,status,vencimento,tipo')
        .eq('unidade', unidade)
        .eq('ativo', true)
        .neq('status', 'cancelado'),
    ])

    const saldoInicial = caixaRes.data?.saldo_inicial ?? 0
    const parcelasPagas = parcelasPagasRes.data ?? []

    const entradas = parcelasPagas
      .filter(p => p.tipo === 'receber')
      .reduce((s, p) => s + Number(p.valor), 0)

    const saidas = parcelasPagas
      .filter(p => p.tipo === 'pagar')
      .reduce((s, p) => s + Number(p.valor), 0)

    const parc = parcelasRes.data ?? []
    const aReceber = parc.filter(p => p.tipo === 'receber' && p.status === 'pendente').reduce((s, p) => s + Number(p.valor), 0)
    const aPagar = parc.filter(p => p.tipo === 'pagar' && p.status === 'pendente').reduce((s, p) => s + Number(p.valor), 0)
    const parcelasVencidas = parc.filter(p => p.status === 'pendente' && p.vencimento < hoje).length

    return { caixa: saldoInicial + entradas - saidas, entradas, saidas, aReceber, aPagar, parcelasVencidas }
  }

  async function carregarParcelas(unidade: string | null) {
    let q = sb.from('btx_parcelas').select('id,vencimento,valor,tipo,status,origem,unidade').eq('ativo', true).eq('status', 'pendente').order('vencimento')
    if (unidade) q = q.eq('unidade', unidade)
    const { data } = await q
    setParcelas(data ?? [])
  }

  async function carregarEstoque(unidade: string | null) {
    const [produtosRes, estoqueInicialRes, comprasRes, vendasRes] = await Promise.all([
      sb.from('btx_produtos')
        .select('id,nome,carteiras_por_caixa')
        .eq('ativo', true)
        .order('nome'),

      (() => {
        let q = sb.from('btx_estoque_inicial')
          .select('unidade,produto_id,qtd_carteiras,mes,ano')
          .order('ano', { ascending: false })
          .order('mes', { ascending: false })

        if (unidade) q = q.eq('unidade', unidade)
        return q
      })(),

      (() => {
        let q = sb.from('btx_compras')
          .select('id,unidade,itens:btx_compras_itens(produto_id,qtd_carteiras)')
          .eq('ativo', true)

        if (unidade) q = q.eq('unidade', unidade)
        return q
      })(),

      (() => {
        let q = sb.from('btx_vendas')
          .select('id,unidade,itens:btx_vendas_itens(produto_id,qtd_carteiras)')
          .eq('ativo', true)

        if (unidade) q = q.eq('unidade', unidade)
        return q
      })(),
    ])

    const produtos = produtosRes.data ?? []
    const estoqueMap: Record<string, number> = {}
    const baseAplicada: Record<string, boolean> = {}

    function key(unidadeMov: string, produtoId: string) {
      return `${unidadeMov}::${produtoId}`
    }

    // Marco zero: pega o último estoque inicial cadastrado por unidade/produto.
    ;(estoqueInicialRes.data ?? []).forEach((e: { unidade: string; produto_id: string; qtd_carteiras: number; mes: number; ano: number }) => {
      const k = key(e.unidade, e.produto_id)

      if (!baseAplicada[k]) {
        estoqueMap[k] = Number(e.qtd_carteiras)
        baseAplicada[k] = true
      }
    })

    // Entradas reais após começar a usar o sistema.
    ;(comprasRes.data ?? []).forEach((compra: { unidade: string; itens?: { produto_id: string; qtd_carteiras: number }[] }) => {
      ;(compra.itens ?? []).forEach((i: { produto_id: string; qtd_carteiras: number }) => {
        const k = key(compra.unidade, i.produto_id)
        estoqueMap[k] = (estoqueMap[k] ?? 0) + Number(i.qtd_carteiras)
      })
    })

    // Saídas reais após começar a usar o sistema.
    ;(vendasRes.data ?? []).forEach((venda: { unidade: string; itens?: { produto_id: string; qtd_carteiras: number }[] }) => {
      ;(venda.itens ?? []).forEach((i: { produto_id: string; qtd_carteiras: number }) => {
        const k = key(venda.unidade, i.produto_id)
        estoqueMap[k] = (estoqueMap[k] ?? 0) - Number(i.qtd_carteiras)
      })
    })

    setEstoque(produtos.map(p => {
      const qtd = Object.entries(estoqueMap)
        .filter(([k]) => k.endsWith(`::${p.id}`))
        .reduce((s, [, v]) => s + v, 0)

      return {
        produto: p.nome,
        qtd,
        caixas: Math.floor(qtd / p.carteiras_por_caixa),
        carteiras_por_caixa: p.carteiras_por_caixa
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
              <div className="stat-card-sub">saldo inicial + recebidas − pagas</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Entradas</div>
              <div className="stat-card-value text-green">{formatMoeda(dadosAtivos.entradas)}</div>
              <div className="stat-card-sub">parcelas recebidas no mês</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Saídas</div>
              <div className="stat-card-value text-red">{formatMoeda(dadosAtivos.saidas)}</div>
              <div className="stat-card-sub">parcelas pagas no mês</div>
            </div>
          </div>

          <div className="grid-3" style={{ marginBottom: 24 }}>
            <div className="stat-card">
              <div className="stat-card-label">A Receber</div>
              <div className="stat-card-value" style={{ color: 'var(--purple)' }}>{formatMoeda(dadosAtivos.aReceber)}</div>
              <div className="stat-card-sub">parcelas pendentes</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">A Pagar</div>
              <div className="stat-card-value text-amber">{formatMoeda(dadosAtivos.aPagar)}</div>
              <div className="stat-card-sub">parcelas pendentes</div>
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
                      <tr><th>Produto</th><th>Carteiras</th><th>Caixas</th></tr>
                    </thead>
                    <tbody>
                      {estoque.map((e, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: 12 }}>{e.produto}</td>
                          <td className="mono">{e.qtd.toLocaleString('pt-BR')}</td>
                          <td className="mono" style={{ color: e.caixas < 0 ? 'var(--red)' : 'var(--text)' }}>{e.caixas}</td>
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
