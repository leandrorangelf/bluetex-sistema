'use client'
import { useState } from 'react'
import { formatData, formatMoeda } from '@/lib/utils'
import type { MovimentacaoFinanceira, StatusMovimento } from '@/lib/financeiro'

interface Props {
  tipo: 'pagar' | 'receber'
  movimentacoes: MovimentacaoFinanceira[]
  diaSelecionado: string | null
  mobileActive?: boolean
  isAdmin?: boolean
  onRegistrarPagamento?: (parcelaId: string, saldoRestante: number) => void
  onEditarPagamento?: (movimento: MovimentacaoFinanceira) => void
  onExcluirPagamento?: (movimento: MovimentacaoFinanceira) => void
}

interface GrupoMovimentacao {
  parcelaId: string
  representante: MovimentacaoFinanceira
  data: string
  valorTotal: number
  valorPago: number
  saldoRestante: number
  status: StatusMovimento
  atrasada: boolean
  inconsistente: boolean
  pagamentos: MovimentacaoFinanceira[]
}

const ROTULOS_ORIGEM: Record<string, string> = {
  compra: 'Compra',
  venda: 'Venda',
  despesa: 'Despesa',
  manual: 'Manual',
}

function agruparPorParcela(movimentos: MovimentacaoFinanceira[]): GrupoMovimentacao[] {
  const grupos = new Map<string, GrupoMovimentacao>()

  for (const movimento of movimentos) {
    const ehPagamento = movimento.id !== movimento.parcela_id
    const existente = grupos.get(movimento.parcela_id)

    if (!existente) {
      grupos.set(movimento.parcela_id, {
        parcelaId: movimento.parcela_id,
        representante: movimento,
        data: movimento.data,
        valorTotal: movimento.valor_total,
        valorPago: ehPagamento ? movimento.valor : 0,
        saldoRestante: ehPagamento ? 0 : movimento.valor,
        status: movimento.status,
        atrasada: movimento.atrasada,
        inconsistente: movimento.inconsistente,
        pagamentos: ehPagamento ? [movimento] : [],
      })
      continue
    }

    if (ehPagamento) {
      existente.valorPago += movimento.valor
      existente.pagamentos.push(movimento)
    } else {
      existente.saldoRestante = movimento.valor
      existente.status = movimento.status
      existente.atrasada = movimento.atrasada
      existente.inconsistente = movimento.inconsistente
      existente.data = movimento.data
    }
  }

  for (const grupo of grupos.values()) {
    if (grupo.pagamentos.length > 0 && grupo.saldoRestante === 0) grupo.status = 'pago'
    grupo.pagamentos.sort((a, b) => a.data.localeCompare(b.data))
  }

  return [...grupos.values()].sort((a, b) => a.data.localeCompare(b.data) || a.parcelaId.localeCompare(b.parcelaId))
}

export default function ListaMovimentacoes({
  tipo,
  movimentacoes,
  diaSelecionado,
  mobileActive = false,
  isAdmin = false,
  onRegistrarPagamento,
  onEditarPagamento,
  onExcluirPagamento,
}: Props) {
  const [expandido, setExpandido] = useState<string | null>(null)
  const filtradas = movimentacoes.filter(movimento => (
    movimento.tipo === tipo && (!diaSelecionado || movimento.data === diaSelecionado)
  ))
  const grupos = agruparPorParcela(filtradas)
  const pagar = tipo === 'pagar'
  const titulo = pagar ? 'Contas a pagar' : 'Contas a receber'
  const valorPrefixo = pagar ? '−' : '+'

  return (
    <section
      className={`finance-panel finance-list-panel ${pagar ? 'payable' : 'receivable'}${mobileActive ? ' mobile-active' : ''}`}
      aria-label={titulo}
    >
      <header className="finance-panel-header">
        <h2>{titulo}</h2>
        <span>{grupos.length} {grupos.length === 1 ? 'lançamento' : 'lançamentos'}</span>
      </header>

      <div className="finance-movement-list">
        {grupos.length === 0 ? (
          <div className="finance-list-empty">
            {diaSelecionado ? 'Nenhuma movimentação neste dia.' : `Nenhuma conta a ${pagar ? 'pagar' : 'receber'} neste mês.`}
          </div>
        ) : grupos.map(grupo => {
          const movimento = grupo.representante
          const badge = grupo.inconsistente
            ? { text: 'Data inconsistente', className: 'badge-red' }
            : grupo.atrasada
              ? { text: 'Atrasada', className: 'badge-red' }
              : grupo.status === 'pago'
                ? { text: pagar ? 'Pago' : 'Recebido', className: 'badge-green' }
                : grupo.status === 'parcial'
                  ? { text: 'Parcial', className: 'badge-purple' }
                  : { text: 'Pendente', className: 'badge-amber' }
          const temLog = grupo.pagamentos.length > 0
          const estaExpandido = expandido === grupo.parcelaId

          return (
            <article key={grupo.parcelaId} className="finance-movement">
              <div className="finance-movement-topline">
                <strong title={movimento.descricao}>{movimento.descricao || `Parcela ${movimento.numero_parcela}`}</strong>
                <span className={`badge ${badge.className}`}>{badge.text}</span>
              </div>
              <div className="finance-movement-meta">
                <span>{formatData(grupo.data)} · {ROTULOS_ORIGEM[movimento.origem] ?? movimento.origem}</span>
                <strong>{valorPrefixo} {formatMoeda(grupo.saldoRestante || grupo.valorTotal)}</strong>
              </div>
              {(movimento.numero_boleto || movimento.observacoes) && (
                <div className="finance-movement-detail">
                  {movimento.numero_boleto ? `Doc. ${movimento.numero_boleto}` : movimento.observacoes}
                </div>
              )}
              {grupo.status === 'parcial' && (
                <div className="finance-movement-progress">
                  {formatMoeda(grupo.valorPago)} de {formatMoeda(grupo.valorTotal)} pago
                </div>
              )}
              <div className="finance-movement-actions">
                {isAdmin && grupo.status !== 'pago' && onRegistrarPagamento && (
                  <button className="btn btn-secondary btn-sm" onClick={() => onRegistrarPagamento(grupo.parcelaId, grupo.saldoRestante || grupo.valorTotal)}>
                    Registrar pagamento
                  </button>
                )}
                {temLog && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setExpandido(estaExpandido ? null : grupo.parcelaId)}>
                    {estaExpandido ? 'Ocultar histórico' : `Histórico (${grupo.pagamentos.length})`}
                  </button>
                )}
              </div>
              {temLog && estaExpandido && (
                <ul className="finance-payment-log">
                  {grupo.pagamentos.map(pagamento => (
                    <li key={pagamento.id}>
                      <span>{formatData(pagamento.data)} · {formatMoeda(pagamento.valor)}</span>
                      {isAdmin && (
                        <span className="finance-payment-log-actions">
                          {onEditarPagamento && <button className="btn btn-secondary btn-sm" onClick={() => onEditarPagamento(pagamento)}>Editar</button>}
                          {onExcluirPagamento && <button className="btn btn-danger btn-sm" onClick={() => onExcluirPagamento(pagamento)}>Excluir</button>}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
