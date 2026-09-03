import type { VhsysClient } from '../client'
import { VHSYS_ZERO_DATE, isoDate, money } from '../normalizers'
import type { ImportedItem } from './shared'

interface VhsysOrderItem {
  id_produto?: number | string
  desc_produto?: string
  qtde_produto?: number | string
  valor_total_produto?: number | string
}

// Pedido válido: entregue/faturado (VHSYS: "Atendido"/"Faturado"), não cancelado,
// não na lixeira, com data a partir do marco zero.
const STATUS_OK = ['atendido', 'faturado', 'emitido', 'concluido', 'concluído']

function pedidoValido(order: Record<string, unknown>): boolean {
  const status = String(order.status_pedido ?? '').trim().toLocaleLowerCase('pt-BR')
  const lixeira = String(order.lixeira ?? 'Nao').trim().toLocaleLowerCase('pt-BR')
  const data = isoDate(order.data_pedido ?? order.data_emissao)
  return lixeira !== 'sim'
    && !status.includes('cancel')
    && STATUS_OK.some((s) => status.includes(s))
    && data !== null
    && data >= VHSYS_ZERO_DATE
}

export async function importVendas(client: VhsysClient): Promise<ImportedItem[]> {
  const orders = await client.list<Record<string, unknown>>('/pedidos')
  const selected = orders.filter(pedidoValido)

  return Promise.all(selected.map(async (order) => {
    const internalId = String(order.id_ped ?? order.id_pedido)
    const items = await client.list<VhsysOrderItem>(
      `/pedidos/${encodeURIComponent(internalId)}/produtos`,
    )

    return {
      domain: 'vendas' as const,
      externalId: String(order.id_pedido ?? order.id_ped),
      data: {
        numero_documento: String(
          order.numero_nfe ?? order.numero_nf ?? order.id_pedido ?? '',
        ),
        documento_pessoa: '',
        pessoa_nome: String(order.nome_cliente ?? ''),
        data: isoDate(order.data_pedido),
        cliente_vhsys_id: String(order.id_cliente ?? ''),
        valor_total: money(order.valor_total_nota),
        valor_st: money(order.valor_ST),
        status: String(order.status_pedido ?? ''),
        itens: items.map((item) => ({
          produto_vhsys_id: String(item.id_produto ?? ''),
          produto_nome: String(item.desc_produto ?? ''),
          quantidade: Number(item.qtde_produto ?? 0),
          valor: money(item.valor_total_produto),
        })),
      },
    }
  }))
}
