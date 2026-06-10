'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { formatMoeda, getMesAnoLabel, mesAtual, anoAtual } from '@/lib/utils'
import type { Unidade } from '@/types'

const UNIDADES: Unidade[] = ['NEW BLUETEX MG', 'NEW BLUETEX SC', 'NEW BLUETEX AM']
const UNIDADE_SHORT: Record<string, string> = {
  'NEW BLUETEX MG': 'MG',
  'NEW BLUETEX SC': 'SC',
  'NEW BLUETEX AM': 'AM',
}

interface DashData {
  caixa: number
  entradas: number
  saidas: number
  aReceber: number
  aPagar: number
  parcelasVencidas: number
}

const EMPTY: DashData = { caixa: 0, entradas: 0, saidas: 0, aReceber: 0, aPagar: 0, parcelasVencidas: 0 }

export default function DashboardPage() {
  const { profile, unidadeAtiva } = useAuth()
  const sb = createClient()
  const isAdmin = profile?.role === 'admin'
  const [abaAtiva, setAbaAtiva] = useState<'consolidado' | Unidade>('consolidado')
  const [dados, setDados] = useState<Record<string, DashData>>({})
  const [loading, setLoading] = useState(true)
  const mes = mesAtual()
  const ano = anoAtual()

  useEffect(() => {
    if (!profile) return
    if (profile.role === 'admin') {
      carregarTodas()
    } else if (unidadeAtiva) {
      carregarUnidade(unidadeAtiva).then(d => {
        setDados({ [unidadeAtiva]: d })
        setLoading(false)
      })
    }
  }, [profile, unidadeAtiva])

  async function carregarTodas() {
    setLoading(true)
    const results: Record<string, DashData> = {}
    for (const u of UNIDADES) {
      results[u] = await carregarUnidade(u)
    }
    setDados(results)
    setLoading(false)
  }

  async function carregarUnidade(unidade: string): Promise<DashData> {
    const hoje = new Date().toISOString().split('T')[0]
    const mesStr = String(mes).padStart(2,'0')
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const dataInicio = `${ano}-${mesStr}-01`
    const dataFim = `${ano}-${mesStr}-${String(ultimoDia).padStart(2,'0')}`

    const [caixaRes, vendasRes, comprasRes, despesasRes, parcelasRes] = await Promise.all([
      sb.from('btx_caixa_mensal').select('saldo_inicial').eq('unidade', unidade).eq('mes', mes).eq('ano', ano).maybeSingle(),
      sb.from('btx_vendas').select('valor_total').eq('unidade', unidade).eq('ativo', true)
        .gte('data_venda', dataInicio).lte('data_venda', dataFim),
      sb.from('btx_compras').select('valor_total').eq('unidade', unidade).eq('ativo', true)
        .gte('data_compra', dataInicio).lte('data_compra', dataFim),
      sb.from('btx_despesas').select('valor_total').eq('unidade', unidade).eq('ativo', true)
        .gte('data_despesa', dataInicio).lte('data_despesa', dataFim),
      sb.from('btx_parcelas').select('valor,status,vencimento,tipo').eq('unidade', unidade).eq('ativo', true).neq('status', 'cancelado'),
    ])

    const saldoInicial = caixaRes.data?.saldo_inicial ?? 0
    const entradas = (vendasRes.data ?? []).reduce((s, v) => s + Number(v.valor_total), 0)
    const saidas = (comprasRes.data ?? []).reduce((s, v) => s + Number(v.valor_total), 0)
      + (despesasRes.data ?? []).reduce((s, v) => s + Number(v.valor_total), 0)
    const parcelas = parcelasRes.data ?? []
    const aReceber = parcelas.filter(p => p.tipo === 'receber' && p.status === 'pendente').reduce((s, p) => s + Number(p.valor), 0)
    const aPagar = parcelas.filter(p => p.tipo === 'pagar' && p.status === 'pendente').reduce((s, p) => s + Number(p.valor), 0)
    const parcelasVencidas = parcelas.filter(p => p.status === 'pendente' && p.vencimento < hoje).length

    return {
      caixa: saldoInicial + entradas - saidas,
      entradas, saidas, aReceber, aPagar, parcelasVencidas
    }
  }

  function consolidado(): DashData {
    return Object.values(dados).reduce((acc, d) => ({
      caixa: acc.caixa + d.caixa,
      entradas: acc.entradas + d.entradas,
      saidas: acc.saidas + d.saidas,
      aReceber: acc.aReceber + d.aReceber,
      aPagar: acc.aPagar + d.aPagar,
      parcelasVencidas: acc.parcelasVencidas + d.parcelasVencidas,
    }), { ...EMPTY })
  }

  const dadosAtivos = isAdmin
    ? (abaAtiva === 'consolidado' ? consolidado() : (dados[abaAtiva] ?? EMPTY))
    : (unidadeAtiva ? (dados[unidadeAtiva] ?? EMPTY) : EMPTY)

  const resultado = dadosAtivos.aReceber - dadosAtivos.aPagar

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title cursor">Dashboard</div>
          <div className="page-subtitle">{getMesAnoLabel(mes, ano)}</div>
        </div>
      </div>

      {/* Abas — só admin */}
      {isAdmin && (
        <div className="tabs">
          <button className={`tab${abaAtiva === 'consolidado' ? ' active' : ''}`} onClick={() => setAbaAtiva('consolidado')}>
            ◈ Consolidado
          </button>
          {UNIDADES.map(u => (
            <button key={u} className={`tab${abaAtiva === u ? ' active' : ''}`} onClick={() => setAbaAtiva(u)}>
              {UNIDADE_SHORT[u]}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="empty-state">Carregando...</div>
      ) : (
        <>
          {/* Stats principais */}
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <div className="stat-card">
              <div className="stat-card-label">Caixa do Mês</div>
              <div className={`stat-card-value ${dadosAtivos.caixa < 0 ? 'text-red glow-red' : 'glow'}`}>
                {formatMoeda(dadosAtivos.caixa)}
              </div>
              <div className="stat-card-sub">saldo inicial + entradas - saídas</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Entradas no Mês</div>
              <div className="stat-card-value text-green">{formatMoeda(dadosAtivos.entradas)}</div>
              <div className="stat-card-sub">vendas realizadas</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Saídas no Mês</div>
              <div className="stat-card-value text-red">{formatMoeda(dadosAtivos.saidas)}</div>
              <div className="stat-card-sub">compras + despesas</div>
            </div>
          </div>

          <div className="grid-3" style={{ marginBottom: 16 }}>
            <div className="stat-card">
              <div className="stat-card-label">A Receber</div>
              <div className="stat-card-value text-cyan glow-cyan">{formatMoeda(dadosAtivos.aReceber)}</div>
              <div className="stat-card-sub">parcelas pendentes</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">A Pagar</div>
              <div className="stat-card-value text-amber glow-amber">{formatMoeda(dadosAtivos.aPagar)}</div>
              <div className="stat-card-sub">parcelas pendentes</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Resultado Previsto</div>
              <div className={`stat-card-value ${resultado >= 0 ? 'text-green glow' : 'text-red glow-red'}`}>
                {formatMoeda(resultado)}
              </div>
              <div className="stat-card-sub">a receber − a pagar</div>
            </div>
          </div>

          {dadosAtivos.parcelasVencidas > 0 && (
            <div className="alert alert-red">
              ⚠ {dadosAtivos.parcelasVencidas} parcela(s) vencida(s) sem pagamento registrado
            </div>
          )}

          {/* Tabela por unidade — só no consolidado admin */}
          {isAdmin && abaAtiva === 'consolidado' && (
            <div className="card" style={{ marginTop: 24 }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--pixel)', color: 'var(--text-dim)', marginBottom: 16, textTransform: 'uppercase' }}>
                Comparativo por Unidade
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Unidade</th>
                      <th>Caixa</th>
                      <th>Entradas</th>
                      <th>Saídas</th>
                      <th>A Receber</th>
                      <th>A Pagar</th>
                      <th>Vencidas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {UNIDADES.map(u => {
                      const d = dados[u] ?? EMPTY
                      return (
                        <tr key={u} style={{ cursor: 'pointer' }} onClick={() => setAbaAtiva(u)}>
                          <td><span className="badge badge-green">{UNIDADE_SHORT[u]}</span></td>
                          <td className={`mono ${d.caixa < 0 ? 'text-red' : 'text-green'}`}>{formatMoeda(d.caixa)}</td>
                          <td className="mono text-green">{formatMoeda(d.entradas)}</td>
                          <td className="mono text-red">{formatMoeda(d.saidas)}</td>
                          <td className="mono text-cyan">{formatMoeda(d.aReceber)}</td>
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
