'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { hoje } from '@/lib/utils'
import ParcelasEditor, { type ParcelaForm } from '@/components/ParcelasEditor'
import { GRUPOS_CATEGORIA, type GrupoCategoria } from '@/types'

type Categoria = { id: string; nome: string; grupo: GrupoCategoria }
type Fornecedor = { id: string; nome: string }

interface Props {
  unidade: string
  categorias: Categoria[]
  onResult: (m: { tipo: 'ok' | 'erro'; texto: string }) => void
}

const EMPTY = { categoria_id: '', fornecedor_id: '', data: hoje(), numero_nf: '', descricao: '', valor_total: 0 }

export default function FormDespesa({ unidade, categorias, onResult }: Props) {
  const sb = createClient()
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [form, setForm] = useState(EMPTY)
  const [parcelas, setParcelas] = useState<ParcelaForm[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!unidade) { setFornecedores([]); return }
    ;(async () => {
      const { data } = await sb.from('btx_fornecedores').select('id,nome').eq('ativo', true).eq('unidade', unidade).order('nome')
      setFornecedores((data ?? []) as Fornecedor[])
    })()
  }, [unidade, sb])

  const porGrupo = GRUPOS_CATEGORIA.map(g => ({ g, itens: categorias.filter(c => c.grupo === g.value) })).filter(x => x.itens.length)

  async function salvar() {
    if (!form.descricao.trim()) { onResult({ tipo: 'erro', texto: 'Descrição é obrigatória.' }); return }
    if (parcelas.length === 0) { onResult({ tipo: 'erro', texto: 'Adicione pelo menos uma parcela para registrar o vencimento.' }); return }
    setSaving(true)
    const { data, error: e1 } = await sb.from('btx_despesas').insert({
      unidade, categoria_id: form.categoria_id || null, fornecedor_id: form.fornecedor_id || null,
      data_despesa: form.data, numero_nf: form.numero_nf || null, descricao: form.descricao,
      valor_total: form.valor_total, observacoes: null,
    }).select('id').single()
    const id = data?.id
    if (e1 || !id) { setSaving(false); onResult({ tipo: 'erro', texto: 'Não foi possível salvar a despesa.' }); return }
    const { error: e2 } = await sb.from('btx_parcelas').insert(parcelas.map(p => ({
      unidade, tipo: 'pagar', origem: 'despesa', origem_id: id,
      numero_parcela: p.numero_parcela, vencimento: p.vencimento, valor: p.valor,
      numero_boleto: p.numero_boleto || null, observacoes: p.observacoes || null,
    })))
    setSaving(false)
    if (e2) { onResult({ tipo: 'erro', texto: 'Despesa criada mas falhou ao gerar parcelas. Confira em Parcelas a Pagar.' }); return }
    onResult({ tipo: 'ok', texto: 'Despesa lançada.' })
    setForm(EMPTY); setParcelas([])
  }

  return (
    <div>
      <div className="grid-2">
        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Descrição *</label>
          <input className="form-input" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Categoria</label>
          <select className="form-select" value={form.categoria_id} onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}>
            <option value="">Nenhuma</option>
            {porGrupo.map(({ g, itens }) => (
              <optgroup key={g.value} label={g.label}>
                {itens.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Fornecedor</label>
          <select className="form-select" value={form.fornecedor_id} onChange={e => setForm(f => ({ ...f, fornecedor_id: e.target.value }))}>
            <option value="">Nenhum</option>
            {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Data</label>
          <input className="form-input" type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Nº NF / Documento</label>
          <input className="form-input" value={form.numero_nf} onChange={e => setForm(f => ({ ...f, numero_nf: e.target.value }))} />
        </div>
        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Valor Total (R$) *</label>
          <input className="form-input" type="number" step="0.01" min={0} value={form.valor_total} onChange={e => setForm(f => ({ ...f, valor_total: Number(e.target.value) }))} />
        </div>
      </div>
      <hr className="divider" />
      <ParcelasEditor parcelas={parcelas} onChange={setParcelas} tipo="pagar" />
      <button className="btn btn-primary" onClick={salvar} disabled={saving} style={{ marginTop: 12 }}>{saving ? 'Salvando…' : 'Salvar lançamento'}</button>
    </div>
  )
}
