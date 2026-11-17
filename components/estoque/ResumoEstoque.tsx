import type { PainelEstoque, SaldoProduto } from '@/lib/estoque'
import { formatMoeda } from '@/lib/utils'

interface Props { resumo: PainelEstoque['resumo']; valorEstoque?: number; saldos?: SaldoProduto[] }

function numero(valor: number) {
  return Number(valor.toFixed(2)).toLocaleString('pt-BR')
}

export default function ResumoEstoque({ resumo, valorEstoque, saldos }: Props) {
  // com os saldos por produto dá pra somar em caixas (cada produto tem o seu fator); sem eles, cai em unidades base
  const emCaixas = (valor: (s: SaldoProduto) => number) => (saldos ?? []).reduce((total, s) => total + valor(s) / (s.fatorConversao || 1), 0)
  const unidade = saldos ? 'caixas' : 'unidades base'
  const entradas = saldos ? emCaixas(s => s.compras + s.ajustesEntrada) : resumo.entradas
  const saidas = saldos ? emCaixas(s => s.vendas + s.ajustesSaida) : resumo.saidas
  const saldoAtual = saldos ? emCaixas(s => s.saldoAtual) : resumo.saldoAtual

  return (
    <section className="stock-summary-grid" aria-label="Resumo do estoque">
      {valorEstoque != null && (
        <article className="stock-summary-card stock-summary-valor">
          <span>Valor de estoque</span>
          <strong>{formatMoeda(valorEstoque)}</strong>
          <small>a preço médio de venda</small>
        </article>
      )}
      <article className="stock-summary-card">
        <span>Saldo atual</span>
        <strong className={saldoAtual < 0 ? 'stock-negative' : undefined}>{numero(saldoAtual)}</strong>
        <small>{unidade}</small>
      </article>
      <article className="stock-summary-card">
        <span>Entradas do mês</span>
        <strong className={entradas === 0 ? 'stock-zero' : 'stock-positive'}>{numero(entradas)}</strong>
        <small>{unidade}</small>
      </article>
      <article className="stock-summary-card">
        <span>Saídas do mês</span>
        <strong className={saidas === 0 ? 'stock-zero' : 'stock-negative'}>{numero(saidas)}</strong>
        <small>{unidade}</small>
      </article>
    </section>
  )
}
