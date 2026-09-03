import type { SupabaseClient } from '@supabase/supabase-js'

export interface SyncDecision {
  itemId: string
  decision: 'vincular' | 'importar' | 'ignorar'
  localId?: string
}

interface DecisionItem {
  id: string
  classificacao: string
  local_id: string | null
}

export function validateDecisions(
  items: DecisionItem[],
  decisions: SyncDecision[],
): SyncDecision[] {
  const byId = new Map(decisions.map((decision) => [decision.itemId, decision]))

  for (const item of items) {
    if (
      item.classificacao === 'possivel_duplicidade'
      || item.classificacao === 'divergente'
    ) {
      const decision = byId.get(item.id)
      if (!decision) throw new Error('Há conflitos sem decisão.')
      if (decision.decision === 'vincular' && !decision.localId) {
        throw new Error('O vínculo exige um registro local.')
      }
    }
  }

  return decisions
}

const DOMAIN_ORDER = [
  'estoque',
  'vendas',
  'compras',
  'receber',
  'pagar',
  'bancos',
] as const

export async function confirmVhsys(
  supabase: SupabaseClient,
  syncId: string,
  userId: string,
  decisions: SyncDecision[],
): Promise<Record<string, string>> {
  const { data: sync, error: syncError } = await supabase
    .from('btx_vhsys_sincronizacoes')
    .select('id,status')
    .eq('id', syncId)
    .eq('unidade', 'NEW BLUETEX MG')
    .single()
  if (syncError || !sync || sync.status !== 'pronto') {
    throw new Error('Sincronização não está pronta para confirmação.')
  }

  const { data: items, error: itemsError } = await supabase
    .from('btx_vhsys_sincronizacao_itens')
    .select('id,classificacao,decisao,local_id')
    .eq('sincronizacao_id', syncId)
  if (itemsError) throw new Error('Não foi possível carregar os itens.')

  const decisionItems = (items ?? []) as Array<DecisionItem & {
    decisao: SyncDecision['decision'] | null
  }>
  validateDecisions(decisionItems, decisions)

  for (const decision of decisions) {
    const belongs = decisionItems.some((item) => item.id === decision.itemId)
    if (!belongs) throw new Error('Decisão não pertence à sincronização.')
    const { error } = await supabase
      .from('btx_vhsys_sincronizacao_itens')
      .update({
        decisao: decision.decision,
        local_id: decision.localId ?? null,
      })
      .eq('id', decision.itemId)
      .eq('sincronizacao_id', syncId)
    if (error) throw new Error('Não foi possível salvar uma decisão.')
  }

  const decisionMap = new Map(decisions.map((decision) => [
    decision.itemId,
    decision.decision,
  ]))
  const unresolved = decisionItems.some((item) =>
    item.classificacao !== 'erro'
    && !(decisionMap.get(item.id) ?? item.decisao),
  )
  if (unresolved) throw new Error('Há itens sem decisão.')

  await supabase.from('btx_vhsys_sincronizacoes')
    .update({ status: 'confirmando', confirmado_por: userId })
    .eq('id', syncId)

  const domainStatus: Record<string, string> = {}
  for (const domain of DOMAIN_ORDER) {
    const { error } = await supabase.rpc('btx_confirmar_vhsys_dominio', {
      p_sincronizacao: syncId,
      p_dominio: domain,
    })
    if (error) {
      domainStatus[domain] = 'falhou'
      await supabase.from('btx_vhsys_sincronizacoes').update({
        status: 'falhou',
        resumo: { dominios: domainStatus },
        erro_sanitizado: `VHSYS_CONFIRM_${domain.toUpperCase()}_FAILED`,
        concluido_em: new Date().toISOString(),
      }).eq('id', syncId)
      throw new Error(`Falha ao confirmar ${domain}.`)
    }
    domainStatus[domain] = 'concluido'
  }

  await supabase.from('btx_vhsys_sincronizacoes').update({
    status: 'concluido',
    resumo: { dominios: domainStatus },
    concluido_em: new Date().toISOString(),
  }).eq('id', syncId)

  return domainStatus
}
