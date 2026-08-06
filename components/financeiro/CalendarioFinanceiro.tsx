import { formatData, formatMoeda, getMesAnoLabel } from '@/lib/utils'
import type { DiaFinanceiro } from '@/lib/financeiro'

interface Props {
  ano: number
  mes: number
  dias: DiaFinanceiro[]
  hoje: string
  diaSelecionado: string | null
  onSelectDia: (data: string | null) => void
}

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const compact = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

function moedaCompacta(valor: number) {
  return compact.format(valor)
}

export default function CalendarioFinanceiro({
  ano,
  mes,
  dias,
  hoje,
  diaSelecionado,
  onSelectDia,
}: Props) {
  const deslocamento = new Date(ano, mes - 1, 1).getDay()
  const selecionado = dias.find(dia => dia.data === diaSelecionado) ?? null

  return (
    <section className="finance-panel finance-calendar-panel" aria-label="Calendário de saldo diário">
      <header className="finance-panel-header">
        <h2>{getMesAnoLabel(mes, ano)}</h2>
        <span>Realizado + projetado</span>
      </header>

      <div className="finance-calendar-grid">
        {SEMANA.map(nome => <div key={nome} className="finance-weekday">{nome}</div>)}
        {Array.from({ length: deslocamento }, (_, index) => (
          <div key={`empty-${index}`} className="finance-day-empty" aria-hidden="true" />
        ))}
        {dias.map(dia => {
          const temEntrada = dia.entradas > 0
          const temSaida = dia.saidas > 0
          const classes = [
            'finance-day',
            temEntrada && temSaida ? 'has-both' : temEntrada ? 'has-in' : temSaida ? 'has-out' : '',
            dia.saldoFinal < 0 ? 'negative' : '',
            dia.data === diaSelecionado ? 'selected' : '',
            dia.data === hoje ? 'today' : '',
          ].filter(Boolean).join(' ')
          const movimentos = [
            temEntrada ? `entradas ${formatMoeda(dia.entradas)}` : '',
            temSaida ? `saídas ${formatMoeda(dia.saidas)}` : '',
          ].filter(Boolean).join(', ')

          return (
            <button
              type="button"
              key={dia.data}
              className={classes}
              onClick={() => onSelectDia(diaSelecionado === dia.data ? null : dia.data)}
              aria-pressed={diaSelecionado === dia.data}
              aria-label={`${formatData(dia.data)}; ${movimentos || 'sem movimentações'}; saldo ${formatMoeda(dia.saldoFinal)}`}
            >
              <span className="finance-day-number">{dia.dia}</span>
              <span className="finance-day-movements">
                {temEntrada && <span className="finance-day-in">+{moedaCompacta(dia.entradas)}</span>}
                {temSaida && <span className="finance-day-out">−{moedaCompacta(dia.saidas)}</span>}
              </span>
              <strong className="finance-day-balance">{moedaCompacta(dia.saldoFinal)}</strong>
            </button>
          )
        })}
      </div>

      <footer className="finance-calendar-footer">
        {selecionado ? (
          <>
            <div>
              <span>Dia selecionado · {formatData(selecionado.data)}</span>
              <small>Entradas {formatMoeda(selecionado.entradas)} · Saídas {formatMoeda(selecionado.saidas)}</small>
            </div>
            <strong>Saldo {formatMoeda(selecionado.saldoFinal)}</strong>
            <button type="button" onClick={() => onSelectDia(null)}>Ver mês inteiro</button>
          </>
        ) : (
          <span>Selecione um dia para ver somente suas movimentações.</span>
        )}
      </footer>
    </section>
  )
}
