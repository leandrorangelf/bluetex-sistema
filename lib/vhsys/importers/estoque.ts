import type { VhsysClient } from '../client'
import type { ImportedItem } from './shared'

export async function importEstoque(client: VhsysClient): Promise<ImportedItem[]> {
  const rows = await client.list<Record<string, unknown>>('/produtos')

  return rows
    .filter((row) =>
      String(row.status_produto).toLocaleLowerCase('pt-BR') === 'ativo'
      && String(row.lixeira ?? 'Nao').toLocaleLowerCase('pt-BR') !== 'sim',
    )
    .map((row) => ({
      domain: 'estoque',
      externalId: String(row.id_produto),
      data: {
        produto_vhsys_id: String(row.id_produto),
        produto_nome: String(row.desc_produto ?? ''),
        codigo_produto: String(row.cod_produto ?? ''),
        quantidade_atual: Number(row.estoque_produto ?? 0),
        consultado_em: new Date().toISOString(),
      },
    }))
}
