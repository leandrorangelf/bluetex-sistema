import type { SupabaseClient } from '@supabase/supabase-js'
import type { VhsysClient } from './client'
import {
  runDomainImporters,
  type DomainResult,
  type VhsysDomain,
} from './importers'
import { reconcileItem, type LocalCandidate } from './reconcile'

export interface AnalysisRow {
  dominio: VhsysDomain
  vhsys_id: string
  classificacao:
    | 'novo'
    | 'ja_vinculado'
    | 'correspondencia_exata'
    | 'possivel_duplicidade'
    | 'erro'
  decisao: 'vincular' | 'importar' | 'ignorar' | null
  local_id: string | null
  dados_normalizados: Record<string, unknown>
  erro_sanitizado: string | null
}

type CandidateMap = Partial<Record<VhsysDomain, LocalCandidate[]>>

export function buildAnalysisItems(
  results: DomainResult[],
  candidateMap: CandidateMap,
  mappedProductIds: Set<string> = new Set(),
): AnalysisRow[] {
  const bankCount = results.find((result) => result.domain === 'bancos')
    ?.items.length ?? 0
  const rows: AnalysisRow[] = []

  for (const result of results) {
    if (result.error) {
      rows.push({
        dominio: result.domain,
        vhsys_id: `erro:${result.domain}`,
        classificacao: 'erro',
        decisao: null,
        local_id: null,
        dados_normalizados: {},
        erro_sanitizado: result.error,
      })
      continue
    }

    for (const item of result.items) {
      // Produto VHSYS sem mapa não entra na prévia — nada será criado no Painel.
      if (result.domain === 'estoque' && !mappedProductIds.has(item.externalId)) {
        continue
      }
      const reconciled = reconcileItem(item, candidateMap[result.domain] ?? [])
      const isClosedHistoricalTitle =
        (result.domain === 'receber' || result.domain === 'pagar')
        && item.data.liquidado === true
        && reconciled.classification === 'novo'
      if (isClosedHistoricalTitle) continue
      let decision: AnalysisRow['decisao'] = null
      if (reconciled.classification === 'novo') {
        decision = result.domain === 'bancos' && bankCount > 1 ? null : 'importar'
      } else if (
        reconciled.classification === 'ja_vinculado'
        || reconciled.classification === 'correspondencia_exata'
      ) {
        decision = 'vincular'
      }
      rows.push({
        dominio: result.domain,
        vhsys_id: item.externalId,
        classificacao: reconciled.classification,
        decisao: decision,
        local_id: reconciled.localId,
        dados_normalizados: item.data,
        erro_sanitizado: null,
      })
    }
  }

  return rows
}

function relationValue(
  relation: unknown,
  key: 'nome' | 'cnpj',
): string | null {
  if (!relation || typeof relation !== 'object' || Array.isArray(relation)) {
    return null
  }
  const value = (relation as Record<string, unknown>)[key]
  return value == null ? null : String(value)
}

function toCandidate(
  row: Record<string, unknown>,
  fields: {
    external: string
    document: string
    date: string
    relation?: string
  },
): LocalCandidate {
  const relation = fields.relation ? row[fields.relation] : null
  return {
    id: String(row.id),
    vhsys_id: row[fields.external] == null ? null : String(row[fields.external]),
    numero_documento: row[fields.document] == null
      ? null
      : String(row[fields.document]),
    documento_pessoa: relationValue(relation, 'cnpj'),
    data: row[fields.date] == null ? null : String(row[fields.date]),
    pessoa_nome: relationValue(relation, 'nome'),
    valor_total: Number(row.valor_total ?? row.valor ?? 0),
  }
}

async function loadMappedProductIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase
    .from('btx_vhsys_produto_map')
    .select('vhsys_id_produto')
    .eq('ignorar', false)
    .not('produto_id', 'is', null)
  return new Set((data ?? []).map((r) => String((r as { vhsys_id_produto: unknown }).vhsys_id_produto)))
}

