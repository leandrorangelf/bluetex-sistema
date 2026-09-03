'use client'

import { useMemo, useState } from 'react'
import { formatMoeda } from '@/lib/utils'
import type {
  SyncDecisao,
  VhsysSincronizacao,
  VhsysSincronizacaoItem,
} from '@/types'

type UiState =
  | 'idle'
  | 'analyzing'
  | 'review'
  | 'confirming'
  | 'done'
  | 'error'

interface SyncResponse {
  sync: VhsysSincronizacao
  items: VhsysSincronizacaoItem[]
}

interface Decision {
  decision: SyncDecisao
  localId?: string
}

const CLASS_LABELS: Record<string, string> = {
  novo: 'Novos',
  ja_vinculado: 'Já vinculados',
  correspondencia_exata: 'Correspondências exatas',
  possivel_duplicidade: 'Possíveis duplicidades',
  divergente: 'Divergentes',
  ignorado: 'Ignorados',
  erro: 'Erros',
}

function itemName(item: VhsysSincronizacaoItem): string {
  const data = item.dados_normalizados
  return String(
    data.pessoa_nome
    ?? data.produto_nome
    ?? data.nome_banco
    ?? data.numero_documento
    ?? `ID ${item.vhsys_id}`,
  )
}

function itemValue(item: VhsysSincronizacaoItem): string {
  const value = item.dados_normalizados.valor_total
    ?? item.dados_normalizados.saldo_atual
  return typeof value === 'number' ? formatMoeda(value) : '—'
}

