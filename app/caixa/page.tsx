'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { formatMoeda, getMesAnoLabel, mesAtual, anoAtual } from '@/lib/utils'
import type { Unidade } from '@/types'
import { UNIDADES } from '@/types'

export default function CaixaPage() {
  const { profile, unidadeAtiva } = useAuth()
  const [mes, setMes] = useState(mesAtual())
  const [ano, setAno] = useState(anoAtual())
  const [unidade, setUnidade] = useState<Unidade | ''>(unidadeAtiva ?? '')
  const [saldoInicial, setSaldoInicial] = useState(0)
  const [saldoEdit, setSaldoEdit] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [recebido, setRecebido] = useState(0)
  const [pago, setPago] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const sb = createClient()
  const isAdmin = profile?.role === 'admin'

  useEffect(() => { if (unidadeAtiva) setUnidade(unidadeAtiva) }, [unidadeAtiva])
  useEffect(() => { loadData() }, [mes, ano, unidade])

  async function loadData() {
    if (!unidade) { setLoading(false); return }
    setLoading(true)

    const mesStr = String(mes).padStart(2, '0')
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const mesStart = `${ano}-${mesStr}-01`
    const mesEnd = `${ano}-${mesStr}-${String(ultimoDia).padStart(2, '0')}`

    const [{ data: cx }, { data: pp }, { data: pr }] = await Promise.all([
      sb.from('btx_caixa_mensal').select('*').eq('unidade', unidade).eq('mes', mes).eq('ano', ano).maybeSingle(),
      sb.from('btx_parcelas').select('valor').eq('unidade', unidade).eq('tipo','pagar').eq('status','pago').eq('ativo',true)
        .gte('data_pagamento', mesStart).lte('data_pagamento', mesEnd),
      sb.from('btx_parcelas').select('valor').eq('unidade', unidade).eq('tipo','receber').eq('status','pago').eq('ativo',true)
        .gte('data_pagamento', mesStart).lte('data_pagamento', mesEnd),
    ])

    const si = cx?.saldo_inicial ?? 0
    setSaldoInicial(si); setSaldoEdit(si)
    setPago((pp ?? []).reduce((a: number, r: { valor: number }) => a + Number(r.valor), 0))
    setRecebido((pr ?? []).reduce((a: number, r: { valor: number }) => a + Number(r.valor), 0))
    setLoading(false)
  }

  function navMes(dir: number) {
    let m = mes + dir, a = ano
    if (m < 1) { m = 12; a-- }
    if (m > 12) { m = 1; a++ }
    setMes(m); setAno(a)
  }

  async function salvar() {
    if (!unidade) return
    setSaving(true)
    await sb.from('btx_caixa_mensal').upsert(
      { unidade, mes, ano, saldo_inicial: saldoEdit, updated_at: new Date().toISOString() },
      { onConflict: 'unidade,mes,ano' }
    )
    setSaldoInicial(saldoEdit)
    setSaving(false); setEditMode(false); loadData()
  }

  const saldoFinal = saldoInicial + recebido - pago

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Caixa Mensal</h1><div className="page-subtitle">Fluxo de caixa por mês e unidade</div></div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 28, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navMes(-1)}>← Anterior</button>
        <span style={{ fontWeight: 600, fontSize: 15, minWidth: 160, textAlign: 'center' }}>{getMesAnoLabel(mes, ano)}</span>
        <button className="btn btn-secondary btn-sm" onClick={() => navMes(1)}>Próximo →</button>
        {isAdmin && (
          <select className="form-select" style={{ width: 220 }} value={unidade} onChange={e => setUnidade(e.target.value as Unidade)}>
            <option value="">Selecione a unidade...</option>
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        )}
      </div>

      {!unidade ? (
        <div className="empty-state">Selecione uma unidade para visualizar o caixa.</div>
      ) : loading ? (
        <div className="text-muted">Carregando...</div>
      ) : (
        <div style={{ maxWidth: 480 }}>
          <div className="card">
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
              {unidade} · {getMesAnoLabel(mes, ano)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 14 }}>Saldo inicial</span>
                {editMode ? (
                  <input className="form-input" type="number" step="0.01" value={saldoEdit} onChange={e => setSaldoEdit(Number(e.target.value))} style={{ width: 140, textAlign: 'right' }} />
                ) : (
                  <span className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{formatMoeda(saldoInicial)}</span>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ fontSize: 14, color: 'var(--green)' }}>+ Parcelas recebidas no mês</span>
                <span className="mono text-green" style={{ fontWeight: 600 }}>{formatMoeda(recebido)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 14, color: 'var(--red)' }}>− Parcelas pagas no mês</span>
                <span className="mono text-red" style={{ fontWeight: 600 }}>{formatMoeda(pago)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>Saldo final</span>
                <span className="mono" style={{ fontSize: 20, fontWeight: 700, color: saldoFinal >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatMoeda(saldoFinal)}</span>
              </div>
            </div>
            <hr className="divider" />
            <div style={{ display: 'flex', gap: 8 }}>
              {!editMode ? (
                <button className="btn btn-secondary" onClick={() => setEditMode(true)}>Editar saldo inicial</button>
              ) : (
                <>
                  <button className="btn btn-secondary" onClick={() => { setEditMode(false); setSaldoEdit(saldoInicial) }}>Cancelar</button>
                  <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
