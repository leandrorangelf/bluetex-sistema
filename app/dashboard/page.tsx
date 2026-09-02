'use client'
export const dynamic = 'force-dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { formatMoeda, formatData, getMesAnoLabel, mesAtual, anoAtual } from '@/lib/utils'
import { chaveCompetencia, type ParcelaFinanceira, type PagamentoParcela } from '@/lib/financeiro'
import { calcularResumoUnidade, consolidarResumos, type ResumoUnidade, type ContaPagar } from '@/lib/painel-resumo'
import { UNIDADES, type Unidade, type GrupoCategoria } from '@/types'

const SHORT: Record<string, string> = { 'NEW BLUETEX MG': 'MG', 'NEW BLUETEX SC': 'SC', 'NEW BLUETEX AM': 'AM' }

async function carregarUnidade(sb: ReturnType<typeof createClient>, unidade: string, ano: number, mes: number, hoje: string): Promise<ResumoUnidade> {
  const competenciaSel = chaveCompetencia(ano, mes)
  const [basesRes, parcelasRes, despesasRes] = await Promise.all([
    sb.from('btx_caixa_mensal').select('*').eq('unidade', unidade).order('ano', { ascending: false }).order('mes', { ascending: false }),
    sb.from('btx_parcelas').select('id,tipo,origem,origem_id,numero_parcela,vencimento,valor,status,data_pagamento,ativo,observacoes').eq('unidade', unidade).eq('ativo', true).neq('status', 'cancelado'),
    sb.from('btx_despesas').select('id, categoria:btx_categorias_despesas(grupo)').eq('unidade', unidade).eq('ativo', true),
  ])

  const bases = (basesRes.data ?? []) as { ano: number; mes: number; saldo_inicial: number }[]
  const baseVigente = bases.find(b => chaveCompetencia(b.ano, b.mes) <= competenciaSel)
  const competenciaBase = baseVigente ? chaveCompetencia(baseVigente.ano, baseVigente.mes) : competenciaSel

  const parcelas = (parcelasRes.data ?? []) as ParcelaFinanceira[]
  const ids = parcelas.map(p => p.id)
  const pagRes = ids.length
    ? await sb.from('btx_pagamentos_parcela').select('id,parcela_id,valor,data_pagamento').in('parcela_id', ids)
    : { data: [] as PagamentoParcela[] }
  const pagamentos = ((pagRes.data ?? []) as { id: string; parcela_id: string; valor: number; data_pagamento: string }[])
    .map(p => ({ id: p.id, parcela_id: p.parcela_id, valor: Number(p.valor), data_pagamento: p.data_pagamento }))

  const grupoPorDespesa = new Map<string, GrupoCategoria>()
  for (const d of (despesasRes.data ?? []) as unknown as { id: string; categoria: { grupo: GrupoCategoria } | null }[]) {
    grupoPorDespesa.set(d.id, d.categoria?.grupo ?? 'outros')
  }

  return calcularResumoUnidade({
    unidade, ano, mes, hoje,
    saldoBase: Number(baseVigente?.saldo_inicial ?? 0),
    competenciaBase, parcelas, pagamentos, grupoPorDespesa,
  })
}

