import { createServerSupabase } from '@/lib/supabase-server'
import { requireVhsysAdmin, VhsysAuthError } from '@/lib/vhsys/auth'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase()

  try {
    await requireVhsysAdmin(supabase)
    const { id } = await context.params
    const { data: sync, error: syncError } = await supabase
      .from('btx_vhsys_sincronizacoes')
      .select('*')
      .eq('id', id)
      .eq('unidade', 'NEW BLUETEX MG')
      .single()
    if (syncError || !sync) {
      return Response.json({ error: 'Sincronização não encontrada.' }, { status: 404 })
    }
    const { data: items, error: itemsError } = await supabase
      .from('btx_vhsys_sincronizacao_itens')
      .select('*')
      .eq('sincronizacao_id', id)
      .order('dominio')
    if (itemsError) {
      return Response.json({ error: 'Não foi possível carregar a análise.' }, { status: 500 })
    }
    return Response.json({ sync, items: items ?? [] })
  } catch (error) {
    if (error instanceof VhsysAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json(
      { error: 'Não foi possível carregar a análise.' },
      { status: 500 },
    )
  }
}
