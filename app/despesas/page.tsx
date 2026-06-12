'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { formatMoeda, formatData, hoje } from '@/lib/utils'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import ParcelasEditor, { type ParcelaForm } from '@/components/ParcelasEditor'
import type { Despesa, CategoriaDespesa, Fornecedor } from '@/types'

const EMPTY = { categoria_id: '', fornecedor_id: '', data_despesa: hoje(), numero_nf: '', descricao: '', valor_total: 0, observacoes: '' }

export default function DespesasPage() {
  const { unidadeAtiva } = useAuth()
  const [rows, setRows] = useState<Despesa[]>([])
  const [categorias, setCategorias] = useState<CategoriaDespesa[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [parcelas, setParcelas] = useState<ParcelaForm[]>([])
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const sb = createClient()

  useEffect(() => { load() }, [unidadeAtiva])

  async function load() {
    setLoading(true)
    const u = unidadeAtiva
    const [{ data: d }, { data: c }, { data: f }] = await Promise.all([
      (() => { let q = sb.from('btx_despesas').select('*, categoria:btx_categorias_despesas(id,nome), fornecedor:btx_fornecedores(id,nome)').eq('ativo', true).order('data_despesa', { ascending: false }); if (u) q = q.eq('unidade', u); return q })(),
      (() => { let q = sb.from('btx_categorias_despesas').select('*').eq('ativo', true).order('nome'); if (u) q = q.eq('unidade', u); return q })(),
      (() => { let q = sb.from('btx_fornecedores').select('*').eq('ativo', true).order('nome'); if (u) q = q.eq('unidade', u); return q })(),
    ])
    setRows(d ?? []); setCategorias(c ?? []); setFornecedores(f ?? [])
    setLoading(false)
  }

  function openNew() { setForm(EMPTY); setParcelas([]); setEditId(null); setErr(''); setModal(true) }
  async function openEdit(r: Despesa) {
    setForm({ categoria_id: r.categoria_id ?? '', fornecedor_id: r.fornecedor_id ?? '', data_despesa: r.data_despesa, numero_nf: r.numero_nf ?? '', descricao: r.descricao, valor_total: r.valor_total, observacoes: r.observacoes ?? '' })
    const { data: parcs } = await sb.from('btx_parcelas').select('*').eq('origem_id', r.id).eq('ativo', true).order('numero_parcela')
    setParcelas((parcs ?? []).map((p: { numero_parcela: number; vencimento: string; valor: number; numero_boleto: string | null; observacoes: string | null }) => ({
      numero_parcela: p.numero_parcela, vencimento: p.vencimento, valor: p.valor,
      numero_boleto: p.numero_boleto ?? '', observacoes: p.observacoes ?? ''
    })))
    setEditId(r.id); setErr(''); setModal(true)
  }

  async function save() {
    if (!form.descricao.trim()) return setErr('Descrição é obrigatória.')
    if (parcelas.length === 0) return setErr('Adicione pelo menos uma parcela para registrar o vencimento.')
    const unidade = unidadeAtiva
    if (!unidade) return setErr('Sem unidade ativa.')
    setSaving(true)
    const payload = { unidade, categoria_id: form.categoria_id || null, fornecedor_id: form.fornecedor_id || null, data_despesa: form.data_despesa, numero_nf: form.numero_nf || null, descricao: form.descricao, valor_total: form.valor_total, observacoes: form.observacoes || null }
    let id = editId
    if (editId) {
      await sb.from('btx_despesas').update(payload).eq('id', editId)
      await sb.from('btx_parcelas').update({ ativo: false }).eq('origem_id', editId)
    } else {
      const { data } = await sb.from('btx_despesas').insert(payload).select('id').single()
      id = data?.id
    }
    if (id && parcelas.length > 0) {
      await sb.from('btx_parcelas').insert(parcelas.map(p => ({
        unidade, tipo: 'pagar', origem: 'despesa', origem_id: id,
        numero_parcela: p.numero_parcela, vencimento: p.vencimento,
        valor: p.valor, numero_boleto: p.numero_boleto || null, observacoes: p.observacoes || null
      })))
    }
    setSaving(false); setModal(false); load()
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
        <div><h1 className="page-title">Despesas</h1><div className="page-subtitle">Lançamento de despesas operacionais</div></div>
        <button className="btn btn-primary" onClick={openNew}>+ Nova despesa</button>
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
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Editar</button>
                  <button className="btn btn-danger btn-sm" onClick={() => setConfirm(r.id)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar despesa' : 'Nova despesa'} size="lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </>}
      >
        {err && <div className="alert alert-red">{err}</div>}
        <div className="grid-2">
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Descrição *</label>
            <input className="form-input" value={form.descricao} onChange={e => setForm(f => ({...f, descricao: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Categoria</label>
            <select className="form-select" value={form.categoria_id} onChange={e => setForm(f => ({...f, categoria_id: e.target.value}))}>
              <option value="">Nenhuma</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Fornecedor</label>
            <select className="form-select" value={form.fornecedor_id} onChange={e => setForm(f => ({...f, fornecedor_id: e.target.value}))}>
              <option value="">Nenhum</option>
              {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Data</label>
            <input className="form-input" type="date" value={form.data_despesa} onChange={e => setForm(f => ({...f, data_despesa: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Nº NF / Documento</label>
            <input className="form-input" value={form.numero_nf} onChange={e => setForm(f => ({...f, numero_nf: e.target.value}))} />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Valor Total (R$)</label>
            <input className="form-input" type="number" step="0.01" min={0} value={form.valor_total} onChange={e => setForm(f => ({...f, valor_total: Number(e.target.value)}))} />
          </div>
        </div>
        <hr className="divider" />
        <ParcelasEditor parcelas={parcelas} onChange={setParcelas} tipo="pagar" />
      </Modal>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove(confirm)} loading={saving} />
    </div>
  )
}
