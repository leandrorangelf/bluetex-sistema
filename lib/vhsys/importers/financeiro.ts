import type { VhsysClient } from '../client'
import { VHSYS_ANO_MINIMO, VHSYS_ZERO_DATE, includeAccount, isoDate, money } from '../normalizers'
import type { ImportedItem } from './shared'

// ponytail: traz título aberto OU já liquidado (pra propagar baixa em título já
// vinculado), desde que não estornado/lixeira, com vencimento a partir do marco
// zero e valor relevante. Título liquidado nunca visto antes (classificacao
// 'novo') é descartado depois, em buildAnalysisItems — não precisamos repetir
// aqui. A conta VHSYS acumula resíduos de centavos que "nunca fecham" — por
// isso o corte de valor mínimo continua valendo.
const VALOR_MINIMO = 1

function first(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] != null && row[key] !== '') return row[key]
  }
  return undefined
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
  categoria: string[]
}

const CAMPOS_RECEBER: Campos = {
  domain: 'receber',
  id: ['id_conta_rec', 'id_conta_receber', 'id'],
  liquidado: ['liquidado_rec', 'liquidado'],
  vencimento: ['vencimento_rec', 'data_vencimento', 'vencimento'],
  valor: ['valor_rec', 'valor_documento', 'valor', 'valor_total'],
  documento: ['n_documento_rec', 'n_documento', 'numero_documento'],
  pessoa: ['nome_cliente', 'razao_cliente', 'nome_conta', 'cliente', 'nome'],
  pessoaId: ['id_cliente', 'id_cliente_fornecedor'],
  observacoes: ['observacoes_rec', 'observacao', 'observacoes'],
  valorPago: ['valor_pago', 'valor_pago_rec'],
  categoria: ['categoria_rec', 'categoria', 'nome_categoria'],
}

const CAMPOS_PAGAR: Campos = {
  domain: 'pagar',
  id: ['id_conta_pag', 'id_conta_pagar', 'id'],
  liquidado: ['liquidado_pag', 'liquidado'],
  vencimento: ['vencimento_pag', 'data_vencimento', 'vencimento'],
  valor: ['valor_pag', 'valor_documento', 'valor', 'valor_total'],
  documento: ['n_documento_pag', 'n_documento', 'numero_documento'],
  pessoa: ['nome_fornecedor', 'razao_fornecedor', 'nome_conta', 'fornecedor', 'nome'],
  pessoaId: ['id_fornecedor', 'id_cliente_fornecedor'],
  observacoes: ['observacoes_pag', 'observacao', 'observacoes'],
  valorPago: ['valor_pago', 'valor_pago_pag'],
  categoria: ['categoria_pag', 'categoria', 'nome_categoria'],
}

// motivo pelo qual uma linha do VHSYS não entra — null = entra
function motivoExclusao(row: Record<string, unknown>, c: Campos): string | null {
  const vencimento = isoDate(first(row, c.vencimento))
  const valorTotal = money(first(row, c.valor))
  const aberto = includeAccount(first(row, c.liquidado))
  const lixeira = String(row.lixeira ?? 'Nao').trim().toLocaleLowerCase('pt-BR')
  const situacao = String(first(row, ['situacao', 'status_conta']) ?? '').toLocaleLowerCase('pt-BR')
  if (lixeira === 'sim') return 'na lixeira do VHSYS'
  if (situacao.includes('estorn')) return 'conta estornada no VHSYS'
  if (situacao.includes('cancel')) return 'conta cancelada no VHSYS'
  if (vencimento === null) return 'sem data de vencimento'
  if (vencimento < VHSYS_ANO_MINIMO) return `vencimento ${vencimento} é de 2025 ou antes`
  // conta a receber ainda em aberto entra mesmo se antiga (parcela de venda antiga)
  const parcelaReceberEmAberto = c.domain === 'receber' && aberto
  if (!parcelaReceberEmAberto && vencimento < VHSYS_ZERO_DATE) {
    return `vencimento ${vencimento} anterior ao marco (${VHSYS_ZERO_DATE}) e já quitada`
  }
  if (valorTotal < VALOR_MINIMO) return `valor R$ ${valorTotal.toFixed(2)} abaixo do mínimo`
  return null
}

export function avaliarFinanceiro(rows: Record<string, unknown>[], domain: 'receber' | 'pagar') {
  const c = domain === 'receber' ? CAMPOS_RECEBER : CAMPOS_PAGAR
  return rows.map((row) => ({
    vhsys_id: String(first(row, c.id) ?? ''),
    vencimento: isoDate(first(row, c.vencimento)),
    valor: money(first(row, c.valor)),
    pessoa: String(first(row, c.pessoa) ?? ''),
    conta: String(first(row, ['nome_conta', 'identificacao', 'descricao']) ?? ''),
    liquidado: !includeAccount(first(row, c.liquidado)),
    motivo_exclusao: motivoExclusao(row, c),
  }))
}

function importar(rows: Record<string, unknown>[], c: Campos): ImportedItem[] {
  return rows.flatMap((row) => {
    const aberto = includeAccount(first(row, c.liquidado))
    const vencimento = isoDate(first(row, c.vencimento))
    const valorTotal = money(first(row, c.valor))
    if (motivoExclusao(row, c) !== null) {
      return []
    }
    const valorPago = money(first(row, c.valorPago))
    const status = !aberto ? 'pago' : valorPago > 0 ? 'parcial' : 'pendente'
    const pessoa = String(first(row, c.pessoa) ?? '')
    // monta uma descrição legível com o que houver: pessoa · conta/histórico · categoria
    const partes = [
      pessoa,
      String(first(row, ['nome_conta', 'identificacao', 'descricao', 'historico', 'descricao_ob']) ?? ''),
      String(first(row, [...c.observacoes, 'obs_pagamento']) ?? ''),
      String(first(row, c.categoria) ?? ''),
      String(row.forma_pagamento ?? ''),
    ].map((p) => p.trim()).filter((p, i, a) => p && a.indexOf(p) === i)
    const descricao = partes.join(' · ')
    return [{
      domain: c.domain,
      externalId: String(first(row, c.id)),
      data: {
        numero_documento: String(
          first(row, [...c.documento, 'NossoNumero', 'id_boleto']) ?? '',
        ),
        documento_pessoa: '',
        pessoa_nome: pessoa,
        pessoa_vhsys_id: String(first(row, c.pessoaId) ?? ''),
        data: isoDate(first(row, ['data_emissao', 'data_competencia'])),
        vencimento,
        valor_total: valorTotal,
        valor_pago: valorPago,
        status,
        liquidado: !aberto,
        data_pagamento: isoDate(row.data_pagamento),
        // a tela mostra 'observacoes' na coluna Cliente (receber) / Origem (pagar)
        observacoes: descricao || (c.domain === 'receber' ? 'Recebimento avulso' : 'Despesa'),
        link_boleto: String(row.link_boleto ?? ''),
      },
    }]
  })
}

export async function importReceber(client: VhsysClient): Promise<ImportedItem[]> {
  const rows = await client.list<Record<string, unknown>>('/contas-receber')
  return importar(rows, CAMPOS_RECEBER)
}

export async function importPagar(client: VhsysClient): Promise<ImportedItem[]> {
  const rows = await client.list<Record<string, unknown>>('/contas-pagar')
  return importar(rows, CAMPOS_PAGAR)
}
