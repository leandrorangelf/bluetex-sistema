'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { Cliente, Unidade } from '@/types'
import { UNIDADES } from '@/types'

const EMPTY = { nome: '', cnpj: '', telefone: '', email: '', observacoes: '' }

export default function ClientesPage() {
  const { profile, unidadeAtiva } = useAuth()
  const [rows, setRows] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [formUnidade, setFormUnidade] = useState<Unidade | ''>('')
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const sb = createClient()
  const isAdmin = profile?.role === 'admin'

  useEffect(() => { load() }, [unidadeAtiva])

  async function load() {
    setLoading(true)
    let q = sb.from('btx_clientes').select('*').eq('ativo', true).order('nome')
    if (unidadeAtiva) q = q.eq('unidade', unidadeAtiva)
    const { data } = await q
    setRows(data ?? [])
    setLoading(false)
  }

  function openNew() { setForm(EMPTY); setFormUnidade(unidadeAtiva ?? ''); setEditId(null); setErr(''); setModal(true) }
  function openEdit(r: Cliente) {
    setForm({ nome: r.nome, cnpj: r.cnpj ?? '', telefone: r.telefone ?? '', email: r.email ?? '', observacoes: r.observacoes ?? '' })
    setFormUnidade(r.unidade); setEditId(r.id); setErr(''); setModal(true)
  }

  async function save() {
    if (!form.nome.trim()) return setErr('Nome é obrigatório.')
    const unidade = isAdmin ? formUnidade : unidadeAtiva
    if (!unidade) return setErr('Selecione a unidade.')
    setSaving(true)
    const payload = { nome: form.nome, cnpj: form.cnpj || null, telefone: form.telefone || null, email: form.email || null, observacoes: form.observacoes || null, unidade }
    if (editId) await sb.from('btx_clientes').update(payload).eq('id', editId)
    else await sb.from('btx_clientes').insert(payload)
    setSaving(false); setModal(false); load()
  }

  async function remove(id: string) {
    setSaving(true)
    await sb.from('btx_clientes').update({ ativo: false }).eq('id', id)
    setSaving(false); setConfirm(null); load()
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Clientes</h1><div className="page-subtitle">Cadastro de clientes por unidade</div></div>
        <button className="btn btn-primary" onClick={openNew}>+ Novo cliente</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>Unidade</th><th>CNPJ</th><th>Telefone</th><th>Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="empty-state">Carregando...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={5} className="empty-state">Nenhum cliente cadastrado.</td></tr>
            : rows.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 500 }}>{r.nome}</td>
                <td><span className="badge badge-green">{r.unidade.replace('NEW BLUETEX ','')}</span></td>
                <td className="mono">{r.cnpj ?? '—'}</td>
                <td>{r.telefone ?? '—'}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Editar</button>
                  <button className="btn btn-danger btn-sm" onClick={() => setConfirm(r.id)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar cliente' : 'Novo cliente'}
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
        <div className="grid-2">
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Nome *</label>
            <input className="form-input" value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">CNPJ</label>
            <input className="form-input" value={form.cnpj} onChange={e => setForm(f => ({...f, cnpj: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Telefone</label>
            <input className="form-input" value={form.telefone} onChange={e => setForm(f => ({...f, telefone: e.target.value}))} />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">E-mail</label>
            <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove(confirm)} loading={saving} />
    </div>
  )
}
