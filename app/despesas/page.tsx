'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { formatMoeda, formatData } from '@/lib/utils'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { Despesa } from '@/types'

export default function DespesasPage() {
  const { profile, unidadeAtiva } = useAuth()
  const isDiretoria = profile?.role === 'diretoria'
  const [rows, setRows] = useState<Despesa[]>([])
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const sb = createClient()

  useEffect(() => { load() }, [unidadeAtiva])

  async function load() {
    setLoading(true)
    const u = unidadeAtiva
    let q = sb.from('btx_despesas').select('*, categoria:btx_categorias_despesas(id,nome), fornecedor:btx_fornecedores(id,nome)').eq('ativo', true).order('data_despesa', { ascending: false })
    if (u) q = q.eq('unidade', u)
    const { data: d } = await q
    setRows(d ?? [])
    setLoading(false)
  }

  async function remove(id: string) {
    setSaving(true)
    await sb.from('btx_despesas').update({ ativo: false }).eq('id', id)
    await sb.from('btx_parcelas').update({ ativo: false }).eq('origem_id', id)
    setSaving(false); setConfirm(null); load()
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Despesas</h1><div className="page-subtitle">Contas a pagar sem mercadoria — consulta</div></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Fornecedor</th><th>NF</th><th>Valor</th><th>Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="empty-state">Carregando...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={7} className="empty-state">Nenhuma despesa lançada.</td></tr>
            : rows.map(r => (
              <tr key={r.id}>
                <td className="mono">{formatData(r.data_despesa)}</td>
                <td style={{ fontWeight: 500 }}>{r.descricao}</td>
                <td>{(r.categoria as unknown as { nome: string })?.nome ?? '—'}</td>
                <td>{(r.fornecedor as unknown as { nome: string })?.nome ?? '—'}</td>
                <td className="mono">{r.numero_nf ?? '—'}</td>
                <td className="mono">{formatMoeda(r.valor_total)}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  {!isDiretoria && <button className="btn btn-danger btn-sm" onClick={() => setConfirm(r.id)}>Excluir</button>}
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
