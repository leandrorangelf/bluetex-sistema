'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { formatMoeda, formatData } from '@/lib/utils'
import { UNIDADES, type Unidade, type Venda } from '@/types'
import FormMovimento from '@/components/lancar/FormMovimento'
import ConfirmDialog from '@/components/ConfirmDialog'

type Aba = 'registrar' | 'lista'

export default function VendasPage() {
  const { profile, unidadeAtiva } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const isDiretoria = profile?.role === 'diretoria'
  const [aba, setAba] = useState<Aba>(isDiretoria ? 'lista' : 'registrar')
  const [unidade, setUnidade] = useState<Unidade | ''>((unidadeAtiva as Unidade) ?? '')
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  useEffect(() => { if (!isAdmin && unidadeAtiva) setUnidade(unidadeAtiva as Unidade) }, [isAdmin, unidadeAtiva])

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Vendas</h1><div className="page-subtitle">Registro de saídas e contas a receber</div></div>
      </div>

      {isAdmin && (
        <div className="form-group" style={{ maxWidth: 320 }}>
          <label className="form-label">Unidade</label>
          <select className="form-select" value={unidade} onChange={e => { setUnidade(e.target.value as Unidade); setMsg(null) }}>
            <option value="">Selecione…</option>
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      )}

      <div className="tabs">
        {!isDiretoria && <button className={`tab${aba === 'registrar' ? ' active' : ''}`} onClick={() => { setAba('registrar'); setMsg(null) }}>Registrar</button>}
        <button className={`tab${aba === 'lista' ? ' active' : ''}`} onClick={() => { setAba('lista'); setMsg(null) }}>Lista</button>
      </div>

      {aba === 'registrar' && !isDiretoria && (
        !unidade ? <div className="empty-state">Selecione a unidade.</div> : (
          <>
            {msg && <div className={`alert ${msg.tipo === 'ok' ? 'alert-green' : 'alert-red'}`} style={{ marginBottom: 16 }}>{msg.texto}</div>}
            <div className="card" style={{ maxWidth: 720 }}>
              <FormMovimento tipo="venda" unidade={unidade} onResult={setMsg} />
            </div>
          </>
        )
      )}

      {aba === 'lista' && <ListaVendas unidade={isAdmin ? (unidade || undefined) : undefined} />}
    </div>
  )
}

function ListaVendas({ unidade }: { unidade?: string }) {
  const { profile, unidadeAtiva } = useAuth()
  const isDiretoria = profile?.role === 'diretoria'
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
    setSaving(true)
    await sb.from('btx_vendas').update({ ativo: false }).eq('id', id)
    await sb.from('btx_parcelas').update({ ativo: false }).eq('origem_id', id)
    setSaving(false); setConfirm(null)
    setRows(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>NF</th><th>Cliente</th><th>Produtos</th><th>Total NF</th><th>Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="empty-state">Carregando...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={6} className="empty-state">Nenhuma venda lançada.</td></tr>
            : rows.map(r => (
              <tr key={r.id}>
                <td className="mono">{formatData(r.data_venda)}</td>
                <td className="mono">{r.numero_nf ?? '—'}</td>
                <td>{(r.cliente as unknown as { nome: string })?.nome ?? '—'}</td>
                <td style={{ fontSize: 11 }}>{((r.itens as unknown as { produto: { nome: string; unidade_base: { nome: string } }; qtd_carteiras: number }[]) ?? []).map((it, i) => <div key={i}>{it.produto?.nome} — {it.qtd_carteiras} {it.produto?.unidade_base?.nome ?? ''}</div>)}</td>
                <td className="mono">{formatMoeda(r.valor_total)}</td>
                <td className="cell-actions">
                  {!isDiretoria && <div className="row-actions"><button className="btn btn-danger btn-sm" onClick={() => setConfirm(r.id)}>Excluir</button></div>}
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
