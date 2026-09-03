import type { VhsysClient } from '../client'
import { VHSYS_ZERO_DATE, includeAccount, isoDate, money } from '../normalizers'
import type { ImportedItem } from './shared'

// ponytail: só traz título aberto com vencimento a partir do marco zero e valor
// relevante. A conta VHSYS acumula resíduos de centavos (juro/multa/arredondamento)
// marcados "em aberto" há anos — sem esse corte, entram todos como conta vencida.
const VALOR_MINIMO = 1

function first(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] != null && row[key] !== '') return row[key]
  }
  return undefined
}

export async function importReceber(client: VhsysClient): Promise<ImportedItem[]> {
  const rows = await client.list<Record<string, unknown>>('/contas-receber')

  return rows.flatMap((row) => {
    const aberto = includeAccount(first(row, ['liquidado_rec', 'liquidado']))
    const vencimento = isoDate(first(row, ['vencimento_rec', 'data_vencimento', 'vencimento']))
    const valorTotal = money(first(row, ['valor_rec', 'valor_documento', 'valor', 'valor_total']))
    if (!aberto || vencimento === null || vencimento < VHSYS_ZERO_DATE || valorTotal < VALOR_MINIMO) {
      return []
    }
    return [{
      domain: 'receber' as const,
      externalId: String(first(row, ['id_conta_rec', 'id_conta_receber', 'id'])),
      data: {
        numero_documento: String(first(row, ['n_documento_rec', 'n_documento', 'numero_documento']) ?? ''),
        documento_pessoa: '',
        pessoa_nome: String(first(row, ['nome_cliente', 'razao_cliente', 'cliente', 'nome']) ?? ''),
        pessoa_vhsys_id: String(first(row, ['id_cliente', 'id_cliente_fornecedor']) ?? ''),
        data: isoDate(first(row, ['data_emissao', 'data_competencia'])),
        vencimento,
        valor_total: valorTotal,
        valor_pago: money(first(row, ['valor_pago', 'valor_pago_rec'])),
        status: 'pendente',
        liquidado: false,
        observacoes: String(first(row, ['observacoes_rec', 'observacao', 'observacoes', 'descricao']) ?? ''),
      },
    }]
  })
}

export async function importPagar(client: VhsysClient): Promise<ImportedItem[]> {
  const rows = await client.list<Record<string, unknown>>('/contas-pagar')

  return rows.flatMap((row) => {
    const aberto = includeAccount(first(row, ['liquidado_pag', 'liquidado']))
    const vencimento = isoDate(first(row, ['vencimento_pag', 'data_vencimento', 'vencimento']))
    const valorTotal = money(first(row, ['valor_pag', 'valor_documento', 'valor', 'valor_total']))
    if (!aberto || vencimento === null || vencimento < VHSYS_ZERO_DATE || valorTotal < VALOR_MINIMO) {
      return []
    }
    return [{
      domain: 'pagar' as const,
      externalId: String(first(row, ['id_conta_pag', 'id_conta_pagar', 'id'])),
      data: {
        numero_documento: String(first(row, ['n_documento_pag', 'n_documento', 'numero_documento']) ?? ''),
        documento_pessoa: '',
        pessoa_nome: String(first(row, ['nome_fornecedor', 'razao_fornecedor', 'nome_conta', 'fornecedor', 'nome']) ?? ''),
        pessoa_vhsys_id: String(first(row, ['id_fornecedor', 'id_cliente_fornecedor']) ?? ''),
        data: isoDate(first(row, ['data_emissao', 'data_competencia'])),
        vencimento,
        valor_total: valorTotal,
        valor_pago: money(first(row, ['valor_pago', 'valor_pago_pag'])),
        status: 'pendente',
        liquidado: false,
        observacoes: String(first(row, ['observacoes_pag', 'observacao', 'observacoes', 'descricao']) ?? ''),
      },
    }]
  })
}
