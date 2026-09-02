import type { SupabaseClient } from '@supabase/supabase-js'
import { anoAtual, hoje, mesAtual } from '@/lib/utils'
import { calcularSaldoRealizado, chaveCompetencia, type ParcelaFinanceira, type PagamentoParcela } from '@/lib/financeiro'

// Recalcula o saldo-base (btx_caixa_mensal.saldo_inicial) do mês corrente a partir
// do saldo real informado hoje: novoBase = informado - movimentos já realizados
// entre o dia 1 do mês e hoje. Mesma regra usada no Painel Financeiro.
export async function ajustarSaldoBanco(
  sb: SupabaseClient,
  unidade: string,
  saldoInformadoHoje: number,
): Promise<{ error: string | null }> {
  const { data: parcelasRaw } = await sb
    .from('btx_parcelas')
    .select('*')
    .eq('unidade', unidade)
    .eq('ativo', true)
    .neq('status', 'cancelado')

  const parcelas = (parcelasRaw ?? []) as ParcelaFinanceira[]
  const ids = parcelas.map(p => p.id)
  const { data: pagRaw } = ids.length
    ? await sb.from('btx_pagamentos_parcela').select('id,parcela_id,valor,data_pagamento').in('parcela_id', ids)
    : { data: [] }
  const pagamentos: PagamentoParcela[] = (pagRaw ?? []).map((p: { id: string; parcela_id: string; valor: number; data_pagamento: string }) => ({
    id: p.id, parcela_id: p.parcela_id, valor: Number(p.valor), data_pagamento: p.data_pagamento,
  }))

  const competenciaHoje = chaveCompetencia(anoAtual(), mesAtual())
  const realizadoEsteMes = calcularSaldoRealizado({
    hoje: hoje(), competenciaInicio: competenciaHoje, parcelas, pagamentos,
  })
  const novoSaldoInicial = saldoInformadoHoje - realizadoEsteMes

  const { error } = await sb.from('btx_caixa_mensal').upsert(
    { unidade, mes: mesAtual(), ano: anoAtual(), saldo_inicial: novoSaldoInicial, updated_at: new Date().toISOString() },
    { onConflict: 'unidade,mes,ano' },
  )
  return { error: error ? 'Não foi possível salvar o saldo em banco. Tente novamente.' : null }
}
