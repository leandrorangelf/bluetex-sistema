'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { formatMoeda, formatData, hoje, mesAtual, anoAtual, getMesAnoLabel, labelFormaPagamento } from '@/lib/utils'
import { saldoRestante, listarPagamentos, registrarPagamento, excluirPagamento, sincronizarParcela, type PagamentoRow } from '@/lib/pagamentos'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import PagamentoModal from '@/components/financeiro/PagamentoModal'
import type { Parcela } from '@/types'
import { isVhsysManaged } from '@/lib/vhsys/read-only'

type RelacaoNome = { nome: string } | { nome: string }[] | null
const nomeRelacao = (r: RelacaoNome) => (Array.isArray(r) ? r[0]?.nome : r?.nome)

const STATUS = [
  { key: 'aberto', label: 'Em aberto' },
  { key: 'pago', label: 'Recebidas' },
  { key: 'todos', label: 'Todas' },
] as const

function diasAtraso(vencimento: string, hojeStr: string) {
  return Math.floor((Date.parse(hojeStr) - Date.parse(vencimento)) / 86400000)
}

export default function ParcelasReceberPage() {
  const { profile, unidadeAtiva } = useAuth()
  const searchParams = useSearchParams()
  const abrirId = searchParams.get('abrir')
  const abrirTratado = useRef(false)
  const isDiretoria = profile?.role === 'diretoria'
  const isAdmin = profile?.role === 'admin'
  const [rows, setRows] = useState<Parcela[]>([])
  const [pagMap, setPagMap] = useState<Map<string, PagamentoRow[]>>(new Map())
  const [clienteMap, setClienteMap] = useState<Map<string, string>>(new Map())
  const [nfMap, setNfMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [statusFiltro, setStatusFiltro] = useState<(typeof STATUS)[number]['key']>('aberto')
  const [mes, setMes] = useState(mesAtual())
  const [ano, setAno] = useState(anoAtual())
  const [todosMeses, setTodosMeses] = useState(false)
  const [erro, setErro] = useState('')
  const [receberRow, setReceberRow] = useState<Parcela | null>(null)
  const [receberSaving, setReceberSaving] = useState(false)
  const [verId, setVerId] = useState<string | null>(null)
  const [formEdit, setFormEdit] = useState<{ vencimento: string; valor: number; forma_pagamento: 'boleto' | 'especie' | 'pix' | 'debito' | 'tarifa_bancaria'; nf: string; texto: string }>({ vencimento: '', valor: 0, forma_pagamento: 'boleto', nf: '', texto: '' })
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const sb = createClient()

  useEffect(() => { load() }, [unidadeAtiva, statusFiltro])

  // veio de um link do Painel pra dar baixa/ver uma conta específica — força
  // os filtros a mostrarem ela e abre o modal certo assim que carregar.
  useEffect(() => {
    if (abrirId) { setStatusFiltro('todos'); setTodosMeses(true) }
  }, [abrirId])

  // NF fica no numero_nf da venda vinculada, ou no numero_boleto da própria
  // parcela quando não tem vínculo; "cliente" idem via observações — texto
  // livre digitado por alguém, então pode ter erro de digitação.
  function formEditFromRow(r: Parcela) {
    const nf = nfMap.get(r.id)
    return { vencimento: r.vencimento, valor: r.valor, forma_pagamento: r.forma_pagamento ?? ('boleto' as const), nf: nf && nf !== '—' ? nf : '', texto: r.observacoes?.trim() ?? '' }
  }

  useEffect(() => {
    if (!abrirId || abrirTratado.current || rows.length === 0) return
    const row = rows.find(r => r.id === abrirId)
    if (!row) return
    abrirTratado.current = true
    if (!isVhsysManaged(row) && (row.status === 'pendente' || row.status === 'parcial')) {
      setReceberRow(row)
    } else {
      setFormEdit(formEditFromRow(row))
      setNota(row.nota_interna ?? '')
      setVerId(row.id)
    }
  }, [abrirId, rows])

  async function load() {
    setLoading(true)
    setErro('')
    let q = sb.from('btx_parcelas').select('*').eq('ativo', true).eq('tipo', 'receber').order('vencimento')
    if (unidadeAtiva) q = q.eq('unidade', unidadeAtiva)
    if (statusFiltro === 'aberto') q = q.in('status', ['pendente', 'parcial'])
    else if (statusFiltro === 'pago') q = q.eq('status', 'pago')
    const { data } = await q
    const parcelas = (data ?? []) as Parcela[]

    const ids = parcelas.map(p => p.id)
    const pags = await listarPagamentos(sb, ids)
    const mp = new Map<string, PagamentoRow[]>()
    for (const p of pags) {
      const l = mp.get(p.parcela_id)
      if (l) l.push(p); else mp.set(p.parcela_id, [p])
    }
    setPagMap(mp)

    // auto-corrige parcela que ficou recebida (soma dos pagamentos cobre o
    // valor) mas o status não sincronizou — sem isso ela trava em "saldo
    // zero" sem deixar dar baixa nem aparecer em Recebidas.
    const dessincronizadas = parcelas.filter(p => p.status !== 'pago' && p.status !== 'cancelado' && saldoRestante(p.valor, mp.get(p.id) ?? []) <= 0 && (mp.get(p.id) ?? []).length > 0)
    if (dessincronizadas.length > 0) {
      await Promise.all(dessincronizadas.map(p => sincronizarParcela(sb, { id: p.id, valor: p.valor, status: p.status })))
      return load()
    }

    const vendaIds = [...new Set(parcelas.filter(p => p.origem === 'venda' && p.origem_id).map(p => p.origem_id as string))]
    const { data: vendas } = vendaIds.length
      ? await sb.from('btx_vendas').select('id,numero_nf,cliente:btx_clientes(nome)').in('id', vendaIds)
      : { data: [] }
    const vendaList = (vendas ?? []) as { id: string; numero_nf: string | null; cliente: RelacaoNome }[]
    const vendaCliente = new Map(vendaList.map(v => [v.id, nomeRelacao(v.cliente) ?? '—']))
    const vendaNf = new Map(vendaList.map(v => [v.id, v.numero_nf ?? '']))
    const cm = new Map<string, string>()
    const nf = new Map<string, string>()
    for (const p of parcelas) {
      if (p.origem === 'venda') {
        cm.set(p.id, (p.origem_id && vendaCliente.get(p.origem_id)) || '—')
        nf.set(p.id, (p.origem_id && vendaNf.get(p.origem_id)) || '—')
      } else {
        cm.set(p.id, p.observacoes ?? '—')
        nf.set(p.id, p.numero_boleto ?? '—')
      }
    }
    setClienteMap(cm)
    setNfMap(nf)

    parcelas.sort((a, b) => (cm.get(a.id) ?? '').localeCompare(cm.get(b.id) ?? '') || a.vencimento.localeCompare(b.vencimento))
    setRows(parcelas)
    setLoading(false)
  }

  const pagosDe = (r: Parcela) => pagMap.get(r.id) ?? []
  const somaPagos = (r: Parcela) => pagosDe(r).reduce((s, p) => s + p.valor, 0)

  async function onRegistrar(dados: { valor: number; data: string; observacoes: string }) {
    if (!receberRow || isVhsysManaged(receberRow)) return
    setReceberSaving(true)
    const { error } = await registrarPagamento(sb, { id: receberRow.id, valor: receberRow.valor }, dados)
    setReceberSaving(false)
    if (error) { setErro(error); return }
    setReceberRow(null); load()
  }

  async function onExcluirPagamento(p: PagamentoRow, r: Parcela) {
    if (isVhsysManaged(r)) return
    setSaving(true)
    const { error } = await excluirPagamento(sb, p.id, { id: r.id, valor: r.valor })
    setSaving(false)
    if (error) setErro(error)
    load()
  }

  async function salvarEdit() {
    if (!verRow || isVhsysManaged(verRow)) return
    setSaving(true)
    await sb.from('btx_parcelas').update({ vencimento: formEdit.vencimento, valor: formEdit.valor, forma_pagamento: formEdit.forma_pagamento }).eq('id', verRow.id)
    if (verRow.origem === 'venda' && verRow.origem_id) {
      await sb.from('btx_vendas').update({ numero_nf: formEdit.nf.trim() || null }).eq('id', verRow.origem_id)
    } else {
      await sb.from('btx_parcelas').update({ numero_boleto: formEdit.nf.trim() || null, observacoes: formEdit.texto.trim() || null }).eq('id', verRow.id)
    }
    setSaving(false); setVerId(null); load()
  }

  async function cancelarConta() {
    if (!verRow || isVhsysManaged(verRow)) return
    setSaving(true)
    await sb.from('btx_parcelas').update({ status: 'cancelado' }).eq('id', verRow.id)
    setSaving(false); setVerId(null); load()
  }

  async function remove(id: string) {
    if (isVhsysManaged(rows.find(r => r.id === id) ?? {})) return
    setSaving(true)
    await sb.from('btx_parcelas').update({ ativo: false }).eq('id', id)
    setSaving(false); setConfirm(null); load()
  }


  function abrirVer(r: Parcela) {
    setFormEdit(formEditFromRow(r))
    setNota(r.nota_interna ?? '')
    setVerId(r.id)
  }

  async function salvarNota() {
    if (!verRow) return
    setSaving(true)
    await sb.from('btx_parcelas').update({ nota_interna: nota || null }).eq('id', verRow.id)
    setSaving(false); setVerId(null); load()
  }

  const hojeStr = hoje()
  const verRow = verId ? rows.find(r => r.id === verId) ?? null : null
  const competencia = `${ano}-${String(mes).padStart(2, '0')}`
  // pra conta recebida, o "mês dela" é o mês em que foi recebida, não o
  // vencimento — senão uma conta vencida mês passado e paga agora some da lista.
  const dataDoMes = (r: Parcela) => (r.status === 'pago' ? r.data_pagamento ?? r.vencimento : r.vencimento)
  const visiveis = todosMeses ? rows : rows.filter(r => dataDoMes(r).startsWith(competencia))
  const totalSaldo = visiveis.reduce((a, r) => a + saldoRestante(r.valor, pagosDe(r)), 0)
  function mudarMes(delta: number) {
    let m = mes + delta, a = ano
    if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMes(m); setAno(a)
  }

  function badge(r: Parcela) {
    const vencida = r.status === 'pendente' && r.vencimento < hojeStr
    if (r.status === 'pago') return <span className="badge badge-green">Recebido</span>
    if (r.status === 'parcial') return <span className="badge badge-amber">Parcial</span>
    if (r.status === 'cancelado') return <span className="badge badge-gray">Cancelado</span>
    if (vencida) return <span className="badge badge-red">Vencida</span>
    return <span className="badge badge-amber">Pendente</span>
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Contas a Receber</h1><div className="page-subtitle">contas a receber — {visiveis.length} · {formatMoeda(totalSaldo)}</div></div>
        <div style={{ display: 'flex', gap: 6 }}>
          {STATUS.map(s => (
            <button key={s.key} className={`btn btn-sm ${statusFiltro === s.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStatusFiltro(s.key)}>{s.label}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        {!todosMeses && <>
          <button className="btn btn-secondary btn-sm" onClick={() => mudarMes(-1)}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 140, textAlign: 'center' }}>{getMesAnoLabel(mes, ano)}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => mudarMes(1)}>›</button>
        </>}
        <button className={`btn btn-sm ${todosMeses ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTodosMeses(v => !v)}>
          {todosMeses ? 'Ver por mês' : 'Todos os meses'}
        </button>
      </div>
      {erro && <div className="alert alert-red" role="alert">{erro}</div>}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Tudo aqui é previsão até o recebimento ser confirmado.</div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Vencimento</th><th>Cliente</th><th>NF</th><th>Tipo</th><th className="num">Valor</th><th className="num">Recebido</th><th className="num">Saldo</th><th>Status</th><th className="num">Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="empty-state">Carregando...</td></tr>
            : visiveis.length === 0 ? <tr><td colSpan={9} className="empty-state">Nenhuma conta.</td></tr>
            : visiveis.map(r => {
              const vencida = r.status === 'pendente' && r.vencimento < hojeStr
              const recebido = somaPagos(r)
              const emAberto = r.status === 'pendente' || r.status === 'parcial'
              const atraso = vencida ? diasAtraso(r.vencimento, hojeStr) : 0
              return (
                <tr key={r.id} style={vencida ? { background: 'rgba(192,57,43,0.04)' } : {}}>
                  <td className="mono" style={vencida ? { color: 'var(--red)', fontWeight: 600 } : {}}>
                    {formatData(r.vencimento)}
                    {emAberto && atraso > 0 && <span className="page-subtitle"> · {atraso} dia(s) em atraso</span>}
                  </td>
                  <td className="cell-wrap">{clienteMap.get(r.id) ?? '—'}</td>
                  <td className="mono cell-clip" title={nfMap.get(r.id) ?? undefined}>{nfMap.get(r.id) ?? '—'} {isVhsysManaged(r) && <span className="badge badge-purple">VHSYS</span>}</td>
                  <td>{labelFormaPagamento(r.forma_pagamento)}</td>
                  <td className="mono num" style={{ fontWeight: 600 }}>{formatMoeda(r.valor)}</td>
                  <td className="mono num">{recebido > 0 ? formatMoeda(recebido) : '—'}</td>
                  <td className="mono num">{formatMoeda(saldoRestante(r.valor, pagosDe(r)))}</td>
                  <td>{badge(r)}</td>
                  <td className="cell-actions">
                    {isVhsysManaged(r) ? (
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => abrirVer(r)}>Ver</button>
                        {r.nota_interna && <span className="badge badge-gray" title={r.nota_interna}>nota</span>}
                      </div>
                    ) : !isDiretoria && (
                      <div className="row-actions">
                        {r.status !== 'pago' && r.status !== 'cancelado' && <button className="btn btn-primary btn-sm" onClick={() => setReceberRow(r)}>Receber</button>}
                        <button className="btn btn-secondary btn-sm" onClick={() => abrirVer(r)}>Ver</button>
                        {isAdmin && <button className="btn btn-danger btn-sm" onClick={() => setConfirm(r.id)}>×</button>}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <PagamentoModal
        open={!!receberRow}
        onClose={() => setReceberRow(null)}
        onSalvar={onRegistrar}
        saving={receberSaving}
        saldoRestante={receberRow ? saldoRestante(receberRow.valor, pagosDe(receberRow)) : 0}
      />

      {verRow && (
        <Modal open onClose={() => setVerId(null)} title="Detalhes da conta" size="sm"
          footer={<>
            <button className="btn btn-secondary" onClick={() => setVerId(null)}>Fechar</button>
            {isVhsysManaged(verRow)
              ? <button className="btn btn-primary" onClick={salvarNota} disabled={saving}>{saving ? 'Salvando...' : 'Salvar nota'}</button>
              : <button className="btn btn-primary" onClick={salvarEdit} disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>}
          </>}
        >
          {isVhsysManaged(verRow) && (
            <div className="alert alert-amber" style={{ marginBottom: 12 }}>
              Conta do VHSYS — valor e vencimento vêm de lá. Aqui você só adiciona uma nota interna.
            </div>
          )}
          <div className="form-group">
            <label className="form-label">{verRow.origem === 'venda' ? 'Cliente' : 'Origem'}</label>
            {verRow.origem === 'venda'
              ? <div>{clienteMap.get(verRow.id) ?? '—'}</div>
              : <input className="form-input" value={formEdit.texto} disabled={isVhsysManaged(verRow)} onChange={e => setFormEdit(f => ({ ...f, texto: e.target.value }))} placeholder="Observação" />}
          </div>
          <div className="form-group">
            <label className="form-label">Nº do boleto / NF</label>
            <input className="form-input" value={formEdit.nf} disabled={isVhsysManaged(verRow)} onChange={e => setFormEdit(f => ({ ...f, nf: e.target.value }))} placeholder="Ex.: 2388" />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label" style={{ color: 'var(--red)' }}>Vencimento</label>
              <input className="form-input" type="date" value={formEdit.vencimento} disabled={isVhsysManaged(verRow)} onChange={e => setFormEdit(f => ({ ...f, vencimento: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ color: 'var(--green)' }}>Recebido em</label>
              <div className="form-input mono" style={{ background: 'var(--surface2)', color: verRow.status === 'pago' ? 'var(--green)' : 'var(--text-muted)' }}>
                {verRow.status === 'pago' ? formatData(verRow.data_pagamento) : '— ainda não recebido'}
              </div>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Valor (R$)</label>
            <input className="form-input mono" type="number" step="0.01" value={formEdit.valor} disabled={isVhsysManaged(verRow)} onChange={e => setFormEdit(f => ({ ...f, valor: Number(e.target.value) }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Tipo de recebimento</label>
            <select className="form-select" value={formEdit.forma_pagamento} disabled={isVhsysManaged(verRow)} onChange={e => setFormEdit(f => ({ ...f, forma_pagamento: e.target.value as typeof f.forma_pagamento }))}>
              <option value="boleto">Boleto</option>
              <option value="especie">Dinheiro</option>
              <option value="pix">PIX</option>
              <option value="debito">Débito</option>
              <option value="tarifa_bancaria">Tarifa Bancária</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Nota interna</label>
            <textarea className="form-input" rows={2} value={nota} onChange={e => setNota(e.target.value)} placeholder="Anotação sua, não sincroniza com o VHSYS" />
          </div>
          <div className="form-group">
            <label className="form-label">Histórico de recebimentos</label>
            {pagosDe(verRow).length === 0 ? <div className="page-subtitle">Nenhum recebimento registrado.</div>
              : pagosDe(verRow).map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <span className="mono">{formatData(p.data_pagamento)} · {formatMoeda(p.valor)}{p.observacoes ? ` · ${p.observacoes}` : ''}</span>
                  {!isVhsysManaged(verRow) && isAdmin && <button className="btn btn-danger btn-sm" disabled={saving} onClick={() => onExcluirPagamento(p, verRow)}>excluir</button>}
                </div>
              ))}
          </div>
          {!isVhsysManaged(verRow) && isAdmin && verRow.status !== 'cancelado' && (
            <button className="btn btn-secondary btn-sm" onClick={cancelarConta} disabled={saving}>Cancelar conta</button>
          )}
        </Modal>
      )}

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove(confirm)} loading={saving} message="A conta será marcada como inativa." />
    </div>
  )
}
