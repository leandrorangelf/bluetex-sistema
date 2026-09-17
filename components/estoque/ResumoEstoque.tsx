import type { PainelEstoque } from '@/lib/estoque'
import { formatMoeda } from '@/lib/utils'

interface Props { resumo: PainelEstoque['resumo']; valorEstoque?: number }

function quantidade(valor: number) {
  return valor.toLocaleString('pt-BR')
}

export default function ResumoEstoque({ resumo, valorEstoque }: Props) {
  const cards = [
    ['Produtos', resumo.produtos, 'stock-summary-neutral'],
    ['Entradas do mês', resumo.entradas, 'stock-summary-in'],
    ['Saídas do mês', resumo.saidas, 'stock-summary-out'],
    ['Saldo atual', resumo.saldoAtual, resumo.saldoAtual < 0 ? 'stock-summary-negative' : 'stock-summary-balance'],
  ] as const

  return (
    <section className="stock-summary-grid" aria-label="Resumo do estoque">
      {cards.map(([rotulo, valor, classe]) => (
        <article className={`stock-summary-card ${classe}`} key={rotulo}>
          <span>{rotulo}</span>
          <strong>{quantidade(valor)}</strong>
          <small>unidades base</small>
        </article>
      ))}
      {valorEstoque != null && (
        <article className="stock-summary-card stock-summary-valor">
          <span>Valor de estoque</span>
          <strong>{formatMoeda(valorEstoque)}</strong>
          <small>a preço médio de venda</small>
        </article>
      )}
    </section>
  )
}
