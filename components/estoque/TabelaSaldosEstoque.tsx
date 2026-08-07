import { converterParaUnidadeMaior } from '@/lib/utils'
import type { SaldoProduto } from '@/lib/estoque'

interface Props { saldos: SaldoProduto[] }

function qtd(valor: number) { return valor.toLocaleString('pt-BR') }

export default function TabelaSaldosEstoque({ saldos }: Props) {
  return (
    <section className="stock-panel">
      <div className="stock-panel-heading">
        <div><span className="stock-eyebrow">Posição consolidada</span><h2>Saldo por produto</h2></div>
        <span className="stock-panel-count">{saldos.length} produtos</span>
      </div>
      <div className="table-wrap">
        <table className="stock-balance-table">
          <thead><tr><th>Produto</th><th>Saldo inicial</th><th>Compras</th><th>Vendas</th><th>Ajustes</th><th>Saldo atual</th><th>Equivalente</th></tr></thead>
          <tbody>
            {saldos.length === 0 ? <tr><td colSpan={7} className="empty-state">Nenhum produto encontrado.</td></tr> : saldos.map(item => {
              const ajustes = item.ajustesEntrada - item.ajustesSaida
              return (
                <tr key={item.produtoId}>
                  <td><strong>{item.produtoNome}</strong><small className="stock-unit-caption">{item.unidadeBase ?? 'unidade base'}</small></td>
                  <td className="mono">{qtd(item.saldoInicioMes)}</td>
                  <td className="mono stock-positive">+{qtd(item.compras)}</td>
                  <td className="mono stock-negative">−{qtd(item.vendas)}</td>
                  <td className={`mono ${ajustes < 0 ? 'stock-negative' : ajustes > 0 ? 'stock-positive' : ''}`}>{ajustes > 0 ? '+' : ''}{qtd(ajustes)}</td>
                  <td className={`mono stock-current ${item.saldoAtual < 0 ? 'stock-negative' : ''}`}>{qtd(item.saldoAtual)}</td>
                  <td className="mono">{converterParaUnidadeMaior(item.saldoAtual, item.fatorConversao)} {item.unidadeMaior ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
