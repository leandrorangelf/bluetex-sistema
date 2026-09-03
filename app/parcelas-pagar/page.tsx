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
import type { Parcela, OrigemParcela } from '@/types'
import { isVhsysManaged } from '@/lib/vhsys/read-only'

type RelacaoNome = { nome: string } | { nome: string }[] | null
const nomeRelacao = (r: RelacaoNome) => (Array.isArray(r) ? r[0]?.nome : r?.nome)

const STATUS = [
  { key: 'aberto', label: 'Em aberto' },
  { key: 'pago', label: 'Pagas' },
  { key: 'todos', label: 'Todas' },
] as const
const ORIGENS = ['todos', 'compra', 'despesa', 'manual'] as const

export default function ParcelasPagarPage() {
  const { profile, unidadeAtiva } = useAuth()
  const isDiretoria = profile?.role === 'diretoria'
  const [rows, setRows] = useState<Parcela[]>([])
  const [pagMap, setPagMap] = useState<Map<string, PagamentoRow[]>>(new Map())
  const [origemMap, setOrigemMap] = useState<Map<string, string>>(new Map())
  const [nfMap, setNfMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [statusFiltro, setStatusFiltro] = useState<(typeof STATUS)[number]['key']>('aberto')
  const [origemFiltro, setOrigemFiltro] = useState<(typeof ORIGENS)[number]>('todos')
  const [erro, setErro] = useState('')
  const [pagarRow, setPagarRow] = useState<Parcela | null>(null)
  const [pagarSaving, setPagarSaving] = useState(false)
  const [verId, setVerId] = useState<string | null>(null)
  const [formEdit, setFormEdit] = useState({ vencimento: '', valor: 0 })
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const sb = createClient()

  useEffect(() => { load() }, [unidadeAtiva, statusFiltro])

  async function load() {
    setLoading(true)
    setErro('')
    let q = sb.from('btx_parcelas').select('*').eq('ativo', true).eq('tipo', 'pagar').order('vencimento')
    if (unidadeAtiva) q = q.eq('unidade', unidadeAtiva)
    if (statusFiltro === 'aberto') q = q.in('status', ['pendente', 'parcial'])
    else if (statusFiltro === 'pago') q = q.eq('status', 'pago')
    const { data } = await q
    const parcelas = (data ?? []) as Parcela[]
    setRows(parcelas)

    const ids = parcelas.map(p => p.id)
    const pags = await listarPagamentos(sb, ids)
    const mp = new Map<string, PagamentoRow[]>()
    for (const p of pags) {
      const l = mp.get(p.parcela_id)
      if (l) l.push(p); else mp.set(p.parcela_id, [p])
    }
    setPagMap(mp)

    const origemIds = (o: OrigemParcela) => [...new Set(parcelas.filter(p => p.origem === o && p.origem_id).map(p => p.origem_id as string))]
    const compraIds = origemIds('compra')
    const despesaIds = origemIds('despesa')
    const [compras, despesas] = await Promise.all([
      compraIds.length ? sb.from('btx_compras').select('id,numero_nf,fornecedor:btx_fornecedores(nome)').in('id', compraIds) : Promise.resolve({ data: [] }),
      despesaIds.length ? sb.from('btx_despesas').select('id,numero_nf,descricao,categoria:btx_categorias_despesas(nome)').in('id', despesaIds) : Promise.resolve({ data: [] }),
    ])
    const compraData = (compras.data ?? []) as { id: string; numero_nf: string | null; fornecedor: RelacaoNome }[]
    const despesaData = (despesas.data ?? []) as { id: string; numero_nf: string | null; descricao: string; categoria: RelacaoNome }[]
    const compraNome = new Map(compraData.map(c => [c.id, nomeRelacao(c.fornecedor) ?? 'Compra']))
    const compraNf = new Map(compraData.map(c => [c.id, c.numero_nf ?? '']))
    const despesaNf = new Map(despesaData.map(d => [d.id, d.numero_nf ?? '']))
    const despesaTxt = new Map(despesaData.map(d => {
      const cat = nomeRelacao(d.categoria)
      return [d.id, d.descricao + (cat ? ` · ${cat}` : '')]
    }))
    const om = new Map<string, string>()
    const nf = new Map<string, string>()
    for (const p of parcelas) {
      if (p.origem === 'compra') {
        om.set(p.id, (p.origem_id && compraNome.get(p.origem_id)) || 'Compra')
        nf.set(p.id, (p.origem_id && compraNf.get(p.origem_id)) || '—')
      } else if (p.origem === 'despesa') {
        om.set(p.id, (p.origem_id && despesaTxt.get(p.origem_id)) || 'Despesa')
        nf.set(p.id, (p.origem_id && despesaNf.get(p.origem_id)) || '—')
      } else {
        om.set(p.id, p.observacoes ?? '—')
        nf.set(p.id, p.numero_boleto ?? '—')
      }
    }
    setOrigemMap(om)
    setNfMap(nf)
    setLoading(false)
  }

  const pagosDe = (r: Parcela) => pagMap.get(r.id) ?? []
  const somaPagos = (r: Parcela) => pagosDe(r).reduce((s, p) => s + p.valor, 0)

  async function onRegistrar(dados: { valor: number; data: string; observacoes: string }) {
    if (!pagarRow || isVhsysManaged(pagarRow)) return
    setPagarSaving(true)
    const { error } = await registrarPagamento(sb, { id: pagarRow.id, valor: pagarRow.valor }, dados)
    setPagarSaving(false)
    if (error) { setErro(error); return }
    setPagarRow(null); load()
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
    await sb.from('btx_parcelas').update({ vencimento: formEdit.vencimento, valor: formEdit.valor }).eq('id', verRow.id)
    await sincronizarParcela(sb, { id: verRow.id, valor: formEdit.valor, status: verRow.status })
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
    if (isVhsysManaged(r)) return
    setFormEdit({ vencimento: r.vencimento, valor: r.valor })
    setVerId(r.id)
  }

  const hojeStr = hoje()
  const verRow = verId ? rows.find(r => r.id === verId) ?? null : null
  const visiveis = origemFiltro === 'todos' ? rows : rows.filter(r => r.origem === origemFiltro)
  const totalSaldo = visiveis.reduce((a, r) => a + saldoRestante(r.valor, pagosDe(r)), 0)

  function badge(r: Parcela) {
    const vencida = r.status === 'pendente' && r.vencimento < hojeStr
    if (r.status === 'pago') return <span className="badge badge-green">Pago</span>
    if (r.status === 'parcial') return <span className="badge badge-amber">Parcial</span>
    if (r.status === 'cancelado') return <span className="badge badge-gray">Cancelado</span>
    if (vencida) return <span className="badge badge-red">Vencida</span>
    return <span className="badge badge-amber">Pendente</span>
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Contas a Pagar</h1><div className="page-subtitle">contas a pagar — {visiveis.length} · {formatMoeda(totalSaldo)}</div></div>
        <div style={{ display: 'flex', gap: 6 }}>
          {STATUS.map(s => (
            <button key={s.key} className={`btn btn-sm ${statusFiltro === s.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStatusFiltro(s.key)}>{s.label}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {ORIGENS.map(o => (
          <button key={o} className={`btn btn-sm ${origemFiltro === o ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setOrigemFiltro(o)}>
            {o === 'todos' ? 'Todas' : o.charAt(0).toUpperCase() + o.slice(1)}
          </button>
        ))}
      </div>
      {erro && <div className="alert alert-red" role="alert">{erro}</div>}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Tudo aqui é previsão até o pagamento ser confirmado.</div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Vencimento</th><th>Origem</th><th>NF</th><th className="num">Valor</th><th className="num">Pago</th><th className="num">Saldo</th><th>Status</th><th className="num">Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="empty-state">Carregando...</td></tr>
            : visiveis.length === 0 ? <tr><td colSpan={8} className="empty-state">Nenhuma conta.</td></tr>
            : visiveis.map(r => {
              const vencida = r.status === 'pendente' && r.vencimento < hojeStr
              const pago = somaPagos(r)
              return (
                <tr key={r.id} style={vencida ? { background: 'rgba(192,57,43,0.04)' } : {}}>
                  <td className="mono" style={vencida ? { color: 'var(--red)', fontWeight: 600 } : {}}>{formatData(r.vencimento)}</td>
                  <td className="cell-wrap">{origemMap.get(r.id) ?? '—'}</td>
                  <td className="mono">{nfMap.get(r.id) ?? '—'} {isVhsysManaged(r) && <span className="badge badge-purple">VHSYS</span>}</td>
                  <td className="mono num" style={{ fontWeight: 600 }}>{formatMoeda(r.valor)}</td>
                  <td className="mono num">{pago > 0 ? formatMoeda(pago) : '—'}</td>
                  <td className="mono num">{formatMoeda(saldoRestante(r.valor, pagosDe(r)))}</td>
                  <td>{badge(r)}</td>
                  <td className="cell-actions">
                    {isVhsysManaged(r) ? <span className="text-muted">Gerenciado pelo VHSYS</span>
                    : !isDiretoria && (
                      <div className="row-actions">
                        {r.status !== 'pago' && r.status !== 'cancelado' && <button className="btn btn-primary btn-sm" onClick={() => setPagarRow(r)}>Pagar</button>}
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
        open={!!pagarRow}
        onClose={() => setPagarRow(null)}
        onSalvar={onRegistrar}
        saving={pagarSaving}
        saldoRestante={pagarRow ? saldoRestante(pagarRow.valor, pagosDe(pagarRow)) : 0}
      />

      {verRow && (
        <Modal open onClose={() => setVerId(null)} title="Detalhes da conta" size="sm"
          footer={<>
            <button className="btn btn-secondary" onClick={() => setVerId(null)}>Fechar</button>
            <button className="btn btn-primary" onClick={salvarEdit} disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>
          </>}
        >
          <div className="form-group">
            <label className="form-label">Origem</label>
            <div>{origemMap.get(verRow.id) ?? '—'}</div>
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
            <label className="form-label">Histórico de pagamentos</label>
            {pagosDe(verRow).length === 0 ? <div className="page-subtitle">Nenhum pagamento registrado.</div>
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