async function loadCandidates(supabase: SupabaseClient): Promise<CandidateMap> {
  const [
    sales,
    purchases,
    receivable,
    payable,
    products,
  ] = await Promise.all([
    supabase.from('btx_vendas')
      .select('id,vhsys_id,numero_nf,data_venda,valor_total,cliente:btx_clientes(nome,cnpj)')
      .eq('unidade', 'NEW BLUETEX MG'),
    supabase.from('btx_compras')
      .select('id,vhsys_id,numero_nf,data_compra,valor_total,fornecedor:btx_fornecedores(nome,cnpj)')
      .eq('unidade', 'NEW BLUETEX MG'),
    supabase.from('btx_parcelas')
      .select('id,vhsys_id,numero_boleto,vencimento,valor')
      .eq('unidade', 'NEW BLUETEX MG').eq('tipo', 'receber'),
    supabase.from('btx_parcelas')
      .select('id,vhsys_id,numero_boleto,vencimento,valor')
      .eq('unidade', 'NEW BLUETEX MG').eq('tipo', 'pagar'),
    supabase.from('btx_produtos')
      .select('id,vhsys_id_mg,nome'),
  ])

  const ensure = (
    data: unknown,
    error: { message?: string } | null,
  ): Record<string, unknown>[] => {
    if (error) throw new Error('SUPABASE_CANDIDATE_QUERY_FAILED')
    return Array.isArray(data) ? data as Record<string, unknown>[] : []
  }

  return {
    vendas: ensure(sales.data, sales.error).map((row) => toCandidate(row, {
      external: 'vhsys_id',
      document: 'numero_nf',
      date: 'data_venda',
      relation: 'cliente',
    })),
    compras: ensure(purchases.data, purchases.error).map((row) => toCandidate(row, {
      external: 'vhsys_id',
      document: 'numero_nf',
      date: 'data_compra',
      relation: 'fornecedor',
    })),
    receber: ensure(receivable.data, receivable.error).map((row) => toCandidate(row, {
      external: 'vhsys_id',
      document: 'numero_boleto',
      date: 'vencimento',
    })),
    pagar: ensure(payable.data, payable.error).map((row) => toCandidate(row, {
      external: 'vhsys_id',
      document: 'numero_boleto',
      date: 'vencimento',
    })),
    estoque: ensure(products.data, products.error).map((row) => ({
      id: String(row.id),
      vhsys_id: row.vhsys_id_mg == null ? null : String(row.vhsys_id_mg),
      numero_documento: null,
      documento_pessoa: null,
      data: null,
      pessoa_nome: row.nome == null ? null : String(row.nome),
      valor_total: 0,
    })),
    bancos: [],
  }
}

function summarize(rows: AnalysisRow[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((summary, row) => {
    summary[row.classificacao] = (summary[row.classificacao] ?? 0) + 1
    return summary
  }, {})
}

export async function analyzeVhsys(
  supabase: SupabaseClient,
  userId: string,
  client: VhsysClient,
): Promise<string> {
  const { data: sync, error: createError } = await supabase
    .from('btx_vhsys_sincronizacoes')
    .insert({
      unidade: 'NEW BLUETEX MG',
      marco_zero: '2026-09-01',
      status: 'analisando',
      iniciado_por: userId,
    })
    .select('id')
    .single()
  if (createError || !sync) throw new Error('SUPABASE_SYNC_CREATE_FAILED')

  const syncId = String(sync.id)
  try {
    const [results, candidateMap, mappedProductIds] = await Promise.all([
      runDomainImporters(client),
      loadCandidates(supabase),
      loadMappedProductIds(supabase),
    ])
    const rows = buildAnalysisItems(results, candidateMap, mappedProductIds)
    if (rows.length > 0) {
      const { error } = await supabase
        .from('btx_vhsys_sincronizacao_itens')
        .insert(rows.map((row) => ({ sincronizacao_id: syncId, ...row })))
      if (error) throw new Error('SUPABASE_SYNC_ITEMS_FAILED')
    }
    const { error: updateError } = await supabase
      .from('btx_vhsys_sincronizacoes')
      .update({ status: 'pronto', resumo: summarize(rows) })
      .eq('id', syncId)
    if (updateError) throw new Error('SUPABASE_SYNC_UPDATE_FAILED')
    return syncId
  } catch (error) {
    const message = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : 'VHSYS_ANALYSIS_FAILED'
    await supabase.from('btx_vhsys_sincronizacoes')
      .update({ status: 'falhou', erro_sanitizado: message, concluido_em: new Date().toISOString() })
      .eq('id', syncId)
    throw new Error(message)
  }
}
