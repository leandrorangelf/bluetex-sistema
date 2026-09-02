'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { formatMoeda, formatData } from '@/lib/utils'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { Compra } from '@/types'

export default function ComprasPage() {
  const { profile, unidadeAtiva } = useAuth()
  const isDiretoria = profile?.role === 'diretoria'
  const [rows, setRows] = useState<Compra[]>([])
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const sb = createClient()

  useEffect(() => { load() }, [unidadeAtiva])

  async function load() {
    setLoading(true)
    const u = unidadeAtiva
    let q = sb.from('btx_compras').select('*, fornecedor:btx_fornecedores(id,nome), itens:btx_compras_itens(id,produto_id,qtd_carteiras,valor,produto:btx_produtos(id,nome,fator_conversao,unidade_base:btx_unidades_medida!unidade_base_id(nome),unidade_maior:btx_unidades_medida!unidade_maior_id(nome)))').eq('ativo', true).order('data_compra', { ascending: false })
    if (u) q = q.eq('unidade', u)
    const { data: d } = await q
    setRows(d ?? [])
    setLoading(false)
  }

  async function remove(id: string) {
    setSaving(true)
    await sb.from('btx_compras').update({ ativo: false }).eq('id', id)
    await sb.from('btx_parcelas').update({ ativo: false }).eq('origem_id', id)
    setSaving(false); setConfirm(null); load()
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Entradas</h1><div className="page-subtitle">O que entrou — consulta</div></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>NF</th><th>Fornecedor</th><th>Produtos</th><th>ST</th><th>Total NF</th><th>Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="empty-state">Carregando...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={7} className="empty-state">Nenhuma entrada lançada.</td></tr>
            : rows.map(r => (
              <tr key={r.id}>
                <td className="mono">{formatData(r.data_compra)}</td>
                <td className="mono">{r.numero_nf ?? '—'}</td>
                <td>{(r.fornecedor as unknown as { nome: string })?.nome ?? '—'}</td>
                <td style={{ fontSize: 11 }}>{((r.itens as unknown as { produto: { nome: string; unidade_base: { nome: string } }; qtd_carteiras: number }[]) ?? []).map((it, i) => <div key={i}>{it.produto?.nome} — {it.qtd_carteiras} {it.produto?.unidade_base?.nome ?? ''}</div>)}</td>
                <td className="mono">{formatMoeda((r as unknown as { valor_st?: number }).valor_st ?? 0)}</td>
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
