import type { VhsysClient } from '../client'
import { money } from '../normalizers'
import type { ImportedItem } from './shared'

export async function importBancos(client: VhsysClient): Promise<ImportedItem[]> {
  const rows = await client.list<Record<string, unknown>>('/contas-bancarias')

  return rows
    .filter((row) =>
      String(row.numero_banco) === '033'
      && String(row.status_banco).toLocaleLowerCase('pt-BR') === 'ativo',
    )
    .map((row) => ({
      domain: 'bancos',
      externalId: String(row.id_banco_cad),
      data: {
        numero_banco: '033',
        nome_banco: String(row.nome_banco_cad ?? 'Santander'),
        saldo_atual: money(row.saldo_atual),
        consultado_em: new Date().toISOString(),
      },
    }))
}
