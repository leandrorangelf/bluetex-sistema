'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { hoje } from '@/lib/utils'
import { gerarParcelasRecorrentes } from '@/lib/parcelamento'
import ParcelasEditor, { type ParcelaForm } from '@/components/ParcelasEditor'
import { GRUPOS_CATEGORIA, type GrupoCategoria } from '@/types'

type Categoria = { id: string; nome: string; grupo: GrupoCategoria }
type Fornecedor = { id: string; nome: string }
type FormaPagamento = 'boleto' | 'especie' | 'pix'

interface Props {
  unidade: string
  categorias: Categoria[]
  onResult: (m: { tipo: 'ok' | 'erro'; texto: string }) => void
}

const EMPTY = { categoria_id: '', fornecedor_id: '', data: hoje(), numero_nf: '', descricao: '', valor_total: 0 }

// Uma parcela avulsa já vem pronta pra editar — não precisa clicar em
// "+ Parcela" pra despesa comum, só quando quiser dividir em várias.
function parcelaAvulsa(): ParcelaForm {
  return { numero_parcela: 1, data_lancamento: hoje(), vencimento: hoje(), valor: 0, numero_boleto: '', observacoes: '', forma_pagamento: 'boleto' }
}

export default function FormDespesa({ unidade, categorias, onResult }: Props) {
  const sb = createClient()
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [form, setForm] = useState(EMPTY)
  const [parcelas, setParcelas] = useState<ParcelaForm[]>([parcelaAvulsa()])
  const [recorrente, setRecorrente] = useState(false)
  const [recVencimento, setRecVencimento] = useState(hoje())
  const [recValor, setRecValor] = useState(0)
  const [recFormaPagamento, setRecFormaPagamento] = useState<FormaPagamento>('boleto')
  const [recMeses, setRecMeses] = useState(12)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!unidade) { setFornecedores([]); return }
    ;(async () => {
      const { data } = await sb.from('btx_fornecedores').select('id,nome').eq('ativo', true).eq('unidade', unidade).order('nome')
      setFornecedores((data ?? []) as Fornecedor[])
    })()
  }, [unidade, sb])

  // com 1 só parcela (caso comum) o valor dela É o valor total da despesa —
  // sem isso a parcela ficava com valor 0 se o usuário só preenchesse "Valor
  // Total" e não abrisse o campo de valor da parcela lá embaixo.
  useEffect(() => {
    if (recorrente) return
    setParcelas(prev => prev.length === 1 && prev[0].valor !== form.valor_total
      ? [{ ...prev[0], valor: form.valor_total }] : prev)
  }, [form.valor_total, recorrente])

  // Vencimento acompanha o campo "Data" (do topo) enquanto a parcela avulsa
  // não foi mexida à mão — assim que o usuário editar o vencimento direto na
  // parcela, esse campo para de seguir o topo. Data de lançamento NÃO segue:
  // ela é sempre o dia real em que a pessoa está lançando (hoje), automática.
  const dataSincronizada = useRef(EMPTY.data)
  useEffect(() => {
    if (recorrente) return
    setParcelas(prev => {
      if (prev.length !== 1) return prev
      const p = prev[0]
      if (p.vencimento !== dataSincronizada.current) return prev
      return [{ ...p, vencimento: form.data }]
    })
    dataSincronizada.current = form.data
  }, [form.data, recorrente])

  const porGrupo = GRUPOS_CATEGORIA.map(g => ({ g, itens: categorias.filter(c => c.grupo === g.value) })).filter(x => x.itens.length)

  async function salvar() {
    if (!form.descricao.trim()) { onResult({ tipo: 'erro', texto: 'Descrição é obrigatória.' }); return }
    if (recorrente ? recValor <= 0 : parcelas.length === 0) {
      onResult({ tipo: 'erro', texto: recorrente ? 'Informe o valor mensal.' : 'Adicione pelo menos uma parcela para registrar o vencimento.' })
      return
    }
    setSaving(true)
    const valorTotalDespesa = recorrente ? recValor * recMeses : form.valor_total
    const { data, error: e1 } = await sb.from('btx_despesas').insert({
      unidade, categoria_id: form.categoria_id || null, fornecedor_id: form.fornecedor_id || null,
      data_despesa: form.data, numero_nf: form.numero_nf || null, descricao: form.descricao,
      valor_total: valorTotalDespesa, observacoes: recorrente ? `Recorrente · ${recMeses} meses` : null,
    }).select('id').single()
    const id = data?.id
    if (e1 || !id) { setSaving(false); onResult({ tipo: 'erro', texto: 'Não foi possível salvar a despesa.' }); return }

    const linhas = recorrente
      ? gerarParcelasRecorrentes(recValor, recVencimento, recMeses).map(p => ({
          unidade, tipo: 'pagar', origem: 'despesa', origem_id: id,
          numero_parcela: p.numero_parcela, vencimento: p.vencimento, valor: p.valor,
          numero_boleto: null, observacoes: null,
          forma_pagamento: recFormaPagamento, data_lancamento: p.vencimento,
        }))
      : parcelas.map(p => ({
          unidade, tipo: 'pagar', origem: 'despesa', origem_id: id,
          numero_parcela: p.numero_parcela, vencimento: p.vencimento, valor: p.valor,
          numero_boleto: p.numero_boleto || null, observacoes: p.observacoes || null,
          forma_pagamento: p.forma_pagamento, data_lancamento: p.data_lancamento,
        }))
    const { error: e2 } = await sb.from('btx_parcelas').insert(linhas)
    setSaving(false)
    if (e2) { onResult({ tipo: 'erro', texto: 'Despesa criada mas falhou ao gerar parcelas. Confira em Parcelas a Pagar.' }); return }
    onResult({ tipo: 'ok', texto: recorrente ? `Despesa recorrente lançada (${linhas.length} meses).` : 'Despesa lançada.' })
    dataSincronizada.current = EMPTY.data
    setForm(EMPTY); setParcelas([parcelaAvulsa()])
    setRecorrente(false); setRecVencimento(hoje()); setRecValor(0); setRecFormaPagamento('boleto'); setRecMeses(12)
  }

  return (
    <div>
      <div className="grid-2">
        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Descrição *</label>
          <input className="form-input" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex.: Aluguel, condomínio, internet, telefone..." />
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
          <label className="form-label">Vencimento</label>
          <input className="form-input" type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Nº NF / Documento</label>
          <input className="form-input" value={form.numero_nf} onChange={e => setForm(f => ({ ...f, numero_nf: e.target.value }))} />
        </div>
        {!recorrente && (
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Valor Total (R$) *</label>
            <input className="form-input" type="number" step="0.01" min={0} value={form.valor_total} onChange={e => setForm(f => ({ ...f, valor_total: Number(e.target.value) }))} />
          </div>
        )}
      </div>
      <hr className="divider" />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 12 }}>
        <input type="checkbox" checked={recorrente} onChange={e => setRecorrente(e.target.checked)} />
        Despesa recorrente (repete todo mês — ex.: aluguel, condomínio, internet, telefone)
      </label>
      {recorrente ? (
        <div className="grid-2">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">1º vencimento</label>
            <input className="form-input" type="date" value={recVencimento} onChange={e => setRecVencimento(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Valor mensal (R$) *</label>
            <input className="form-input" type="number" step="0.01" min={0} value={recValor} onChange={e => setRecValor(Number(e.target.value))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Tipo de pagamento</label>
            <select className="form-select" value={recFormaPagamento} onChange={e => setRecFormaPagamento(e.target.value as FormaPagamento)}>
              <option value="boleto">Boleto</option>
              <option value="especie">Dinheiro</option>
              <option value="pix">PIX</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Repetir por quantos meses</label>
            <input className="form-input" type="number" min={1} max={36} value={recMeses} onChange={e => setRecMeses(Number(e.target.value))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1/-1' }}>
            <span className="page-subtitle">Vai gerar {recMeses} parcela(s) de {recValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, uma por mês a partir de {recVencimento.split('-').reverse().join('/')}.</span>
          </div>
        </div>
      ) : (
        <ParcelasEditor parcelas={parcelas} onChange={setParcelas} tipo="pagar" />
      )}
      <button className="btn btn-primary" onClick={salvar} disabled={saving} style={{ marginTop: 12 }}>{saving ? 'Salvando…' : 'Salvar lançamento'}</button>
    </div>
  )
}
