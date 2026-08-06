import { formatMoeda } from '@/lib/utils'
import type { ResumoFinanceiro as Resumo } from '@/lib/financeiro'

interface Props {
  resumo: Resumo
}

const ITENS = [
  { key: 'saldoInicial', label: 'Saldo inicial', tone: '' },
  { key: 'totalSaidas', label: 'Saídas do mês', tone: 'out' },
  { key: 'totalEntradas', label: 'Entradas do mês', tone: 'in' },
  { key: 'saldoFinal', label: 'Saldo final projetado', tone: 'final' },
] as const

export default function ResumoFinanceiro({ resumo }: Props) {
  return (
    <section className="finance-summary" aria-label="Resumo financeiro do mês">
      {ITENS.map(item => {
        const valor = resumo[item.key]
        const negativo = valor < 0
        const tone = item.tone === 'final' && negativo ? 'final negative' : item.tone

        return (
          <div key={item.key} className={`finance-stat ${tone}`.trim()}>
            <span className="finance-stat-label">{item.label}</span>
            <strong className="finance-stat-value">{formatMoeda(valor)}</strong>
          </div>
        )
      })}
    </section>
  )
}
