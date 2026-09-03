import type { VhsysClient } from '../client'
import { includeAccount, isoDate, money } from '../normalizers'
import type { ImportedItem } from './shared'

export async function importReceber(client: VhsysClient): Promise<ImportedItem[]> {
  const rows = await client.list<Record<string, unknown>>('/contas-receber')

  return rows.map((row) => {
    const aberto = includeAccount(row.liquidado_rec)
    return {
      domain: 'receber',
      externalId: String(row.id_conta_rec),
      data: {
        numero_documento: String(row.n_documento_rec ?? ''),
        documento_pessoa: '',
        pessoa_nome: String(row.nome_cliente ?? ''),
        pessoa_vhsys_id: String(row.id_cliente ?? ''),
        data: isoDate(row.data_emissao),
        vencimento: isoDate(row.vencimento_rec),
        valor_total: money(row.valor_rec),
        valor_pago: money(row.valor_pago),
        status: aberto ? 'pendente' : 'pago',
        liquidado: !aberto,
        observacoes: String(row.observacoes_rec ?? ''),
      },
    }
  })
}

export async function importPagar(client: VhsysClient): Promise<ImportedItem[]> {
  const rows = await client.list<Record<string, unknown>>('/contas-pagar')

  return rows.map((row) => {
    const aberto = includeAccount(row.liquidado_pag)
    return {
      domain: 'pagar',
      externalId: String(row.id_conta_pag),
      data: {
        numero_documento: String(row.n_documento_pag ?? ''),
        documento_pessoa: '',
        pessoa_nome: String(row.nome_fornecedor ?? row.nome_conta ?? ''),
        pessoa_vhsys_id: String(row.id_fornecedor ?? ''),
        data: isoDate(row.data_emissao),
        vencimento: isoDate(row.vencimento_pag),
        valor_total: money(row.valor_pag),
        valor_pago: money(row.valor_pago),
        status: aberto ? 'pendente' : 'pago',
        liquidado: !aberto,
        observacoes: String(row.observacoes_pag ?? ''),
      },
    }
  })
}
