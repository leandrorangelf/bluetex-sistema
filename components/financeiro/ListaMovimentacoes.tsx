import { formatData, formatMoeda } from '@/lib/utils'
import type { MovimentacaoFinanceira } from '@/lib/financeiro'

interface Props {
  tipo: 'pagar' | 'receber'
  movimentacoes: MovimentacaoFinanceira[]
  diaSelecionado: string | null
  mobileActive?: boolean
}

const ROTULOS_ORIGEM: Record<string, string> = {
  compra: 'Compra',
  venda: 'Venda',
  despesa: 'Despesa',
  manual: 'Manual',
}

export default function ListaMovimentacoes({
  tipo,
  movimentacoes,
  diaSelecionado,
  mobileActive = false,
}: Props) {
  const filtradas = movimentacoes.filter(movimento => (
    movimento.tipo === tipo && (!diaSelecionado || movimento.data === diaSelecionado)
  ))
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
        <span>{filtradas.length} {filtradas.length === 1 ? 'lançamento' : 'lançamentos'}</span>
      </header>

      <div className="finance-movement-list">
        {filtradas.length === 0 ? (
          <div className="finance-list-empty">
            {diaSelecionado ? 'Nenhuma movimentação neste dia.' : `Nenhuma conta a ${pagar ? 'pagar' : 'receber'} neste mês.`}
          </div>
        ) : filtradas.map(movimento => {
          const badge = movimento.inconsistente
            ? { text: 'Data inconsistente', className: 'badge-red' }
            : movimento.atrasada
              ? { text: 'Atrasada', className: 'badge-red' }
              : movimento.status === 'pago'
                ? { text: pagar ? 'Pago' : 'Recebido', className: 'badge-green' }
                : { text: 'Pendente', className: 'badge-amber' }

          return (
            <article key={movimento.id} className="finance-movement">
              <div className="finance-movement-topline">
                <strong title={movimento.descricao}>{movimento.descricao || `Parcela ${movimento.numero_parcela}`}</strong>
                <span className={`badge ${badge.className}`}>{badge.text}</span>
              </div>
              <div className="finance-movement-meta">
                <span>{formatData(movimento.data)} · {ROTULOS_ORIGEM[movimento.origem] ?? movimento.origem}</span>
                <strong>{valorPrefixo} {formatMoeda(movimento.valor)}</strong>
              </div>
              {(movimento.numero_boleto || movimento.observacoes) && (
                <div className="finance-movement-detail">
                  {movimento.numero_boleto ? `Doc. ${movimento.numero_boleto}` : movimento.observacoes}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
