'use client'

import { useState } from 'react'
import { VHSYS_UNIDADES } from '@/lib/vhsys/unidades'

type UiState = 'idle' | 'running' | 'done' | 'error'

interface AutoResult {
  syncId: string
  totalItens: number
  domains: Record<string, string>
}

const DOMAIN_LABEL: Record<string, string> = {
  vendas: 'Vendas',
  compras: 'Compras (notas de entrada)',
  receber: 'Contas a receber (boletos da venda)',
  estoque: 'Estoque',
}

export default function VhsysSyncClient() {
  const [unidade, setUnidade] = useState(VHSYS_UNIDADES[0].codigo)
  const [state, setState] = useState<UiState>('idle')
  const [result, setResult] = useState<AutoResult | null>(null)
  const [error, setError] = useState('')

  async function sincronizar() {
    setState('running')
    setError('')
    try {
      const response = await fetch('/api/vhsys/sync-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unidade }),
      })
      const body = await response.json() as AutoResult & { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Falha na sincronização.')
      setResult(body)
      setState('done')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha inesperada.')
      setState('error')
    }
  }

  return (
    <div className="card vhsys-intro">
      <h2>Sincronizar com o VHSYS</h2>
      <p>
        Traz o que é novo e atualiza o que já veio: vendas, notas de compra,
        estoque e os boletos a receber gerados pela venda. Contas a pagar e
        saldo bancário são lançados manualmente por cada unidade. Não altera
        o VHSYS.
      </p>

      <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 700 }}>Unidade</label>
      <select
        className="input"
        value={unidade}
        onChange={(e) => setUnidade(e.target.value)}
        disabled={state === 'running'}
        style={{ maxWidth: 280, marginBottom: 12 }}
      >
        {VHSYS_UNIDADES.map((u) => (
          <option key={u.codigo} value={u.codigo}>{u.unidade}</option>
        ))}
      </select>

      <div>
        <button
          className="btn btn-primary"
          onClick={sincronizar}
          disabled={state === 'running'}
        >
          {state === 'running' ? 'Sincronizando…' : 'Sincronizar agora'}
        </button>
      </div>

      {state === 'error' && (
        <div className="alert alert-red" style={{ marginTop: 16 }}>{error}</div>
      )}

      {state === 'done' && result && (
        <div style={{ marginTop: 16 }}>
          <div className="alert alert-green">
            Sincronização concluída — {result.totalItens} registros processados.
          </div>
          <div className="vhsys-summary">
            {Object.entries(result.domains).map(([dominio, status]) => (
              <div className="vhsys-summary-item" key={dominio}>
                <span>{DOMAIN_LABEL[dominio] ?? dominio}</span>
                <strong style={{ color: status === 'concluido' ? 'var(--green)' : 'var(--red)' }}>
                  {status === 'concluido' ? 'OK' : 'falhou'}
                </strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
