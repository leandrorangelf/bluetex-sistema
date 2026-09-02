'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { hoje } from '@/lib/utils'
import { gerarParcelas } from '@/lib/parcelamento'
import { ajustarSaldoBanco } from '@/lib/saldo'
import { UNIDADES, type Unidade, type GrupoCategoria } from '@/types'
import FormMovimento from '@/components/lancar/FormMovimento'
import FormDespesa from '@/components/lancar/FormDespesa'

type Aba = 'entrada' | 'saida' | 'despesa' | 'receber' | 'saldo'
type Categoria = { id: string; nome: string; grupo: GrupoCategoria }
type Cliente = { id: string; nome: string }

export default function LancarPage() {
  const { profile, unidadeAtiva } = useAuth()
  const sb = useMemo(() => createClient(), [])
  const isAdmin = profile?.role === 'admin'
  const [aba, setAba] = useState<Aba>('entrada')
  const [unidade, setUnidade] = useState<Unidade | ''>((unidadeAtiva as Unidade) ?? '')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (!isAdmin && unidadeAtiva) setUnidade(unidadeAtiva as Unidade) }, [isAdmin, unidadeAtiva])

  useEffect(() => {
    if (!unidade) { setCategorias([]); setClientes([]); return }
    ;(async () => {
      const [{ data: cat }, { data: cli }] = await Promise.all([
        sb.from('btx_categorias_despesas').select('id,nome,grupo').eq('ativo', true).eq('unidade', unidade).order('nome'),
        sb.from('btx_clientes').select('id,nome').eq('ativo', true).eq('unidade', unidade).order('nome'),
      ])
      setCategorias((cat ?? []) as Categoria[])
      setClientes((cli ?? []) as Cliente[])
    })()
  }, [unidade, sb])

  const podeUsar = profile && profile.role !== 'diretoria'

  if (!podeUsar) return <div className="empty-state">Sem permissão para lançar.</div>

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Lançar</h1><div className="page-subtitle">Todo lançamento do sistema entra por aqui</div></div>
      </div>

      {isAdmin && (
        <div className="form-group" style={{ maxWidth: 320 }}>
          <label className="form-label">Unidade</label>
          <select className="form-select" value={unidade} onChange={e => { setUnidade(e.target.value as Unidade); setMsg(null) }}>
            <option value="">Selecione…</option>
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      )}

      {!unidade ? <div className="empty-state">Selecione a unidade.</div> : (
        <>
          <div className="tabs">
            <button className={`tab${aba === 'entrada' ? ' active' : ''}`} onClick={() => { setAba('entrada'); setMsg(null) }}>Entrada</button>
            <button className={`tab${aba === 'saida' ? ' active' : ''}`} onClick={() => { setAba('saida'); setMsg(null) }}>Saída</button>
            <button className={`tab${aba === 'despesa' ? ' active' : ''}`} onClick={() => { setAba('despesa'); setMsg(null) }}>Despesa</button>
            <button className={`tab${aba === 'receber' ? ' active' : ''}`} onClick={() => { setAba('receber'); setMsg(null) }}>Recebimento</button>
            <button className={`tab${aba === 'saldo' ? ' active' : ''}`} onClick={() => { setAba('saldo'); setMsg(null) }}>Ajustar saldo</button>
          </div>

          {msg && <div className={`alert ${msg.tipo === 'ok' ? 'alert-green' : 'alert-red'}`} style={{ marginBottom: 16 }}>{msg.texto}</div>}

          <div className="card" style={{ maxWidth: aba === 'entrada' || aba === 'saida' ? 720 : 560 }}>
            {aba === 'entrada' && <FormMovimento tipo="compra" unidade={unidade} onResult={setMsg} />}
            {aba === 'saida' && <FormMovimento tipo="venda" unidade={unidade} onResult={setMsg} />}
            {aba === 'despesa' && <FormDespesa unidade={unidade} categorias={categorias} onResult={setMsg} />}
            {aba === 'receber' && <FormReceber sb={sb} unidade={unidade} clientes={clientes} saving={saving} setSaving={setSaving} onResult={setMsg} />}
            {aba === 'saldo' && <FormSaldo sb={sb} unidade={unidade} saving={saving} setSaving={setSaving} onResult={setMsg} />}
          </div>
        </>
      )}
    </div>
  )
}

