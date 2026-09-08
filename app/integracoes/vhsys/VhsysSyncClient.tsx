'use client'

import { useState } from 'react'

type UiState = 'idle' | 'running' | 'done' | 'error'

interface AutoResult {
  syncId: string
  totalItens: number
  domains: Record<string, string>
}

const DOMAIN_LABEL: Record<string, string> = {
  vendas: 'Vendas',
  compras: 'Compras',
  receber: 'Contas a receber',
  pagar: 'Contas a pagar',
  bancos: 'Saldo Santander',
  estoque: 'Estoque',
}

export default function VhsysSyncClient() {
  const [state, setState] = useState<UiState>('idle')
  const [result, setResult] = useState<AutoResult | null>(null)
  const [error, setError] = useState('')

  async function sincronizar() {
    setState('running')
    setError('')
    try {
      const response = await fetch('/api/vhsys/sync-auto', { method: 'POST' })
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
        Traz o que é novo, atualiza o que já veio (inclusive baixas feitas no
        VHSYS) e mantém contas a receber, contas a pagar e o saldo do Santander
        espelhados. Não altera o VHSYS.
      </p>

      <button
        className="btn btn-primary"
        onClick={sincronizar}
        disabled={state === 'running'}
      >
        {state === 'running' ? 'Sincronizando…' : 'Sincronizar agora'}
      </button>

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
