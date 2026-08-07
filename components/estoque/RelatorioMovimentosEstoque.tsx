import { formatData } from '@/lib/utils'
import type { MovimentoEstoqueCalculado } from '@/lib/estoque'

interface Props {
  movimentos: MovimentoEstoqueCalculado[]
  onEditAjuste?: (id: string) => void
  onRemoveAjuste?: (id: string) => void
}
const ORIGEM = { compra: 'Compra', venda: 'Venda', ajuste: 'Ajuste manual' }
function qtd(valor: number) { return valor.toLocaleString('pt-BR') }

export default function RelatorioMovimentosEstoque({ movimentos, onEditAjuste, onRemoveAjuste }: Props) {
  const comAcoes = Boolean(onEditAjuste || onRemoveAjuste)
  return (
    <section className="stock-panel">
      <div className="stock-panel-heading">
        <div><span className="stock-eyebrow">Rastreabilidade</span><h2>Entradas e saídas</h2></div>
        <span className="stock-panel-count">{movimentos.length} movimentos</span>
      </div>
      <div className="table-wrap">
        <table className="stock-movement-table">
          <thead><tr><th>Data</th><th>Produto</th><th>Origem</th><th>Documento / motivo</th><th>Entrada</th><th>Saída</th><th>Saldo após</th>{comAcoes ? <th>Ações</th> : null}</tr></thead>
          <tbody>
            {movimentos.length === 0 ? <tr><td colSpan={comAcoes ? 8 : 7} className="empty-state">Nenhuma movimentação no período.</td></tr> : movimentos.map(item => (
              <tr key={`${item.origem}-${item.id}`}>
                <td className="mono">{formatData(item.data)}</td>
                <td><strong>{item.produtoNome}</strong></td>
                <td><span className={`stock-origin stock-origin-${item.origem}`}>{ORIGEM[item.origem]}</span></td>
                <td>{item.documento || item.descricao || '—'}</td>
                <td className="mono stock-positive">{item.tipo === 'entrada' ? `+${qtd(item.quantidade)}` : '—'}</td>
                <td className="mono stock-negative">{item.tipo === 'saida' ? `−${qtd(item.quantidade)}` : '—'}</td>
                <td className={`mono stock-current ${item.saldoApos < 0 ? 'stock-negative' : ''}`}>{qtd(item.saldoApos)}</td>
                {comAcoes ? <td>{item.origem === 'ajuste' ? <div className="stock-row-actions"><button className="btn btn-secondary btn-sm" onClick={() => onEditAjuste?.(item.id)}>Editar</button><button className="btn btn-danger btn-sm" onClick={() => onRemoveAjuste?.(item.id)}>Excluir</button></div> : '—'}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
