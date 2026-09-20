export type SituacaoVenda = 'pago' | 'parcial' | 'pendente' | 'não conciliado'

// Casa NF do extrato de vendas (btx_vhsys_registro_vendas, só relatório) com
// o status real das parcelas a receber já cadastradas (btx_parcelas), via
// btx_vendas.numero_nf — nunca inventa "quitado": sem parcela encontrada pra
// aquela NF, fica "não conciliado".
export function calcularSituacaoPorNf(
  vendas: { id: string; numero_nf: string | null }[],
  parcelas: { origem_id: string; status: string }[],
): Map<string, SituacaoVenda> {
  const statusPorVendaId = new Map<string, string[]>()
  for (const p of parcelas) {
    if (p.status === 'cancelado') continue
    const lista = statusPorVendaId.get(p.origem_id) ?? []
    lista.push(p.status)
    statusPorVendaId.set(p.origem_id, lista)
  }
  const situacaoPorNf = new Map<string, SituacaoVenda>()
  for (const v of vendas) {
    if (!v.numero_nf) continue
    const status = statusPorVendaId.get(v.id)
    if (!status || status.length === 0) continue
    const situacao: SituacaoVenda = status.every(s => s === 'pago') ? 'pago'
      : status.some(s => s === 'pago' || s === 'parcial') ? 'parcial'
      : 'pendente'
    situacaoPorNf.set(v.numero_nf, situacao)
  }
  return situacaoPorNf
}