export default function DashboardPage() {
  const { profile, unidadeAtiva } = useAuth()
  const sb = useMemo(() => createClient(), [])
  const veTudo = profile?.role === 'admin' || profile?.role === 'diretoria'
  const [mes, setMes] = useState(mesAtual())
  const [ano, setAno] = useState(anoAtual())
  const [aba, setAba] = useState<'consolidado' | Unidade>('consolidado')
  const [porUnidade, setPorUnidade] = useState<Partial<Record<string, ResumoUnidade>>>({})
  const [loading, setLoading] = useState(true)
  const hoje = new Date().toISOString().slice(0, 10)

  const carregar = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const alvos = veTudo ? UNIDADES : (unidadeAtiva ? [unidadeAtiva] : [])
    const res: Partial<Record<string, ResumoUnidade>> = {}
    await Promise.all(alvos.map(async u => { res[u] = await carregarUnidade(sb, u, ano, mes, hoje) }))
    setPorUnidade(res)
    setLoading(false)
  }, [profile, veTudo, unidadeAtiva, sb, ano, mes, hoje])

  useEffect(() => { carregar() }, [carregar])

  function navMes(dir: number) {
    let m = mes + dir, a = ano
    if (m < 1) { m = 12; a-- }
    if (m > 12) { m = 1; a++ }
    setMes(m); setAno(a)
  }

  const unidadeSel = veTudo ? aba : (unidadeAtiva ?? '')
  const resumo: ResumoUnidade | null = !veTudo
    ? (unidadeAtiva ? porUnidade[unidadeAtiva] ?? null : null)
    : aba === 'consolidado'
      ? consolidarResumos(UNIDADES.map(u => porUnidade[u]).filter(Boolean) as ResumoUnidade[])
      : porUnidade[aba] ?? null

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Painel Executivo</h1>
          <div className="page-subtitle">{getMesAnoLabel(mes, ano)}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navMes(-1)}>←</button>
          <span style={{ fontWeight: 600, fontSize: 13, minWidth: 130, textAlign: 'center' }}>{getMesAnoLabel(mes, ano)}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => navMes(1)}>→</button>
        </div>
      </div>

      {veTudo && (
        <div className="tabs">
          <button className={`tab${aba === 'consolidado' ? ' active' : ''}`} onClick={() => setAba('consolidado')}>◈ Consolidado</button>
          {UNIDADES.map(u => <button key={u} className={`tab${aba === u ? ' active' : ''}`} onClick={() => setAba(u)}>{SHORT[u]}</button>)}
        </div>
      )}

      {loading ? <div className="empty-state">Carregando...</div>
      : !resumo ? <div className="empty-state">Selecione uma unidade.</div>
      : (
        <>
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <div className="stat-card">
              <div className="stat-card-label">Saldo Hoje</div>
              <div className={`stat-card-value ${resumo.saldoHoje < 0 ? 'text-red' : 'text-green'}`}>{formatMoeda(resumo.saldoHoje)}</div>
              <div className="stat-card-sub">saldo real na data de hoje</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">A Receber · {getMesAnoLabel(mes, ano)}</div>
              <div className="stat-card-value" style={{ color: 'var(--purple)' }}>{formatMoeda(resumo.aReceberMes)}</div>
              <div className="stat-card-sub">parcelas que vencem no mês</div>
            </div>
            <div className="stat-card" style={{ borderColor: resumo.resultado >= 0 ? 'var(--green)' : 'var(--red)' }}>
              <div className="stat-card-label">Resultado de Caixa</div>
              <div className={`stat-card-value ${resumo.resultado >= 0 ? 'text-green' : 'text-red'}`} style={{ fontSize: 28 }}>{formatMoeda(resumo.resultado)}</div>
              <div className="stat-card-sub">(saldo + a receber) − contas a pagar</div>
            </div>
          </div>

          {resumo.parcelasVencidas > 0 && (
            <div className="alert alert-red" style={{ marginBottom: 16 }}>⚠ {resumo.parcelasVencidas} conta(s) a pagar vencida(s) sem baixa</div>
          )}

          {resumo.gruposPagar.length === 0 ? (
            <div className="card"><div className="empty-state" style={{ padding: '24px 0' }}>Nenhuma conta a pagar em {getMesAnoLabel(mes, ano)}</div></div>
          ) : (
            <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
              {resumo.gruposPagar.map(g => (
                <div className="card" key={g.grupo}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{g.label}</div>
                    <div className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{formatMoeda(g.subtotal)}</div>
                  </div>
                  {g.contas.map((c: ContaPagar) => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: c.vencida ? 'var(--red)' : c.proxima ? 'var(--amber)' : 'var(--text)' }}>
                          {c.vencida ? '⚠ ' : c.proxima ? '⏰ ' : ''}{c.descricao}
                          {veTudo && aba === 'consolidado' && <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--text-muted)' }}>{SHORT[c.unidade]}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>vence {formatData(c.vencimento)}</div>
                      </div>
                      <div className="mono" style={{ fontWeight: 700, fontSize: 13, color: c.vencida ? 'var(--red)' : 'var(--text)' }}>{formatMoeda(c.valor)}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="stat-card" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="stat-card-label" style={{ margin: 0 }}>Total Despesas do Mês</div>
            <div className="stat-card-value text-red" style={{ margin: 0 }}>{formatMoeda(resumo.totalDespesas)}</div>
          </div>

          {veTudo && aba === 'consolidado' && (
            <div className="card">
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 16 }}>Por Unidade</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Unidade</th><th>Saldo Hoje</th><th>A Receber</th><th>A Pagar</th><th>Resultado</th></tr></thead>
                  <tbody>
                    {UNIDADES.map(u => {
                      const d = porUnidade[u]
                      if (!d) return null
                      return (
                        <tr key={u} style={{ cursor: 'pointer' }} onClick={() => setAba(u)}>
                          <td><span className="badge badge-purple">{SHORT[u]}</span></td>
                          <td className={`mono ${d.saldoHoje < 0 ? 'text-red' : 'text-green'}`}>{formatMoeda(d.saldoHoje)}</td>
                          <td className="mono" style={{ color: 'var(--purple)' }}>{formatMoeda(d.aReceberMes)}</td>
                          <td className="mono text-red">{formatMoeda(d.totalDespesas)}</td>
                          <td className={`mono ${d.resultado >= 0 ? 'text-green' : 'text-red'}`}>{formatMoeda(d.resultado)}</td>
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
