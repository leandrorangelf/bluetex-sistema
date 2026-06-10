'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { formatMoeda, formatData, carteirasParaCaixas, hoje } from '@/lib/utils'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import ParcelasEditor, { type ParcelaForm } from '@/components/ParcelasEditor'
import type { Venda, Produto, Cliente } from '@/types'

const EMPTY_FORM = { produto_id: '', cliente_id: '', data_venda: hoje(), numero_nf: '', qtd_carteiras: 0, valor_total: 0, observacoes: '' }

export default function VendasPage() {
  const { unidadeAtiva } = useAuth()
  const [rows, setRows] = useState<Venda[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [parcelas, setParcelas] = useState<ParcelaForm[]>([])
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const sb = createClient()

  useEffect(() => { load() }, [unidadeAtiva])

  async function load() {
    setLoading(true)
    const u = unidadeAtiva
    const [{ data: v }, { data: p }, { data: c }] = await Promise.all([
      (() => { let q = sb.from('btx_vendas').select('*, produto:btx_produtos(id,nome,carteiras_por_caixa), cliente:btx_clientes(id,nome)').eq('ativo', true).order('data_venda', { ascending: false }); if (u) q = q.eq('unidade', u); return q })(),
      sb.from('btx_produtos').select('*').eq('ativo', true).order('nome'),
      (() => { let q = sb.from('btx_clientes').select('*').eq('ativo', true).order('nome'); if (u) q = q.eq('unidade', u); return q })(),
    ])
    setRows(v ?? []); setProdutos(p ?? []); setClientes(c ?? [])
    setLoading(false)
  }

  function openNew() { setForm(EMPTY_FORM); setParcelas([]); setEditId(null); setErr(''); setModal(true) }
  async function openEdit(r: Venda) {
    setForm({ produto_id: r.produto_id, cliente_id: r.cliente_id ?? '', data_venda: r.data_venda, numero_nf: r.numero_nf ?? '', qtd_carteiras: r.qtd_carteiras, valor_total: r.valor_total, observacoes: r.observacoes ?? '' })
    const { data: parcs } = await sb.from('btx_parcelas').select('*').eq('origem_id', r.id).eq('ativo', true).order('numero_parcela')
    setParcelas((parcs ?? []).map((p: { numero_parcela: number; vencimento: string; valor: number; numero_boleto: string | null; observacoes: string | null }) => ({
      numero_parcela: p.numero_parcela, vencimento: p.vencimento, valor: p.valor,
      numero_boleto: p.numero_boleto ?? '', observacoes: p.observacoes ?? ''
    })))
    setEditId(r.id); setErr(''); setModal(true)
  }

  async function save() {
    if (!form.produto_id) return setErr('Selecione o produto.')
    const unidade = unidadeAtiva
    if (!unidade) return setErr('Sem unidade ativa.')
    setSaving(true)
    const payload = { unidade, produto_id: form.produto_id, cliente_id: form.cliente_id || null, data_venda: form.data_venda, numero_nf: form.numero_nf || null, qtd_carteiras: form.qtd_carteiras, valor_total: form.valor_total, observacoes: form.observacoes || null }
    let id = editId
    if (editId) {
      await sb.from('btx_vendas').update(payload).eq('id', editId)
      await sb.from('btx_parcelas').update({ ativo: false }).eq('origem_id', editId)
    } else {
      const { data } = await sb.from('btx_vendas').insert(payload).select('id').single()
      id = data?.id
    }
    if (id && parcelas.length > 0) {
      await sb.from('btx_parcelas').insert(parcelas.map(p => ({
        unidade, tipo: 'receber', origem: 'venda', origem_id: id,
        numero_parcela: p.numero_parcela, vencimento: p.vencimento,
        valor: p.valor, numero_boleto: p.numero_boleto || null, observacoes: p.observacoes || null
      })))
    }
    setSaving(false); setModal(false); load()
  }

  async function remove(id: string) {
    setSaving(true)
    await sb.from('btx_vendas').update({ ativo: false }).eq('id', id)
    await sb.from('btx_parcelas').update({ ativo: false }).eq('origem_id', id)
    setSaving(false); setConfirm(null); load()
  }

  const prodMap = Object.fromEntries(produtos.map(p => [p.id, p]))

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Vendas / NFs</h1><div className="page-subtitle">Saídas de estoque por nota fiscal</div></div>
        <button className="btn btn-primary" onClick={openNew}>+ Nova venda</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Produto</th><th>Cliente</th><th>NF</th><th>Carteiras</th><th>Caixas</th><th>Valor</th><th>Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="empty-state">Carregando...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={8} className="empty-state">Nenhuma venda lançada.</td></tr>
            : rows.map(r => {
              const prod = (r.produto as unknown as Produto) ?? prodMap[r.produto_id]
              return (
                <tr key={r.id}>
                  <td className="mono">{formatData(r.data_venda)}</td>
                  <td style={{ fontWeight: 500 }}>{prod?.nome ?? '—'}</td>
                  <td>{(r.cliente as unknown as { nome: string })?.nome ?? '—'}</td>
                  <td className="mono">{r.numero_nf ?? '—'}</td>
                  <td className="mono">{r.qtd_carteiras}</td>
                  <td className="mono">{prod ? carteirasParaCaixas(r.qtd_carteiras, prod.carteiras_por_caixa) : '—'}</td>
                  <td className="mono">{formatMoeda(r.valor_total)}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Editar</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirm(r.id)}>Excluir</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar venda' : 'Nova venda'} size="lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </>}
      >
        {err && <div className="alert alert-red">{err}</div>}
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Produto *</label>
            <select className="form-select" value={form.produto_id} onChange={e => setForm(f => ({...f, produto_id: e.target.value}))}>
              <option value="">Selecione...</option>
              {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Cliente</label>
            <select className="form-select" value={form.cliente_id} onChange={e => setForm(f => ({...f, cliente_id: e.target.value}))}>
              <option value="">Nenhum</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Data</label>
            <input className="form-input" type="date" value={form.data_venda} onChange={e => setForm(f => ({...f, data_venda: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Nº NF / Documento</label>
            <input className="form-input" value={form.numero_nf} onChange={e => setForm(f => ({...f, numero_nf: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Qtd Carteiras</label>
            <input className="form-input" type="number" min={0} value={form.qtd_carteiras} onChange={e => setForm(f => ({...f, qtd_carteiras: Number(e.target.value)}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Valor Total (R$)</label>
            <input className="form-input" type="number" step="0.01" min={0} value={form.valor_total} onChange={e => setForm(f => ({...f, valor_total: Number(e.target.value)}))} />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Observações</label>
            <textarea className="form-input" rows={2} value={form.observacoes} onChange={e => setForm(f => ({...f, observacoes: e.target.value}))} />
          </div>
        </div>
        <hr className="divider" />
        <ParcelasEditor parcelas={parcelas} onChange={setParcelas} tipo="receber" />
      </Modal>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove(confirm)} loading={saving} />
    </div>
  )
}
