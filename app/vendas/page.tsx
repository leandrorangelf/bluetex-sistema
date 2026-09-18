'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { formatMoeda, formatData, itensCaixas } from '@/lib/utils'
import { UNIDADES, type Unidade, type Venda } from '@/types'
import ConfirmDialog from '@/components/ConfirmDialog'
import { isVhsysManaged } from '@/lib/vhsys/read-only'

export default function VendasPage() {
  const { profile, unidadeAtiva } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [unidade, setUnidade] = useState<Unidade | ''>((unidadeAtiva as Unidade) ?? '')

  useEffect(() => { if (!isAdmin && unidadeAtiva) setUnidade(unidadeAtiva as Unidade) }, [isAdmin, unidadeAtiva])

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Vendas</h1><div className="page-subtitle">Vendas sincronizadas do VHSYS</div></div>
      </div>

      {isAdmin && (
        <div className="form-group" style={{ maxWidth: 320 }}>
          <label className="form-label">Unidade</label>
          <select className="form-select" value={unidade} onChange={e => setUnidade(e.target.value as Unidade)}>
            <option value="">Selecione…</option>
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      )}

      <ListaVendas unidade={isAdmin ? (unidade || undefined) : undefined} />
    </div>
  )
}

function ListaVendas({ unidade }: { unidade?: string }) {
  const { profile, unidadeAtiva } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [rows, setRows] = useState<Venda[]>([])
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const sb = useMemo(() => createClient(), [])
  const filtro = unidade ?? unidadeAtiva ?? ''

  useEffect(() => {
    let cancel = false
    ;(async () => {
      setLoading(true)
      let q = sb.from('btx_vendas').select('*, cliente:btx_clientes(id,nome), itens:btx_vendas_itens(id,produto_id,qtd_carteiras,valor,produto:btx_produtos(id,nome,fator_conversao,unidade_base:btx_unidades_medida!unidade_base_id(nome),unidade_maior:btx_unidades_medida!unidade_maior_id(nome)))').eq('ativo', true).order('data_venda', { ascending: false })
      if (filtro) q = q.eq('unidade', filtro)
      const { data: d } = await q
      if (!cancel) { setRows((d ?? []) as Venda[]); setLoading(false) }
    })()
    return () => { cancel = true }
  }, [sb, filtro])

  async function remove(id: string) {
    if (isVhsysManaged(rows.find(r => r.id === id) ?? {})) return
    setSaving(true)
    await sb.from('btx_vendas').update({ ativo: false }).eq('id', id)
    await sb.from('btx_parcelas').update({ ativo: false }).eq('origem_id', id)
    setSaving(false); setConfirm(null)
    setRows(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div>
      <div className="table-wrap">
        <table className="table-vendas">
          <colgroup>
            <col style={{ width: 100 }} />
            <col style={{ width: 120 }} />
            <col />
            <col />
            <col style={{ width: 130 }} />
            <col style={{ width: 100 }} />
          </colgroup>
          <thead><tr><th>Data</th><th>NF</th><th>Cliente</th><th>Produtos (caixas)</th><th className="num">Total NF</th><th className="num">Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="empty-state">Carregando...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={6} className="empty-state">Nenhuma venda lançada.</td></tr>
            : rows.map(r => (
              <tr key={r.id}>
                <td className="mono">{formatData(r.data_venda)}</td>
                <td className="mono" style={{ fontWeight: 700 }}>
                  {r.numero_nf ?? '—'}
                  {isVhsysManaged(r) && <span className="badge badge-purple" style={{ display: 'block', width: 'fit-content', marginTop: 4 }}>VHSYS</span>}
                </td>
                <td>{(r.cliente as unknown as { nome: string })?.nome ?? '—'}</td>
                <td className="cell-wrap" style={{ fontSize: 12 }}>{itensCaixas(r.itens)}</td>
                <td className="mono num">{formatMoeda(r.valor_total)}</td>
                <td className="cell-actions">
                  {isVhsysManaged(r) ? <span className="text-muted">Gerenciado pelo VHSYS</span>
                  : isAdmin && <div className="row-actions"><button className="btn btn-danger btn-sm" onClick={() => setConfirm(r.id)}>Excluir</button></div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove(confirm)} loading={saving} />
    </div>
  )
}
