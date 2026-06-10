'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { getMesAnoLabel, carteirasParaCaixas, mesAtual, anoAtual } from '@/lib/utils'
import type { Produto, Unidade } from '@/types'
import { UNIDADES } from '@/types'

type EstMap = Record<string, number> // produto_id -> qtd_carteiras

export default function EstoqueInicialPage() {
  const { profile, unidadeAtiva } = useAuth()
  const [mes, setMes] = useState(mesAtual())
  const [ano, setAno] = useState(anoAtual())
  const [unidade, setUnidade] = useState<Unidade | ''>(unidadeAtiva ?? '')
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [estMap, setEstMap] = useState<EstMap>({})
  const [editMap, setEditMap] = useState<EstMap>({})
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const sb = createClient()
  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    if (unidadeAtiva) setUnidade(unidadeAtiva)
  }, [unidadeAtiva])

  useEffect(() => { loadData() }, [mes, ano, unidade])

  async function loadData() {
    setLoading(true)
    const { data: prods } = await sb.from('btx_produtos').select('*').eq('ativo', true).order('nome')
    setProdutos(prods ?? [])
    if (!unidade) { setLoading(false); return }
    const { data: est } = await sb.from('btx_estoque_inicial').select('*')
      .eq('unidade', unidade).eq('mes', mes).eq('ano', ano)
    const m: EstMap = {}
    ;(est ?? []).forEach((e: { produto_id: string; qtd_carteiras: number }) => { m[e.produto_id] = e.qtd_carteiras })
    setEstMap(m)
    setEditMap({ ...m })
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
    for (const p of produtos) {
      const qtd = editMap[p.id] ?? 0
      await sb.from('btx_estoque_inicial').upsert(
        { unidade, produto_id: p.id, mes, ano, qtd_carteiras: qtd, updated_at: new Date().toISOString() },
        { onConflict: 'unidade,produto_id,mes,ano' }
      )
    }
    setSaving(false); setEditMode(false); loadData()
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Estoque Inicial</h1><div className="page-subtitle">Saldo de abertura por produto e unidade</div></div>
        {!editMode ? (
          <button className="btn btn-primary" onClick={() => setEditMode(true)} disabled={!unidade}>Editar</button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => { setEditMode(false); setEditMap({...estMap}) }}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
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
        <div className="empty-state">Selecione uma unidade para visualizar o estoque inicial.</div>
      ) : loading ? (
        <div className="text-muted">Carregando...</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Produto</th><th>Carteiras/cx</th><th>Carteiras</th><th>Caixas equiv.</th></tr></thead>
            <tbody>
              {produtos.map(p => {
                const qtd = editMode ? (editMap[p.id] ?? 0) : (estMap[p.id] ?? 0)
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{p.nome}</td>
                    <td className="mono">{p.carteiras_por_caixa}</td>
                    <td>
                      {editMode ? (
                        <input className="form-input" type="number" min={0} style={{ width: 100 }}
                          value={editMap[p.id] ?? 0}
                          onChange={e => setEditMap(m => ({...m, [p.id]: Number(e.target.value)}))} />
                      ) : (
                        <span className="mono">{qtd}</span>
                      )}
                    </td>
                    <td className="mono">{carteirasParaCaixas(qtd, p.carteiras_por_caixa)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
