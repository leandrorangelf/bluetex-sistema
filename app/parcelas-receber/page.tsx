'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { formatMoeda, formatData, hoje } from '@/lib/utils'
import { saldoRestante, listarPagamentos, registrarPagamento, excluirPagamento, sincronizarParcela, type PagamentoRow } from '@/lib/pagamentos'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import PagamentoModal from '@/components/financeiro/PagamentoModal'
import type { Parcela } from '@/types'

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
  const isDiretoria = profile?.role === 'diretoria'
  const [rows, setRows] = useState<Parcela[]>([])
  const [pagMap, setPagMap] = useState<Map<string, PagamentoRow[]>>(new Map())
  const [clienteMap, setClienteMap] = useState<Map<string, string>>(new Map())
  const [nfMap, setNfMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [statusFiltro, setStatusFiltro] = useState<(typeof STATUS)[number]['key']>('aberto')
  const [erro, setErro] = useState('')
  const [receberRow, setReceberRow] = useState<Parcela | null>(null)
  const [receberSaving, setReceberSaving] = useState(false)
  const [verId, setVerId] = useState<string | null>(null)
  const [formEdit, setFormEdit] = useState({ vencimento: '', valor: 0 })
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const sb = createClient()

  useEffect(() => { load() }, [unidadeAtiva, statusFiltro])

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
    if (!receberRow) return
    setReceberSaving(true)
    const { error } = await registrarPagamento(sb, { id: receberRow.id, valor: receberRow.valor }, dados)
    setReceberSaving(false)
    if (error) { setErro(error); return }
    setReceberRow(null); load()
  }

  async function onExcluirPagamento(p: PagamentoRow, r: Parcela) {
    setSaving(true)
    const { error } = await excluirPagamento(sb, p.id, { id: r.id, valor: r.valor })
    setSaving(false)
    if (error) setErro(error)
    load()
  }

  async function salvarEdit() {
    if (!verRow) return
    setSaving(true)
    await sb.from('btx_parcelas').update({ vencimento: formEdit.vencimento, valor: formEdit.valor }).eq('id', verRow.id)
    await sincronizarParcela(sb, { id: verRow.id, valor: formEdit.valor, status: verRow.status })
    setSaving(false); setVerId(null); load()
  }

  async function cancelarConta() {
    if (!verRow) return
    setSaving(true)
    await sb.from('btx_parcelas').update({ status: 'cancelado' }).eq('id', verRow.id)
    setSaving(false); setVerId(null); load()
  }

  async function remove(id: string) {
    setSaving(true)
    await sb.from('btx_parcelas').update({ ativo: false }).eq('id', id)
    setSaving(false); setConfirm(null); load()
  }

  function abrirVer(r: Parcela) {
    setFormEdit({ vencimento: r.vencimento, valor: r.valor })
    setVerId(r.id)
  }

  const hojeStr = hoje()
  const verRow = verId ? rows.find(r => r.id === verId) ?? null : null
  const totalSaldo = rows.reduce((a, r) => a + saldoRestante(r.valor, pagosDe(r)), 0)

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
        <div><h1 className="page-title">Contas a Receber</h1><div className="page-subtitle">contas a receber — {rows.length} · {formatMoeda(totalSaldo)}</div></div>
        <div style={{ display: 'flex', gap: 6 }}>
          {STATUS.map(s => (
            <button key={s.key} className={`btn btn-sm ${statusFiltro === s.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStatusFiltro(s.key)}>{s.label}</button>
          ))}
        </div>
      </div>
      {erro && <div className="alert alert-red" role="alert">{erro}</div>}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Tudo aqui é previsão até o recebimento ser confirmado.</div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Cliente</th><th>NF</th><th>Vencimento</th><th className="num">Valor</th><th className="num">Recebido</th><th className="num">Saldo</th><th>Status</th><th className="num">Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="empty-state">Carregando...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={8} className="empty-state">Nenhuma conta.</td></tr>
            : rows.map(r => {
              const vencida = r.status === 'pendente' && r.vencimento < hojeStr
              const recebido = somaPagos(r)
              const emAberto = r.status === 'pendente' || r.status === 'parcial'
              const atraso = vencida ? diasAtraso(r.vencimento, hojeStr) : 0
              return (
                <tr key={r.id} style={vencida ? { background: 'rgba(192,57,43,0.04)' } : {}}>
                  <td className="cell-wrap">{clienteMap.get(r.id) ?? '—'}</td>
                  <td className="mono">{nfMap.get(r.id) ?? '—'}</td>
                  <td className="mono" style={vencida ? { color: 'var(--red)', fontWeight: 600 } : {}}>
                    {formatData(r.vencimento)}
                    {emAberto && atraso > 0 && <span className="page-subtitle"> · {atraso} dia(s) em atraso</span>}
                  </td>
                  <td className="mono num" style={{ fontWeight: 600 }}>{formatMoeda(r.valor)}</td>
                  <td className="mono num">{recebido > 0 ? formatMoeda(recebido) : '—'}</td>
                  <td className="mono num">{formatMoeda(saldoRestante(r.valor, pagosDe(r)))}</td>
                  <td>{badge(r)}</td>
                  <td className="cell-actions">
                    {!isDiretoria && (
                      <div className="row-actions">
                        {r.status !== 'pago' && r.status !== 'cancelado' && <button className="btn btn-primary btn-sm" onClick={() => setReceberRow(r)}>Receber</button>}
                        <button className="btn btn-secondary btn-sm" onClick={() => abrirVer(r)}>Ver</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setConfirm(r.id)}>×</button>
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
            <button className="btn btn-primary" onClick={salvarEdit} disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>
          </>}
        >
          <div className="form-group">
            <label className="form-label">Cliente</label>
            <div>{clienteMap.get(verRow.id) ?? '—'}</div>
          </div>
          <div className="form-group">
            <label className="form-label">Vencimento</label>
            <input className="form-input" type="date" value={formEdit.vencimento} onChange={e => setFormEdit(f => ({ ...f, vencimento: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Valor (R$)</label>
            <input className="form-input mono" type="number" step="0.01" value={formEdit.valor} onChange={e => setFormEdit(f => ({ ...f, valor: Number(e.target.value) }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Histórico de recebimentos</label>
            {pagosDe(verRow).length === 0 ? <div className="page-subtitle">Nenhum recebimento registrado.</div>
              : pagosDe(verRow).map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <span className="mono">{formatData(p.data_pagamento)} · {formatMoeda(p.valor)}{p.observacoes ? ` · ${p.observacoes}` : ''}</span>
                  <button className="btn btn-danger btn-sm" disabled={saving} onClick={() => onExcluirPagamento(p, verRow)}>excluir</button>
                </div>
              ))}
          </div>
          {verRow.status !== 'cancelado' && (
            <button className="btn btn-secondary btn-sm" onClick={cancelarConta} disabled={saving}>Cancelar conta</button>
          )}
        </Modal>
      )}

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove(confirm)} loading={saving} message="A conta será marcada como inativa." />
    </div>
  )
}
