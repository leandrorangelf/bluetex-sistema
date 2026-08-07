import type { PainelEstoque } from '@/lib/estoque'

interface Props { resumo: PainelEstoque['resumo'] }

function quantidade(valor: number) {
  return valor.toLocaleString('pt-BR')
}

export default function ResumoEstoque({ resumo }: Props) {
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
    </section>
  )
}
