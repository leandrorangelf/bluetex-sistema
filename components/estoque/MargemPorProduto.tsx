import { formatMoeda } from '@/lib/utils'
import { precoPorPacote, type SaldoProduto } from '@/lib/estoque'

interface Props {
  saldos: SaldoProduto[]
  precoMedioCompra: Map<string, number>
  precoMedioVenda: Map<string, number>
}

// Custo (nota de entrada da fábrica/fornecedor) x venda, por pacote — não é
// unidade cadastrada no sistema, é preço por carteira × 10 (confirmado com o
// cliente). Só entra produto com pelo menos um dos dois preços conhecidos.
export default function MargemPorProduto({ saldos, precoMedioCompra, precoMedioVenda }: Props) {
  const linhas = saldos
    .map(s => ({
      produtoId: s.produtoId,
      produtoNome: s.produtoNome,
      custoPacote: precoMedioCompra.has(s.produtoId) ? precoPorPacote(precoMedioCompra.get(s.produtoId)!) : null,
      vendaPacote: precoMedioVenda.has(s.produtoId) ? precoPorPacote(precoMedioVenda.get(s.produtoId)!) : null,
    }))
    .filter(l => l.custoPacote !== null || l.vendaPacote !== null)

  if (linhas.length === 0) return null

  return (
    <section className="stock-panel">
      <div className="stock-panel-heading">
        <div><span className="stock-eyebrow">Nota de entrada × venda</span><h2>Custo e margem por pacote</h2></div>
        <span className="stock-panel-count">{linhas.length} produtos</span>
      </div>
      <div className="table-wrap">
        <table className="stock-balance-table">
          <thead><tr>
            <th>Produto</th>
            <th className="num">Custo/pacote</th>
            <th className="num">Venda/pacote</th>
            <th className="num">Margem</th>
          </tr></thead>
          <tbody>
            {linhas.map(l => {
              const margem = l.custoPacote != null && l.vendaPacote != null ? l.vendaPacote - l.custoPacote : null
              const margemPct = margem != null && l.vendaPacote ? (margem / l.vendaPacote) * 100 : null
              return (
                <tr key={l.produtoId}>
                  <td><strong>{l.produtoNome}</strong></td>
                  <td className="mono num">{l.custoPacote != null ? formatMoeda(l.custoPacote) : '—'}</td>
                  <td className="mono num">{l.vendaPacote != null ? formatMoeda(l.vendaPacote) : '—'}</td>
                  <td className={`mono num ${margem != null ? (margem >= 0 ? 'stock-positive' : 'stock-negative') : ''}`}>
                    {margem != null ? `${formatMoeda(margem)} (${margemPct!.toFixed(0)}%)` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
