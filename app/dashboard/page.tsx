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
    if (profile.role === 'admin') carregarTodas()
    else if (unidadeAtiva) carregarUnidade(unidadeAtiva).then(d => { setDados({ [unidadeAtiva]: d }); setLoading(false) })
  }, [profile, unidadeAtiva])

  async function carregarTodas() {
    setLoading(true)
    const results: Record<string, DashData> = {}
    for (const u of UNIDADES) results[u] = await carregarUnidade(u)
    setDados(results)
    // Carrega parcelas e estoque consolidado
    await carregarParcelas(null)
    await carregarEstoque(null)
    setLoading(false)
  }

  async function carregarUnidade(unidade: string): Promise<DashData> {
    const mesStr = String(mes).padStart(2, '0')
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const dataInicio = `${ano}-${mesStr}-01`
    const dataFim = `${ano}-${mesStr}-${String(ultimoDia).padStart(2, '0')}`
    const [caixaRes, vendasRes, comprasRes, despesasRes, parcelasRes] = await Promise.all([
      sb.from('btx_caixa_mensal').select('saldo_inicial').eq('unidade', unidade).eq('mes', mes).eq('ano', ano).maybeSingle(),
      sb.from('btx_vendas').select('valor_total').eq('unidade', unidade).eq('ativo', true).gte('data_venda', dataInicio).lte('data_venda', dataFim),
      sb.from('btx_compras').select('valor_total').eq('unidade', unidade).eq('ativo', true).gte('data_compra', dataInicio).lte('data_compra', dataFim),
      sb.from('btx_despesas').select('valor_total').eq('unidade', unidade).eq('ativo', true).gte('data_despesa', dataInicio).lte('data_despesa', dataFim),
      sb.from('btx_parcelas').select('valor,status,vencimento,tipo').eq('unidade', unidade).eq('ativo', true).neq('status', 'cancelado'),
    ])
    const saldoInicial = caixaRes.data?.saldo_inicial ?? 0
    const entradas = (vendasRes.data ?? []).reduce((s, v) => s + Number(v.valor_total), 0)
    const saidas = (comprasRes.data ?? []).reduce((s, v) => s + Number(v.valor_total), 0) + (despesasRes.data ?? []).reduce((s, v) => s + Number(v.valor_total), 0)
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
    const mesStr = String(mes).padStart(2, '0')
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const dataInicio = `${ano}-${mesStr}-01`
    const dataFim = `${ano}-${mesStr}-${String(ultimoDia).padStart(2, '0')}`

    const [produtosRes, estoqueInicialRes, comprasItensRes, vendasItensRes] = await Promise.all([
      sb.from('btx_produtos').select('id,nome,carteiras_por_caixa').eq('ativo', true).order('nome'),
      (() => { let q = sb.from('btx_estoque_inicial').select('produto_id,qtd_carteiras').eq('mes', mes).eq('ano', ano); if (unidade) q = q.eq('unidade', unidade); return q })(),
      (() => { let q = sb.from('btx_compras_itens').select('produto_id,qtd_carteiras,compra:btx_compras(data_compra,unidade)').gte('compra.data_compra', dataInicio).lte('compra.data_compra', dataFim); return q })(),
      (() => { let q = sb.from('btx_vendas_itens').select('produto_id,qtd_carteiras,venda:btx_vendas(data_venda,unidade)').gte('venda.data_venda', dataInicio).lte('venda.data_venda', dataFim); return q })(),
    ])

    const produtos = produtosRes.data ?? []
    const estoqueMap: Record<string, number> = {}
    ;(estoqueInicialRes.data ?? []).forEach((e: { produto_id: string; qtd_carteiras: number }) => { estoqueMap[e.produto_id] = (estoqueMap[e.produto_id] ?? 0) + e.qtd_carteiras })
    ;(comprasItensRes.data ?? []).forEach((i: { produto_id: string; qtd_carteiras: number }) => { estoqueMap[i.produto_id] = (estoqueMap[i.produto_id] ?? 0) + i.qtd_carteiras })
    ;(vendasItensRes.data ?? []).forEach((i: { produto_id: string; qtd_carteiras: number }) => { estoqueMap[i.produto_id] = (estoqueMap[i.produto_id] ?? 0) - i.qtd_carteiras })

    setEstoque(produtos.map(p => ({ produto: p.nome, qtd: estoqueMap[p.id] ?? 0, caixas: Math.floor((estoqueMap[p.id] ?? 0) / p.carteiras_por_caixa), carteiras_por_caixa: p.carteiras_por_caixa })))
  }

  function consolidado(): DashData {
    return Object.values(dados).reduce((acc, d) => ({
      caixa: acc.caixa + d.caixa, entradas: acc.entradas + d.entradas, saidas: acc.saidas + d.saidas,
      aReceber: acc.aReceber + d.aReceber, aPagar: acc.aPagar + d.aPagar, parcelasVencidas: acc.parcelasVencidas + d.parcelasVencidas
    }), { ...EMPTY })
  }

  useEffect(() => {
    if (!profile) return
    const u = isAdmin ? (abaAtiva === 'consolidado' ? null : abaAtiva as string) : unidadeAtiva
    if (u !== undefined) {
      carregarParcelas(u)
      carregarEstoque(u)
    }
  }, [abaAtiva, profile, unidadeAtiva])

  const dadosAtivos = isAdmin ? (abaAtiva === 'consolidado' ? consolidado() : (dados[abaAtiva] ?? EMPTY)) : (unidadeAtiva ? (dados[unidadeAtiva] ?? EMPTY) : EMPTY)
  const resultado = dadosAtivos.aReceber - dadosAtivos.aPagar

  // Agrupa parcelas por semana
  const proximos30 = parcelas.filter(p => p.vencimento >= hoje && p.vencimento <= new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0])
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
          {/* Stats */}
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <div className="stat-card">
              <div className="stat-card-label">Caixa do Mês</div>
              <div className={`stat-card-value ${dadosAtivos.caixa < 0 ? 'text-red' : 'text-green'}`}>{formatMoeda(dadosAtivos.caixa)}</div>
              <div className="stat-card-sub">saldo inicial + entradas − saídas</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Entradas</div>
              <div className="stat-card-value text-green">{formatMoeda(dadosAtivos.entradas)}</div>
              <div className="stat-card-sub">vendas do mês</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Saídas</div>
              <div className="stat-card-value text-red">{formatMoeda(dadosAtivos.saidas)}</div>
              <div className="stat-card-sub">compras + despesas</div>
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
            {/* Contas a Pagar */}
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

            {/* Estoque Atual */}
            <div className="card">
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 16 }}>
                Estoque Atual — {getMesAnoLabel(mes, ano)}
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

          {/* Tabela comparativa admin */}
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