type ResultFn = (m: { tipo: 'ok' | 'erro'; texto: string }) => void
type FormBase = { sb: ReturnType<typeof createClient>; unidade: string; saving: boolean; setSaving: (b: boolean) => void; onResult: ResultFn }

function ParcelarCampos({ parcelar, setParcelar, n, setN }: { parcelar: boolean; setParcelar: (b: boolean) => void; n: number; setN: (n: number) => void }) {
  return (
    <>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '4px 0' }}>
        <input type="checkbox" checked={parcelar} onChange={e => setParcelar(e.target.checked)} /> Parcelar
      </label>
      {parcelar && (
        <div className="form-group">
          <label className="form-label">Nº de parcelas</label>
          <input className="form-input" type="number" min={2} max={24} value={n} onChange={e => setN(Number(e.target.value))} />
        </div>
      )}
    </>
  )
}

function FormReceber({ sb, unidade, clientes, saving, setSaving, onResult }: FormBase & { clientes: Cliente[] }) {
  const [clienteId, setClienteId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState(0)
  const [data, setData] = useState(hoje())
  const [parcelar, setParcelar] = useState(false)
  const [n, setN] = useState(2)

  async function salvar() {
    if (!descricao.trim() || valor <= 0 || !data) { onResult({ tipo: 'erro', texto: 'Preencha descrição, valor e data.' }); return }
    setSaving(true)
    const nomeCliente = clientes.find(c => c.id === clienteId)?.nome
    const obs = descricao + (nomeCliente ? ` — ${nomeCliente}` : '')
    const parcelas = gerarParcelas(valor, data, parcelar ? n : 1)
    const { error } = await sb.from('btx_parcelas').insert(parcelas.map(p => ({
      unidade, tipo: 'receber', origem: 'manual', origem_id: null,
      numero_parcela: p.numero_parcela, vencimento: p.vencimento, valor: p.valor, observacoes: obs,
    })))
    setSaving(false)
    if (error) { onResult({ tipo: 'erro', texto: 'Não foi possível lançar o recebimento.' }); return }
    onResult({ tipo: 'ok', texto: `Recebimento lançado (${parcelas.length} parcela(s)).` })
    setClienteId(''); setDescricao(''); setValor(0); setData(hoje()); setParcelar(false); setN(2)
  }

  return (
    <>
      <div className="form-group"><label className="form-label">Cliente</label>
        <select className="form-select" value={clienteId} onChange={e => setClienteId(e.target.value)}>
          <option value="">— nenhum —</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select></div>
      <div className="form-group"><label className="form-label">Descrição *</label>
        <input className="form-input" value={descricao} onChange={e => setDescricao(e.target.value)} /></div>
      <div className="form-group"><label className="form-label">Valor (R$) *</label>
        <input className="form-input" type="number" step="0.01" min={0} value={valor} onChange={e => setValor(Number(e.target.value))} /></div>
      <div className="form-group"><label className="form-label">Data prevista *</label>
        <input className="form-input" type="date" value={data} onChange={e => setData(e.target.value)} /></div>
      <ParcelarCampos parcelar={parcelar} setParcelar={setParcelar} n={n} setN={setN} />
      <button className="btn btn-primary" onClick={salvar} disabled={saving} style={{ marginTop: 8 }}>{saving ? 'Salvando…' : 'Lançar recebimento'}</button>
    </>
  )
}

function FormSaldo({ sb, unidade, saving, setSaving, onResult }: FormBase) {
  const [saldo, setSaldo] = useState(0)
  async function salvar() {
    setSaving(true)
    const { error } = await ajustarSaldoBanco(sb, unidade, saldo)
    setSaving(false)
    onResult(error ? { tipo: 'erro', texto: error } : { tipo: 'ok', texto: 'Saldo do banco ajustado para hoje.' })
  }
  return (
    <>
      <div className="form-group"><label className="form-label">Saldo real hoje no banco (R$) *</label>
        <input className="form-input" type="number" step="0.01" value={saldo} onChange={e => setSaldo(Number(e.target.value))} /></div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Recalcula o saldo-base do mês atual a partir do valor informado.</div>
      <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Salvar saldo'}</button>
    </>
  )
}