export default function VhsysSyncClient() {
  const [state, setState] = useState<UiState>('idle')
  const [syncData, setSyncData] = useState<SyncResponse | null>(null)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [error, setError] = useState('')
  const [confirmArmed, setConfirmArmed] = useState(false)

  const total = syncData?.items.length ?? 0
  const counts = useMemo(() => {
    const result: Record<string, number> = {}
    for (const item of syncData?.items ?? []) {
      result[item.classificacao] = (result[item.classificacao] ?? 0) + 1
    }
    return result
  }, [syncData])

  const unresolved = useMemo(() =>
    (syncData?.items ?? []).filter((item) =>
      item.classificacao !== 'erro'
      && !(decisions[item.id]?.decision ?? item.decisao),
    ), [decisions, syncData])

  async function startAnalysis() {
    setState('analyzing')
    setError('')
    setConfirmArmed(false)
    try {
      const createResponse = await fetch('/api/vhsys/analyze', { method: 'POST' })
      const created = await createResponse.json() as { id?: string; error?: string }
      if (!createResponse.ok || !created.id) {
        throw new Error(created.error ?? 'Falha ao iniciar a análise.')
      }
      const detailResponse = await fetch(`/api/vhsys/sync/${created.id}`)
      const detail = await detailResponse.json() as SyncResponse & { error?: string }
      if (!detailResponse.ok) {
        throw new Error(detail.error ?? 'Falha ao carregar a análise.')
      }
      setSyncData(detail)
      setDecisions({})
      setState('review')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha inesperada.')
      setState('error')
    }
  }

  function choose(item: VhsysSincronizacaoItem, decision: SyncDecisao) {
    setDecisions((current) => ({
      ...current,
      [item.id]: {
        decision,
        localId: decision === 'vincular'
          ? item.local_id ?? undefined
          : undefined,
      },
    }))
    setConfirmArmed(false)
  }

  async function confirmSync() {
    if (!syncData || unresolved.length > 0) return
    if (!confirmArmed) {
      setConfirmArmed(true)
      return
    }

    setState('confirming')
    setError('')
    try {
      const payload = Object.entries(decisions).map(([itemId, decision]) => ({
        itemId,
        ...decision,
      }))
      const response = await fetch(
        `/api/vhsys/sync/${syncData.sync.id}/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decisions: payload }),
        },
      )
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Falha na confirmação.')
      setState('done')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha inesperada.')
      setState('error')
    }
  }

  if (state === 'idle') {
    return (
      <div className="card vhsys-intro">
        <h2>Analisar dados antes de importar</h2>
        <p>
          A consulta não altera o VHSYS nem os lançamentos deste sistema.
          Você verá novos registros, vínculos e conflitos antes de confirmar.
        </p>
        <button className="btn btn-primary" onClick={startAnalysis}>
          Sincronizar agora
        </button>
      </div>
    )
  }

  if (state === 'analyzing') {
    return (
      <div className="card vhsys-loading" role="status">
        Consultando vendas, contas, estoque e Santander…
      </div>
    )
  }

  if (state === 'done') {
    return (
      <div>
        <div className="alert alert-green">
          Sincronização confirmada e registrada.
        </div>
        <button className="btn btn-secondary" onClick={startAnalysis}>
          Analisar novamente
        </button>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div>
        <div className="alert alert-red">{error}</div>
        <button className="btn btn-secondary" onClick={startAnalysis}>
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div className="vhsys-review">
      <div className="vhsys-review-head">
        <div>
          <strong>{total} registros analisados</strong>
          <span>
            {unresolved.length === 0
              ? 'Pronto para confirmar'
              : `${unresolved.length} aguardando decisão`}
          </span>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={startAnalysis}>
          Refazer análise
        </button>
      </div>

      <div className="vhsys-summary" aria-label="Resumo da análise">
        {Object.entries(CLASS_LABELS).map(([key, label]) => (
          <div className="vhsys-summary-item" key={key}>
            <span>{label}</span>
            <strong>{counts[key] ?? 0}</strong>
          </div>
        ))}
      </div>

      {syncData?.items.some((item) => !item.decisao && item.classificacao !== 'erro') ? (
        <section className="card vhsys-conflicts">
          <h2>Revisão necessária</h2>
          <p>Escolha o tratamento para cada item antes de confirmar.</p>
          <div className="vhsys-conflict-list">
            {syncData.items
              .filter((item) => !item.decisao && item.classificacao !== 'erro')
              .map((item) => (
                <article className="vhsys-conflict-row" key={item.id}>
                  <div>
                    <span className="badge badge-amber">
                      {CLASS_LABELS[item.classificacao]}
                    </span>
                    <strong>{itemName(item)}</strong>
                    <small>{item.dominio} · {itemValue(item)}</small>
                  </div>
                  <div className="vhsys-decisions">
                    {item.local_id ? (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => choose(item, 'vincular')}
                      >
                        Vincular ao existente
                      </button>
                    ) : null}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => choose(item, 'importar')}
                    >
                      Importar separado
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => choose(item, 'ignorar')}
                    >
                      Ignorar
                    </button>
                    {decisions[item.id] ? (
                      <span className="badge badge-green">
                        Decisão: {decisions[item.id].decision}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
          </div>
        </section>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Domínio</th>
              <th>Registro</th>
              <th>Classificação</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {syncData?.items.map((item) => (
              <tr key={item.id}>
                <td>{item.dominio}</td>
                <td>{itemName(item)}</td>
                <td>
                  <span className={`badge ${
                    item.classificacao === 'erro'
                      ? 'badge-red'
                      : item.classificacao === 'novo'
                        ? 'badge-purple'
                        : 'badge-gray'
                  }`}>
                    {CLASS_LABELS[item.classificacao]}
                  </span>
                </td>
                <td className="mono">{itemValue(item)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? <div className="alert alert-red">{error}</div> : null}
      {confirmArmed ? (
        <div className="alert alert-amber">
          Confirme novamente para gravar os dados aprovados.
        </div>
      ) : null}
      <div className="vhsys-actions">
        <button
          className="btn btn-primary"
          disabled={unresolved.length > 0 || state === 'confirming'}
          onClick={confirmSync}
        >
          {state === 'confirming'
            ? 'Confirmando…'
            : confirmArmed
              ? 'Confirmar agora'
              : 'Confirmar sincronização'}
        </button>
      </div>
    </div>
  )
}
