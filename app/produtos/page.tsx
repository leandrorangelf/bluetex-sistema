'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { Produto } from '@/types'

const EMPTY = { nome: '', carteiras_por_caixa: 480 }

export default function ProdutosPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const sb = createClient()
  const isAdmin = profile?.role === 'admin'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await sb.from('btx_produtos').select('*').eq('ativo', true).order('nome')
    setRows(data ?? [])
    setLoading(false)
  }

  function openNew() { setForm(EMPTY); setEditId(null); setErr(''); setModal(true) }
  function openEdit(r: Produto) { setForm({ nome: r.nome, carteiras_por_caixa: r.carteiras_por_caixa }); setEditId(r.id); setErr(''); setModal(true) }

  async function save() {
    if (!form.nome.trim()) return setErr('Nome é obrigatório.')
    setSaving(true)
    if (editId) {
      await sb.from('btx_produtos').update({ nome: form.nome, carteiras_por_caixa: form.carteiras_por_caixa }).eq('id', editId)
    } else {
      await sb.from('btx_produtos').insert({ nome: form.nome, carteiras_por_caixa: form.carteiras_por_caixa })
    }
    setSaving(false); setModal(false); load()
  }

  async function remove(id: string) {
    setSaving(true)
    await sb.from('btx_produtos').update({ ativo: false }).eq('id', id)
    setSaving(false); setConfirm(null); load()
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Produtos</h1><div className="page-subtitle">Catálogo de produtos da distribuidora</div></div>
        {isAdmin && <button className="btn btn-primary" onClick={openNew}>+ Novo produto</button>}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Produto</th><th>Carteiras/cx</th>{isAdmin && <th>Ações</th>}</tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="empty-state">Carregando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={3} className="empty-state">Nenhum produto cadastrado.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 500 }}>{r.nome}</td>
                <td className="mono">{r.carteiras_por_caixa}</td>
                {isAdmin && (
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Editar</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirm(r.id)}>Excluir</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar produto' : 'Novo produto'} size="sm"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </>}
      >
        {err && <div className="alert alert-red">{err}</div>}
        <div className="form-group">
          <label className="form-label">Nome</label>
          <input className="form-input" value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value}))} />
        </div>
        <div className="form-group">
          <label className="form-label">Carteiras por caixa</label>
          <input className="form-input" type="number" min={1} value={form.carteiras_por_caixa} onChange={e => setForm(f => ({...f, carteiras_por_caixa: Number(e.target.value)}))} />
        </div>
      </Modal>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove(confirm)} loading={saving} />
    </div>
  )
}
