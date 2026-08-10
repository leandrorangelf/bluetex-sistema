'use client'
import { useEffect, useState } from 'react'
import Modal from '@/components/Modal'
import { formatMoeda, hoje } from '@/lib/utils'

interface DadosPagamento {
  valor: number
  data: string
  observacoes: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSalvar: (dados: DadosPagamento) => void
  saldoRestante: number
  saving?: boolean
  valorInicial?: DadosPagamento
}

const VAZIO: DadosPagamento = { valor: 0, data: '', observacoes: '' }

export default function PagamentoModal({ open, onClose, onSalvar, saldoRestante, saving, valorInicial }: Props) {
  const [form, setForm] = useState<DadosPagamento>(VAZIO)

  useEffect(() => {
    if (!open) return
    setForm(valorInicial ?? { valor: saldoRestante, data: hoje(), observacoes: '' })
  }, [open, valorInicial, saldoRestante])

  const valor = Number(form.valor)
  const invalido = !form.data || valor <= 0 || valor > saldoRestante

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={valorInicial ? 'Editar pagamento' : 'Registrar pagamento'}
      size="sm"
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={invalido || saving} onClick={() => onSalvar(form)}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </>}
    >
      <div className="alert alert-amber">Saldo restante desta parcela: {formatMoeda(saldoRestante)}</div>
      <div className="form-group">
        <label className="form-label">Valor pago (R$)</label>
        <input className="form-input mono" type="number" step="0.01" value={form.valor}
          onChange={e => setForm(f => ({ ...f, valor: Number(e.target.value) }))} />
      </div>
      <div className="form-group">
        <label className="form-label">Data do pagamento</label>
        <input className="form-input" type="date" value={form.data}
          onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
      </div>
      <div className="form-group">
        <label className="form-label">Observações</label>
        <textarea className="form-input" rows={2} value={form.observacoes}
          onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
      </div>
    </Modal>
  )
}
