'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { formatMoeda, formatData, hoje } from '@/lib/utils'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import ParcelasEditor, { type ParcelaForm } from '@/components/ParcelasEditor'
import type { Compra, Fornecedor, Produto } from '@/types'

interface ItemForm { produto_id: string; qtd_carteiras: number; valor: number }
const EMPTY_ITEM: ItemForm = { produto_id: '', qtd_carteiras: 0, valor: 0 }
const EMPTY = { fornecedor_id: '', data_compra: hoje(), numero_nf: '', valor_st: 0, observacoes: '' }

export default function ComprasPage() {
  const { unidadeAtiva } = useAuth()
  const [rows, setRows] = useState<Compra[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [itens, setItens] = useState<ItemForm[]>([{ ...EMPTY_ITEM }])
  const [parcelas, setParcelas] = useState<ParcelaForm[]>([])
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const sb = createClient()

  useEffect(() => { load() }, [unidadeAtiva])

  async function load() {
    setLoading(true)
    const u = unidadeAtiva
    const [{ data: d }, { data: f }, { data: p }] = await Promise.all([
      (() => { let q = sb.from('btx_compras').select('*, fornecedor:btx_fornecedores(id,nome), itens:btx_compras_itens(id,produto_id,qtd_carteiras,valor,produto:btx_produtos(id,nome))').eq('ativo', true).order('data_compra', { ascending: false }); if (u) q = q.eq('unidade', u); return q })(),
      (() => { let q = sb.from('btx_fornecedores').select('*').eq('ativo', true).order('nome'); if (u) q = q.eq('unidade', u); return q })(),
      sb.from('btx_produtos').select('*').eq('ativo', true).order('nome'),
    ])
    setRows(d ?? []); setFornecedores(f ?? []); setProdutos(p ?? [])
    setLoading(false)
  }

  const totalProdutos = itens.reduce((s, i) => s + Number(i.valor), 0)
  const totalNF = totalProdutos + Number(form.valor_st)

  function addItem() { setItens(prev => [...prev, { ...EMPTY_ITEM }]) }
  function removeItem(idx: number) { if (itens.length > 1) setItens(prev => prev.filter((_, i) => i !== idx)) }
  function updateItem(idx: number, field: keyof ItemForm, value: string | number) {
    setItens(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  function openNew() { setForm(EMPTY); setItens([{ ...EMPTY_ITEM }]); setParcelas([]); setEditId(null); setErr(''); setModal(true) }

  async function openEdit(r: Compra) {
    setForm({ fornecedor_id: r.fornecedor_id ?? '', data_compra: r.data_compra, numero_nf: r.numero_nf ?? '', valor_st: (r as unknown as { valor_st?: number }).valor_st ?? 0, observacoes: r.observacoes ?? '' })
    const { data: its } = await sb.from('btx_compras_itens').select('*').eq('compra_id', r.id)
    setItens(its && its.length > 0 ? its.map((i: { produto_id: string; qtd_carteiras: number; valor: number }) => ({ produto_id: i.produto_id, qtd_carteiras: i.qtd_carteiras, valor: i.valor })) : [{ ...EMPTY_ITEM }])
    const { data: parcs } = await sb.from('btx_parcelas').select('*').eq('origem_id', r.id).eq('ativo', true).order('numero_parcela')
    setParcelas((parcs ?? []).map((p: { numero_parcela: number; vencimento: string; valor: number; numero_boleto: string | null; observacoes: string | null }) => ({ numero_parcela: p.numero_parcela, vencimento: p.vencimento, valor: p.valor, numero_boleto: p.numero_boleto ?? '', observacoes: p.observacoes ?? '' })))
    setEditId(r.id); setErr(''); setModal(true)
  }

  async function save() {
    if (!itens[0].produto_id) return setErr('Adicione pelo menos um produto.')
    const unidade = unidadeAtiva
    if (!unidade) return setErr('Sem unidade ativa.')
    setSaving(true)
    const payload = { unidade, fornecedor_id: form.fornecedor_id || null, data_compra: form.data_compra, numero_nf: form.numero_nf || null, valor_st: Number(form.valor_st), valor_total: totalNF, observacoes: form.observacoes || null }
    let id = editId
    if (editId) {
      await sb.from('btx_compras').update(payload).eq('id', editId)
      await sb.from('btx_compras_itens').delete().eq('compra_id', editId)
      await sb.from('btx_parcelas').update({ ativo: false }).eq('origem_id', editId)
    } else {
      const { data } = await sb.from('btx_compras').insert(payload).select('id').single()
      id = data?.id
    }
    if (id) {
      await sb.from('btx_compras_itens').insert(itens.filter(i => i.produto_id).map(i => ({ compra_id: id, produto_id: i.produto_id, qtd_carteiras: i.qtd_carteiras, valor: i.valor })))
      if (parcelas.length > 0) await sb.from('btx_parcelas').insert(parcelas.map(p => ({ unidade, tipo: 'pagar', origem: 'compra', origem_id: id, numero_parcela: p.numero_parcela, vencimento: p.vencimento, valor: p.valor, numero_boleto: p.numero_boleto || null, observacoes: p.observacoes || null })))
    }
    setSaving(false); setModal(false); load()
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
        <div><h1 className="page-title">Compras</h1><div className="page-subtitle">Entradas de estoque por NF</div></div>
        <button className="btn btn-primary" onClick={openNew}>+ Nova compra</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>NF</th><th>Fornecedor</th><th>Produtos</th><th>ST</th><th>Total NF</th><th>Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="empty-state">Carregando...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={7} className="empty-state">Nenhuma compra lançada.</td></tr>
            : rows.map(r => (
              <tr key={r.id}>
                <td className="mono">{formatData(r.data_compra)}</td>
                <td className="mono">{r.numero_nf ?? '—'}</td>
                <td>{(r.fornecedor as unknown as { nome: string })?.nome ?? '—'}</td>
                <td style={{ fontSize: 11 }}>{((r.itens as unknown as { produto: { nome: string }; qtd_carteiras: number }[]) ?? []).map((it, i) => <div key={i}>{it.produto?.nome} — {it.qtd_carteiras} cart.</div>)}</td>
                <td className="mono">{formatMoeda((r as unknown as { valor_st?: number }).valor_st ?? 0)}</td>
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

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar compra' : 'Nova compra'} size="lg"
        footer={<><button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button></>}>
        {err && <div className="alert alert-red">{err}</div>}
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Fornecedor</label>
            <select className="form-select" value={form.fornecedor_id} onChange={e => setForm(f => ({...f, fornecedor_id: e.target.value}))}>
              <option value="">Nenhum</option>
              {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Data</label>
            <input className="form-input" type="date" value={form.data_compra} onChange={e => setForm(f => ({...f, data_compra: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Nº NF</label>
            <input className="form-input" value={form.numero_nf} onChange={e => setForm(f => ({...f, numero_nf: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Valor ST (R$)</label>
            <input className="form-input" type="number" step="0.01" min={0} value={form.valor_st || ''} placeholder="0,00" onChange={e => setForm(f => ({...f, valor_st: parseFloat(e.target.value) || 0}))} />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Observações</label>
            <input className="form-input" value={form.observacoes} onChange={e => setForm(f => ({...f, observacoes: e.target.value}))} />
          </div>
        </div>

        <hr className="divider" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Produtos da NF</div>
          <button className="btn btn-secondary btn-sm" onClick={addItem}>+ Adicionar produto</button>
        </div>
        {itens.map((it, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
            <div className="form-group" style={{ margin: 0 }}>
              {idx === 0 && <label className="form-label">Produto</label>}
              <select className="form-select" value={it.produto_id} onChange={e => updateItem(idx, 'produto_id', e.target.value)}>
                <option value="">Selecione...</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              {idx === 0 && <label className="form-label">Carteiras</label>}
              <input className="form-input" type="number" min={0} value={it.qtd_carteiras || ''} placeholder="0" onChange={e => updateItem(idx, 'qtd_carteiras', parseInt(e.target.value) || 0)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              {idx === 0 && <label className="form-label">Valor (R$)</label>}
              <input className="form-input" type="number" step="0.01" min={0} value={it.valor || ''} placeholder="0,00" onChange={e => updateItem(idx, 'valor', parseFloat(e.target.value) || 0)} />
            </div>
            <button className="btn btn-danger btn-sm" style={{ marginBottom: 0 }} onClick={() => removeItem(idx)} disabled={itens.length === 1}>✕</button>
          </div>
        ))}
        <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Produtos: {formatMoeda(totalProdutos)} + ST: {formatMoeda(Number(form.valor_st))}
        </div>
        <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginTop: 4 }}>
          Total NF: {formatMoeda(totalNF)}
        </div>
        <hr className="divider" />
        <ParcelasEditor parcelas={parcelas} onChange={setParcelas} tipo="pagar" />
      </Modal>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove(confirm)} loading={saving} />
    </div>
  )
}
