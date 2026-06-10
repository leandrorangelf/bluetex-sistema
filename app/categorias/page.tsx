'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { CategoriaDespesa, Unidade } from '@/types'
import { UNIDADES } from '@/types'

export default function CategoriasPage() {
  const { profile, unidadeAtiva } = useAuth()
  const [rows, setRows] = useState<CategoriaDespesa[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [formUnidade, setFormUnidade] = useState<Unidade | ''>('')
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const sb = createClient()
  const isAdmin = profile?.role === 'admin'

  useEffect(() => { load() }, [unidadeAtiva])

  async function load() {
    setLoading(true)
    let q = sb.from('btx_categorias_despesas').select('*').eq('ativo', true).order('nome')
    if (unidadeAtiva) q = q.eq('unidade', unidadeAtiva)
    const { data } = await q
    setRows(data ?? [])
    setLoading(false)
  }

  function openNew() { setNome(''); setFormUnidade(unidadeAtiva ?? ''); setEditId(null); setErr(''); setModal(true) }
  function openEdit(r: CategoriaDespesa) { setNome(r.nome); setFormUnidade(r.unidade); setEditId(r.id); setErr(''); setModal(true) }

  async function save() {
    if (!nome.trim()) return setErr('Nome é obrigatório.')
    const unidade = isAdmin ? formUnidade : unidadeAtiva
    if (!unidade) return setErr('Selecione a unidade.')
    setSaving(true)
    if (editId) await sb.from('btx_categorias_despesas').update({ nome, unidade }).eq('id', editId)
    else await sb.from('btx_categorias_despesas').insert({ nome, unidade })
    setSaving(false); setModal(false); load()
  }

  async function remove(id: string) {
    setSaving(true)
    await sb.from('btx_categorias_despesas').update({ ativo: false }).eq('id', id)
    setSaving(false); setConfirm(null); load()
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Categorias de Despesas</h1><div className="page-subtitle">Categorias para classificar despesas</div></div>
        <button className="btn btn-primary" onClick={openNew}>+ Nova categoria</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Categoria</th><th>Unidade</th><th>Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={3} className="empty-state">Carregando...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={3} className="empty-state">Nenhuma categoria cadastrada.</td></tr>
            : rows.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 500 }}>{r.nome}</td>
                <td><span className="badge badge-green">{r.unidade.replace('NEW BLUETEX ','')}</span></td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Editar</button>
                  <button className="btn btn-danger btn-sm" onClick={() => setConfirm(r.id)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar categoria' : 'Nova categoria'} size="sm"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </>}
      >
        {err && <div className="alert alert-red">{err}</div>}
        {isAdmin && (
          <div className="form-group">
            <label className="form-label">Unidade</label>
            <select className="form-select" value={formUnidade} onChange={e => setFormUnidade(e.target.value as Unidade)}>
              <option value="">Selecione...</option>
              {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Nome *</label>
          <input className="form-input" value={nome} onChange={e => setNome(e.target.value)} />
        </div>
      </Modal>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove(confirm)} loading={saving} />
    </div>
  )
}
