import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularStatusPagamento, type PagamentoParcela } from './financeiro.ts'

export interface PagamentoRow {
  id: string
  parcela_id: string
  valor: number
  data_pagamento: string
  observacoes: string | null
}

export function saldoRestante(valorParcela: number, pagamentos: { valor: number }[]): number {
  return Number(valorParcela) - pagamentos.reduce((s, p) => s + Number(p.valor), 0)
}

export async function listarPagamentos(sb: SupabaseClient, parcelaIds: string[]): Promise<PagamentoRow[]> {
  if (!parcelaIds.length) return []
  const { data } = await sb
    .from('btx_pagamentos_parcela')
    .select('id,parcela_id,valor,data_pagamento,observacoes')
    .in('parcela_id', parcelaIds)
    .order('data_pagamento')
  return ((data ?? []) as PagamentoRow[]).map(p => ({ ...p, valor: Number(p.valor) }))
}

function comoPagamentoParcela(rows: PagamentoRow[]): PagamentoParcela[] {
  return rows.map(p => ({ id: p.id, parcela_id: p.parcela_id, valor: p.valor, data_pagamento: p.data_pagamento }))
}

// Recalcula status/data de uma parcela a partir dos pagamentos registrados.
// Não mexe em parcela cancelada.
export async function sincronizarParcela(
  sb: SupabaseClient,
  parcela: { id: string; valor: number; status?: string },
): Promise<{ error: string | null }> {
  if (parcela.status === 'cancelado') return { error: null }
  const todos = await listarPagamentos(sb, [parcela.id])
  const { status, dataPagamento } = calcularStatusPagamento(Number(parcela.valor), comoPagamentoParcela(todos))
  const upd = await sb.from('btx_parcelas').update({ status, data_pagamento: dataPagamento }).eq('id', parcela.id)
  return { error: upd.error ? 'Status da parcela não atualizou.' : null }
}

// Registra 1 pagamento (total ou parcial) e re-sincroniza status/data da parcela.
export async function registrarPagamento(
  sb: SupabaseClient,
  parcela: { id: string; valor: number },
  dados: { valor: number; data: string; observacoes: string },
): Promise<{ error: string | null }> {
  const ins = await sb.from('btx_pagamentos_parcela').insert({
    parcela_id: parcela.id,
    valor: dados.valor,
    data_pagamento: dados.data,
    observacoes: dados.observacoes || null,
  })
  if (ins.error) return { error: 'Não foi possível registrar o pagamento.' }
  return sincronizarParcela(sb, parcela)
}

export async function excluirPagamento(
  sb: SupabaseClient,
  pagamentoId: string,
  parcela: { id: string; valor: number },
): Promise<{ error: string | null }> {
  const del = await sb.from('btx_pagamentos_parcela').delete().eq('id', pagamentoId)
  if (del.error) return { error: 'Não foi possível excluir o pagamento.' }
  return sincronizarParcela(sb, parcela)
}
