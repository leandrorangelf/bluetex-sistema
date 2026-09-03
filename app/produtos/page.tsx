'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { Produto, UnidadeMedida } from '@/types'
import { isVhsysManaged } from '@/lib/vhsys/read-only'

const EMPTY = { nome: '', unidade_base_id: '', unidade_maior_id: '', fator_conversao: 480 }

export default function ProdutosPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Produto[]>([])
  const [unidades, setUnidades] = useState<UnidadeMedida[]>([])
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
    const [{ data: p }, { data: u }] = await Promise.all([
      sb.from('btx_produtos').select('*, unidade_base:btx_unidades_medida!unidade_base_id(id,nome), unidade_maior:btx_unidades_medida!unidade_maior_id(id,nome)').eq('ativo', true).order('nome'),
      sb.from('btx_unidades_medida').select('*').eq('ativo', true).order('nome'),
    ])
    setRows(p ?? [])
    setUnidades(u ?? [])
    setLoading(false)
  }

  function openNew() { setForm(EMPTY); setEditId(null); setErr(''); setModal(true) }
  function openEdit(r: Produto) {
    if (isVhsysManaged(r)) return
    setForm({ nome: r.nome, unidade_base_id: r.unidade_base_id, unidade_maior_id: r.unidade_maior_id, fator_conversao: r.fator_conversao })
    setEditId(r.id); setErr(''); setModal(true)
  }

  async function save() {
    if (editId && isVhsysManaged(rows.find(r => r.id === editId) ?? {})) return
    if (!form.nome.trim()) return setErr('Nome é obrigatório.')
    if (!form.unidade_base_id || !form.unidade_maior_id) return setErr('Escolha as duas unidades.')
    setSaving(true)
    const payload = { nome: form.nome, unidade_base_id: form.unidade_base_id, unidade_maior_id: form.unidade_maior_id, fator_conversao: form.fator_conversao }
    if (editId) {
      await sb.from('btx_produtos').update(payload).eq('id', editId)
    } else {
      await sb.from('btx_produtos').insert(payload)
    }
    setSaving(false); setModal(false); load()
  }

  async function remove(id: string) {
    if (isVhsysManaged(rows.find(r => r.id === id) ?? {})) return
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
          <thead><tr><th>Produto</th><th>Unid. base</th><th>Unid. maior</th><th>Fator</th>{isAdmin && <th>Ações</th>}</tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="empty-state">Carregando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="empty-state">Nenhum produto cadastrado.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 500 }}>{r.nome} {isVhsysManaged(r) && <span className="badge badge-purple">VHSYS</span>}</td>
                <td>{r.unidade_base?.nome}</td>
                <td>{r.unidade_maior?.nome}</td>
                <td className="mono">{r.fator_conversao}</td>
                {isAdmin && (
                  <td style={{ display: 'flex', gap: 6 }}>
                    {isVhsysManaged(r) ? <span className="text-muted">Gerenciado pelo VHSYS</span> : <>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Editar</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setConfirm(r.id)}>Excluir</button>
                    </>}
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
          <label className="form-label">Unidade base</label>
          <select className="form-select" value={form.unidade_base_id} onChange={e => setForm(f => ({...f, unidade_base_id: e.target.value}))}>
            <option value="">Selecione...</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Unidade maior</label>
          <select className="form-select" value={form.unidade_maior_id} onChange={e => setForm(f => ({...f, unidade_maior_id: e.target.value}))}>
            <option value="">Selecione...</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Fator de conversão (quantas unid. base numa unid. maior)</label>
          <input className="form-input" type="number" min={1} value={form.fator_conversao} onChange={e => setForm(f => ({...f, fator_conversao: Number(e.target.value)}))} />
        </div>
      </Modal>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove(confirm)} loading={saving} />
    </div>
  )
}
