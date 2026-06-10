'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { formatMoeda, formatData, hoje } from '@/lib/utils'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { Parcela } from '@/types'

export default function ParcelasPagarPage() {
  const { unidadeAtiva } = useAuth()
  const [rows, setRows] = useState<Parcela[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFiltro, setStatusFiltro] = useState('pendente')
  const [modal, setModal] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [editRow, setEditRow] = useState<Parcela | null>(null)
  const [formEdit, setFormEdit] = useState({ vencimento: '', valor: 0, numero_boleto: '', data_pagamento: '', observacoes: '', status: 'pendente' })
  const [saving, setSaving] = useState(false)
  const sb = createClient()

  useEffect(() => { load() }, [unidadeAtiva, statusFiltro])

  async function load() {
    setLoading(true)
    let q = sb.from('btx_parcelas').select('*').eq('ativo', true).eq('tipo', 'pagar').order('vencimento')
    if (unidadeAtiva) q = q.eq('unidade', unidadeAtiva)
    if (statusFiltro !== 'todos') q = q.eq('status', statusFiltro)
    const { data } = await q
    setRows(data ?? [])
    setLoading(false)
  }

  async function marcarPago(r: Parcela) {
    await sb.from('btx_parcelas').update({ status: 'pago', data_pagamento: hoje() }).eq('id', r.id)
    load()
  }

  function openEdit(r: Parcela) {
    setEditRow(r)
    setFormEdit({ vencimento: r.vencimento, valor: r.valor, numero_boleto: r.numero_boleto ?? '', data_pagamento: r.data_pagamento ?? '', observacoes: r.observacoes ?? '', status: r.status })
    setModal(true)
  }

  async function saveEdit() {
    if (!editRow) return
    setSaving(true)
    await sb.from('btx_parcelas').update({
      vencimento: formEdit.vencimento, valor: formEdit.valor,
      numero_boleto: formEdit.numero_boleto || null,
      data_pagamento: formEdit.data_pagamento || null,
      observacoes: formEdit.observacoes || null,
      status: formEdit.status,
    }).eq('id', editRow.id)
    setSaving(false); setModal(false); load()
  }

  async function remove(id: string) {
    setSaving(true)
    await sb.from('btx_parcelas').update({ ativo: false }).eq('id', id)
    setSaving(false); setConfirm(null); load()
  }

  const hojeStr = hoje()
  const total = rows.reduce((a, r) => a + r.valor, 0)

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Parcelas a Pagar</h1><div className="page-subtitle">Contas a pagar — {rows.length} parcela(s) · {formatMoeda(total)}</div></div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['pendente','pago','cancelado','todos'] as const).map(s => (
            <button key={s} className={`btn btn-sm ${statusFiltro === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStatusFiltro(s)}>
              {s === 'todos' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Vencimento</th><th>Parcela</th><th>Valor</th><th>Boleto</th><th>Status</th><th>Pgto</th><th>Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="empty-state">Carregando...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={7} className="empty-state">Nenhuma parcela.</td></tr>
            : rows.map(r => {
              const vencida = r.status === 'pendente' && r.vencimento < hojeStr
              return (
                <tr key={r.id} style={vencida ? { background: 'rgba(192,57,43,0.04)' } : {}}>
                  <td className="mono" style={vencida ? { color: 'var(--red)', fontWeight: 600 } : {}}>{formatData(r.vencimento)}</td>
                  <td className="mono">#{r.numero_parcela}</td>
                  <td className="mono" style={{ fontWeight: 600 }}>{formatMoeda(r.valor)}</td>
                  <td className="mono">{r.numero_boleto ?? '—'}</td>
                  <td>
                    <span className={`badge ${r.status === 'pago' ? 'badge-green' : r.status === 'cancelado' ? 'badge-gray' : vencida ? 'badge-red' : 'badge-amber'}`}>
                      {r.status === 'pago' ? 'Pago' : r.status === 'cancelado' ? 'Cancelado' : vencida ? 'Vencida' : 'Pendente'}
                    </span>
                  </td>
                  <td className="mono">{formatData(r.data_pagamento)}</td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    {r.status === 'pendente' && <button className="btn btn-primary btn-sm" onClick={() => marcarPago(r)}>✓ Pago</button>}
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Editar</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirm(r.id)}>×</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Editar parcela" size="sm"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </>}
      >
        <div className="form-group">
          <label className="form-label">Vencimento</label>
          <input className="form-input" type="date" value={formEdit.vencimento} onChange={e => setFormEdit(f => ({...f, vencimento: e.target.value}))} />
        </div>
        <div className="form-group">
          <label className="form-label">Valor (R$)</label>
          <input className="form-input" type="number" step="0.01" value={formEdit.valor} onChange={e => setFormEdit(f => ({...f, valor: Number(e.target.value)}))} />
        </div>
        <div className="form-group">
          <label className="form-label">Nº Boleto/Doc</label>
          <input className="form-input" value={formEdit.numero_boleto} onChange={e => setFormEdit(f => ({...f, numero_boleto: e.target.value}))} />
        </div>
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-select" value={formEdit.status} onChange={e => setFormEdit(f => ({...f, status: e.target.value}))}>
            <option value="pendente">Pendente</option>
            <option value="pago">Pago</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Data pagamento</label>
          <input className="form-input" type="date" value={formEdit.data_pagamento} onChange={e => setFormEdit(f => ({...f, data_pagamento: e.target.value}))} />
        </div>
        <div className="form-group">
          <label className="form-label">Observações</label>
          <textarea className="form-input" rows={2} value={formEdit.observacoes} onChange={e => setFormEdit(f => ({...f, observacoes: e.target.value}))} />
        </div>
      </Modal>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove(confirm)} loading={saving} message="A parcela será marcada como inativa." />
    </div>
  )
}
