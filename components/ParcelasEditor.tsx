'use client'
import { formatData } from '@/lib/utils'
import type { TipoParcela } from '@/types'

export interface ParcelaForm {
  numero_parcela: number
  vencimento: string
  valor: number
  numero_boleto: string
  observacoes: string
}

interface Props {
  parcelas: ParcelaForm[]
  onChange: (p: ParcelaForm[]) => void
  tipo: TipoParcela
}

const EMPTY_PARCELA: ParcelaForm = { numero_parcela: 1, vencimento: '', valor: 0, numero_boleto: '', observacoes: '' }

export default function ParcelasEditor({ parcelas, onChange, tipo }: Props) {
  function add() {
    onChange([...parcelas, { ...EMPTY_PARCELA, numero_parcela: parcelas.length + 1 }])
  }
  function remove(i: number) {
    onChange(parcelas.filter((_, idx) => idx !== i).map((p, idx) => ({ ...p, numero_parcela: idx + 1 })))
  }
  function update(i: number, field: keyof ParcelaForm, value: string | number) {
    onChange(parcelas.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
          Parcelas {tipo === 'pagar' ? 'a pagar' : 'a receber'}
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={add}>+ Parcela</button>
      </div>
      {parcelas.length === 0 && (
        <div className="text-muted" style={{ textAlign: 'center', padding: '12px 0', fontSize: 13 }}>
          Nenhuma parcela. Clique em &quot;+ Parcela&quot; para adicionar.
        </div>
      )}
      {parcelas.map((p, i) => (
        <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px', marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Parcela {p.numero_parcela}</span>
            <button type="button" onClick={() => remove(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
          <div className="grid-2">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Vencimento</label>
              <input className="form-input" type="date" value={p.vencimento} onChange={e => update(i, 'vencimento', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Valor (R$)</label>
              <input className="form-input" type="number" step="0.01" min={0} value={p.valor} onChange={e => update(i, 'valor', Number(e.target.value))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Nº Boleto/Doc</label>
              <input className="form-input" value={p.numero_boleto} onChange={e => update(i, 'numero_boleto', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Observações</label>
              <input className="form-input" value={p.observacoes} onChange={e => update(i, 'observacoes', e.target.value)} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
