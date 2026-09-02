'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { formatMoeda, hoje } from '@/lib/utils'
import ParcelasEditor, { type ParcelaForm } from '@/components/ParcelasEditor'
import type { Produto } from '@/types'

interface Props {
  tipo: 'compra' | 'venda'
  unidade: string
  onResult: (m: { tipo: 'ok' | 'erro'; texto: string }) => void
}

interface ItemForm { produto_id: string; qtdInput: number; unidade: 'base' | 'maior'; valor: number }
type Parceiro = { id: string; nome: string }

const EMPTY_ITEM: ItemForm = { produto_id: '', qtdInput: 0, unidade: 'base', valor: 0 }
const EMPTY = { parceiro_id: '', data: hoje(), numero_nf: '', valor_st: 0, observacoes: '' }

function qtdParaBase(item: ItemForm, produtos: Produto[]): number {
  const p = produtos.find(pr => pr.id === item.produto_id)
  const fator = p?.fator_conversao ?? 1
  return item.unidade === 'maior' ? Math.round(item.qtdInput * fator) : item.qtdInput
}

export default function FormMovimento({ tipo, unidade, onResult }: Props) {
  const sb = createClient()
  const isCompra = tipo === 'compra'
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [parceiros, setParceiros] = useState<Parceiro[]>([])
  const [form, setForm] = useState(EMPTY)
  const [itens, setItens] = useState<ItemForm[]>([{ ...EMPTY_ITEM }])
  const [parcelas, setParcelas] = useState<ParcelaForm[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!unidade) { setProdutos([]); setParceiros([]); return }
    ;(async () => {
      const [{ data: p }, { data: par }] = await Promise.all([
        sb.from('btx_produtos').select('*, unidade_base:btx_unidades_medida!unidade_base_id(nome), unidade_maior:btx_unidades_medida!unidade_maior_id(nome)').eq('ativo', true).order('nome'),
        sb.from(isCompra ? 'btx_fornecedores' : 'btx_clientes').select('id,nome').eq('ativo', true).eq('unidade', unidade).order('nome'),
      ])
      setProdutos(p ?? [])
      setParceiros((par ?? []) as Parceiro[])
    })()
  }, [unidade, isCompra, sb])

  const totalProdutos = itens.reduce((s, i) => s + Number(i.valor), 0)
  const totalNF = totalProdutos + (isCompra ? Number(form.valor_st) : 0)

  function addItem() { setItens(prev => [...prev, { ...EMPTY_ITEM }]) }
  function removeItem(idx: number) { if (itens.length > 1) setItens(prev => prev.filter((_, i) => i !== idx)) }
  function updateItem(idx: number, field: keyof ItemForm, value: string | number) {
    setItens(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  async function salvar() {
    if (!itens[0].produto_id) { onResult({ tipo: 'erro', texto: 'Adicione pelo menos um produto.' }); return }
    setSaving(true)
    const mae = isCompra ? 'btx_compras' : 'btx_vendas'
    const itensTable = isCompra ? 'btx_compras_itens' : 'btx_vendas_itens'
    const fkItem = isCompra ? 'compra_id' : 'venda_id'
    const payload: Record<string, unknown> = isCompra
      ? { unidade, fornecedor_id: form.parceiro_id || null, data_compra: form.data, numero_nf: form.numero_nf || null, valor_st: Number(form.valor_st), valor_total: totalNF, observacoes: form.observacoes || null }
      : { unidade, cliente_id: form.parceiro_id || null, data_venda: form.data, numero_nf: form.numero_nf || null, valor_st: 0, valor_total: totalNF, observacoes: form.observacoes || null }
    const { data, error: e1 } = await sb.from(mae).insert(payload).select('id').single()
    const id = data?.id
    if (e1 || !id) { setSaving(false); onResult({ tipo: 'erro', texto: 'Não foi possível salvar o lançamento.' }); return }
    const { error: e2 } = await sb.from(itensTable).insert(itens.filter(i => i.produto_id).map(i => ({ [fkItem]: id, produto_id: i.produto_id, qtd_carteiras: qtdParaBase(i, produtos), valor: i.valor })))
    if (e2) { setSaving(false); onResult({ tipo: 'erro', texto: 'Não foi possível salvar o lançamento.' }); return }
    if (parcelas.length > 0) {
      const { error: e3 } = await sb.from('btx_parcelas').insert(parcelas.map(p => ({
        unidade, tipo: isCompra ? 'pagar' : 'receber', origem: tipo, origem_id: id,
        numero_parcela: p.numero_parcela, vencimento: p.vencimento, valor: p.valor,
        numero_boleto: p.numero_boleto || null, observacoes: p.observacoes || null,
      })))
      if (e3) { setSaving(false); onResult({ tipo: 'erro', texto: 'Não foi possível salvar o lançamento.' }); return }
    }
    setSaving(false)
    onResult({ tipo: 'ok', texto: 'Lançamento salvo.' })
    setForm(EMPTY); setItens([{ ...EMPTY_ITEM }]); setParcelas([])
  }

  return (
    <div>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">{isCompra ? 'Fornecedor' : 'Cliente'}</label>
          <select className="form-select" value={form.parceiro_id} onChange={e => setForm(f => ({ ...f, parceiro_id: e.target.value }))}>
            <option value="">Nenhum</option>
            {parceiros.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Data</label>
          <input className="form-input" type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Nº NF</label>
          <input className="form-input" value={form.numero_nf} onChange={e => setForm(f => ({ ...f, numero_nf: e.target.value }))} />
        </div>
        {isCompra && (
          <div className="form-group">
            <label className="form-label">Valor ST (R$)</label>
            <input className="form-input" type="number" step="0.01" min={0} value={form.valor_st || ''} placeholder="0,00" onChange={e => setForm(f => ({ ...f, valor_st: parseFloat(e.target.value) || 0 }))} />
          </div>
        )}
        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Observações</label>
          <input className="form-input" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
        </div>
      </div>

      <hr className="divider" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Produtos da NF</div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>+ Adicionar produto</button>
      </div>
      {itens.map((it, idx) => {
        const produtoSel = produtos.find(p => p.id === it.produto_id)
        return (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
            <div className="form-group" style={{ margin: 0 }}>
              {idx === 0 && <label className="form-label">Produto</label>}
              <select className="form-select" value={it.produto_id} onChange={e => updateItem(idx, 'produto_id', e.target.value)}>
                <option value="">Selecione...</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              {idx === 0 && <label className="form-label">Quantidade</label>}
              <input className="form-input" type="number" min={0} value={it.qtdInput || ''} placeholder="0" onChange={e => updateItem(idx, 'qtdInput', parseInt(e.target.value) || 0)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              {idx === 0 && <label className="form-label">Unidade</label>}
              <select className="form-select" value={it.unidade} onChange={e => updateItem(idx, 'unidade', e.target.value)}>
                <option value="base">{produtoSel?.unidade_base?.nome ?? 'Unid. base'}</option>
                <option value="maior">{produtoSel?.unidade_maior?.nome ?? 'Unid. maior'}</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              {idx === 0 && <label className="form-label">Valor (R$)</label>}
              <input className="form-input" type="number" step="0.01" min={0} value={it.valor || ''} placeholder="0,00" onChange={e => updateItem(idx, 'valor', parseFloat(e.target.value) || 0)} />
            </div>
            <button type="button" className="btn btn-danger btn-sm" style={{ marginBottom: 0 }} onClick={() => removeItem(idx)} disabled={itens.length === 1}>✕</button>
          </div>
        )
      })}
      {isCompra && (
        <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Produtos: {formatMoeda(totalProdutos)} + ST: {formatMoeda(Number(form.valor_st))}
        </div>
      )}
      <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginTop: 4 }}>
        Total NF: {formatMoeda(totalNF)}
      </div>
      <hr className="divider" />
      <ParcelasEditor parcelas={parcelas} onChange={setParcelas} tipo={isCompra ? 'pagar' : 'receber'} />
      <button className="btn btn-primary" onClick={salvar} disabled={saving} style={{ marginTop: 12 }}>{saving ? 'Salvando…' : 'Salvar lançamento'}</button>
    </div>
  )
}
