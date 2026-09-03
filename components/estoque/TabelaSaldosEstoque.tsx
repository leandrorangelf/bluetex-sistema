import { converterParaUnidadeMaior } from '@/lib/utils'
import type { SaldoProduto } from '@/lib/estoque'

interface Props {
  saldos: SaldoProduto[]
  produtoSelecionado?: string
  onSelectProduto?: (produtoId: string) => void
}

export default function TabelaSaldosEstoque({ saldos, produtoSelecionado, onSelectProduto }: Props) {
  const cx = (base: number, fator: number) => converterParaUnidadeMaior(base, fator)
  return (
    <section className="stock-panel">
      <div className="stock-panel-heading">
        <div><span className="stock-eyebrow">Posição consolidada</span><h2>Saldo por produto</h2></div>
        <span className="stock-panel-count">{saldos.length} produtos · caixas</span>
      </div>
      <div className="table-wrap">
        <table className="stock-balance-table">
          <thead><tr>
            <th>Produto</th>
            <th className="num">Inicial</th>
            <th className="num">Entrada</th>
            <th className="num">Saída</th>
            <th className="num">Ajustes</th>
            <th className="num">Saldo</th>
          </tr></thead>
          <tbody>
            {saldos.length === 0 ? <tr><td colSpan={6} className="empty-state">Nenhum produto encontrado.</td></tr> : saldos.map(item => {
              const ajustes = item.ajustesEntrada - item.ajustesSaida
              const selecionado = produtoSelecionado === item.produtoId
              return (
                <tr
                  key={item.produtoId}
                  className={onSelectProduto ? `stock-row-clickable${selecionado ? ' stock-row-selected' : ''}` : ''}
                  onClick={onSelectProduto ? () => onSelectProduto(selecionado ? '' : item.produtoId) : undefined}
                >
                  <td><strong>{item.produtoNome}</strong></td>
                  <td className="mono num">{cx(item.saldoInicioMes, item.fatorConversao)}</td>
                  <td className="mono num stock-positive">{item.compras ? `+${cx(item.compras, item.fatorConversao)}` : '—'}</td>
                  <td className="mono num stock-negative">{item.vendas ? `−${cx(item.vendas, item.fatorConversao)}` : '—'}</td>
                  <td className={`mono num ${ajustes < 0 ? 'stock-negative' : ajustes > 0 ? 'stock-positive' : ''}`}>{ajustes ? `${ajustes > 0 ? '+' : '−'}${cx(Math.abs(ajustes), item.fatorConversao)}` : '—'}</td>
                  <td className={`mono num stock-current ${item.saldoAtual < 0 ? 'stock-negative' : ''}`}>{cx(item.saldoAtual, item.fatorConversao)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
