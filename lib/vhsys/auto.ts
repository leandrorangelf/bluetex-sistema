import type { SupabaseClient } from '@supabase/supabase-js'
import { analyzeVhsys } from './analyze'
import { VhsysClient } from './client'
import { getVhsysConfig } from './config'
import { confirmVhsys, type SyncDecision } from './confirm'
import { vhsysUnidadePorCodigo } from './unidades'

interface ItemRow {
  id: string
  classificacao: string
  decisao: string | null
  local_id: string | null
}

// Espelho fiel: conflito é resolvido sozinho — vincula ao registro local quando
// há um, senão importa separado. Nada fica pendente de decisão humana.
export function autoDecisions(items: ItemRow[]): SyncDecision[] {
  return items
    .filter((i) =>
      (i.classificacao === 'possivel_duplicidade' || i.classificacao === 'divergente')
      && !i.decisao,
    )
    .map((i) => i.local_id
      ? { itemId: i.id, decision: 'vincular' as const, localId: i.local_id }
      : { itemId: i.id, decision: 'importar' as const })
}

export async function runAutoSync(
  supabase: SupabaseClient,
  userId: string | null,
  codigoUnidade: string,
): Promise<{ syncId: string; domains: Record<string, string>; totalItens: number }> {
  const unidade = vhsysUnidadePorCodigo(codigoUnidade)
  if (!unidade) throw new Error('VHSYS_UNIDADE_INVALIDA')
  const client = new VhsysClient(getVhsysConfig(codigoUnidade))
  const syncId = await analyzeVhsys(supabase, userId, client, unidade.unidade)

  const { data: items, error } = await supabase
    .from('btx_vhsys_sincronizacao_itens')
    .select('id,classificacao,decisao,local_id')
    .eq('sincronizacao_id', syncId)
  if (error) throw new Error('Não foi possível carregar os itens da sincronização.')

  const decisions = autoDecisions((items ?? []) as ItemRow[])
  const domains = await confirmVhsys(supabase, syncId, userId, decisions)
  return { syncId, domains, totalItens: items?.length ?? 0 }
}
