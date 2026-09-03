import type { VhsysClient } from '../client'
import { VHSYS_ZERO_DATE, includeAccount, isoDate, money } from '../normalizers'
import type { ImportedItem } from './shared'

// ponytail: só traz título aberto, não estornado/lixeira, com vencimento a partir
// do marco zero e valor relevante. A conta VHSYS acumula resíduos de centavos e
// contas estornadas marcadas "em aberto" — sem esse corte, entra tudo.
const VALOR_MINIMO = 1

function first(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] != null && row[key] !== '') return row[key]
  }
  return undefined
}

function descartada(row: Record<string, unknown>): boolean {
  const lixeira = String(row.lixeira ?? 'Nao').trim().toLocaleLowerCase('pt-BR')
  const situacao = String(first(row, ['situacao', 'status_conta']) ?? '')
    .toLocaleLowerCase('pt-BR')
  return lixeira === 'sim'
    || situacao.includes('estorn')
    || situacao.includes('cancel')
}

interface Campos {
  domain: 'receber' | 'pagar'
  id: string[]
  liquidado: string[]
  vencimento: string[]
  valor: string[]
  documento: string[]
  pessoa: string[]
  pessoaId: string[]
  observacoes: string[]
  valorPago: string[]
}

function importar(rows: Record<string, unknown>[], c: Campos): ImportedItem[] {
  return rows.flatMap((row) => {
    const aberto = includeAccount(first(row, c.liquidado))
    const vencimento = isoDate(first(row, c.vencimento))
    const valorTotal = money(first(row, c.valor))
    if (
      descartada(row)
      || !aberto
      || vencimento === null
      || vencimento < VHSYS_ZERO_DATE
      || valorTotal < VALOR_MINIMO
    ) {
      return []
    }
    return [{
      domain: c.domain,
      externalId: String(first(row, c.id)),
      data: {
        numero_documento: String(first(row, c.documento) ?? ''),
        documento_pessoa: '',
        pessoa_nome: String(first(row, c.pessoa) ?? ''),
        pessoa_vhsys_id: String(first(row, c.pessoaId) ?? ''),
        data: isoDate(first(row, ['data_emissao', 'data_competencia'])),
        vencimento,
        valor_total: valorTotal,
        valor_pago: money(first(row, c.valorPago)),
        status: 'pendente',
        liquidado: false,
        observacoes: String(first(row, c.observacoes) ?? ''),
      },
    }]
  })
}

export async function importReceber(client: VhsysClient): Promise<ImportedItem[]> {
  const rows = await client.list<Record<string, unknown>>('/contas-receber')
  return importar(rows, {
    domain: 'receber',
    id: ['id_conta_rec', 'id_conta_receber', 'id'],
    liquidado: ['liquidado_rec', 'liquidado'],
    vencimento: ['vencimento_rec', 'data_vencimento', 'vencimento'],
    valor: ['valor_rec', 'valor_documento', 'valor', 'valor_total'],
    documento: ['n_documento_rec', 'n_documento', 'numero_documento'],
    pessoa: ['nome_cliente', 'razao_cliente', 'nome_conta', 'cliente', 'nome'],
    pessoaId: ['id_cliente', 'id_cliente_fornecedor'],
    observacoes: ['observacoes_rec', 'nome_conta', 'observacao', 'observacoes', 'descricao'],
    valorPago: ['valor_pago', 'valor_pago_rec'],
  })
}

export async function importPagar(client: VhsysClient): Promise<ImportedItem[]> {
  const rows = await client.list<Record<string, unknown>>('/contas-pagar')
  return importar(rows, {
    domain: 'pagar',
    id: ['id_conta_pag', 'id_conta_pagar', 'id'],
    liquidado: ['liquidado_pag', 'liquidado'],
    vencimento: ['vencimento_pag', 'data_vencimento', 'vencimento'],
    valor: ['valor_pag', 'valor_documento', 'valor', 'valor_total'],
    documento: ['n_documento_pag', 'n_documento', 'numero_documento'],
    pessoa: ['nome_fornecedor', 'razao_fornecedor', 'nome_conta', 'fornecedor', 'nome'],
    pessoaId: ['id_fornecedor', 'id_cliente_fornecedor'],
    observacoes: ['observacoes_pag', 'nome_conta', 'observacao', 'observacoes', 'descricao'],
    valorPago: ['valor_pago', 'valor_pago_pag'],
  })
}
