import type { VhsysClient } from '../client'
import { isoDate, money, VHSYS_ZERO_DATE } from '../normalizers'
import type { ImportedItem } from './shared'

interface VhsysPurchaseItem {
  id_produto?: number | string
  desc_produto?: string
  qtde_produto?: number | string
  valor_total_produto?: number | string
}

export async function importCompras(client: VhsysClient): Promise<ImportedItem[]> {
  const entries = await client.list<Record<string, unknown>>('/entradas-mercadoria')
  const selected = entries.filter((entry) => {
    const date = isoDate(entry.data_entrada ?? entry.data_pedido)
    const status = String(entry.status_entrada ?? entry.status_pedido ?? '')
      .toLocaleLowerCase('pt-BR')
    return date !== null && date >= VHSYS_ZERO_DATE && !status.includes('cancel')
  })

  return Promise.all(selected.map(async (entry) => {
    const externalId = String(entry.id_entrada_merc ?? entry.id_entrada)
    const items = await client.list<VhsysPurchaseItem>(
      `/entradas-mercadoria/${encodeURIComponent(externalId)}/produtos`,
    )
    return {
      domain: 'compras' as const,
      externalId,
      data: {
        numero_documento: String(entry.numero_nf ?? entry.n_documento ?? externalId),
        documento_pessoa: '',
        pessoa_nome: String(entry.nome_fornecedor ?? entry.nome_cliente ?? ''),
        fornecedor_vhsys_id: String(entry.id_fornecedor ?? entry.id_cliente ?? ''),
        data: isoDate(entry.data_entrada ?? entry.data_pedido),
        valor_total: money(entry.valor_total_nota ?? entry.valor_total),
        valor_st: money(entry.valor_ST),
        status: String(entry.status_entrada ?? entry.status_pedido ?? ''),
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
