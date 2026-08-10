import { formatMoeda } from '@/lib/utils'
import type { ResumoFinanceiro as Resumo } from '@/lib/financeiro'

interface Props {
  resumo: Resumo
  isAdmin?: boolean
  onAjustarSaldo?: () => void
}

const ITENS = [
  { key: 'saldoInicial', label: 'Saldo em banco', tone: '' },
  { key: 'totalSaidas', label: 'Saídas do mês', tone: 'out' },
  { key: 'totalEntradas', label: 'Entradas do mês', tone: 'in' },
  { key: 'saldoFinal', label: 'Saldo final projetado', tone: 'final' },
] as const

export default function ResumoFinanceiro({ resumo, isAdmin, onAjustarSaldo }: Props) {
  return (
    <section className="finance-summary" aria-label="Resumo financeiro do mês">
      {ITENS.map(item => {
        const valor = resumo[item.key]
        const negativo = valor < 0
        const tone = item.tone === 'final' && negativo ? 'final negative' : item.tone
        const ehSaldoBanco = item.key === 'saldoInicial'

        return (
          <div key={item.key} className={`finance-stat ${tone}`.trim()}>
            <div className="finance-stat-topline">
              <span className="finance-stat-label">{item.label}</span>
              {ehSaldoBanco && isAdmin && onAjustarSaldo && (
                <button className="finance-stat-adjust" onClick={onAjustarSaldo} aria-label="Ajustar saldo em banco">
                  Ajustar
                </button>
              )}
            </div>
            <strong className="finance-stat-value">{formatMoeda(valor)}</strong>
          </div>
        )
      })}
    </section>
  )
}
