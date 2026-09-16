import { createServerSupabase } from '@/lib/supabase-server'
import { requireVhsysAdmin, VhsysAuthError } from '@/lib/vhsys/auth'
import { vhsysUnidadePorCodigo } from '@/lib/vhsys/unidades'

// Lista de produtos excluídos do relatório de vendas VHSYS por unidade —
// produto que não se trabalha mais, mas que ainda aparece no histórico do
// VHSYS e distorcia o total. Não apaga nada de btx_vhsys_vendas_historico,
// só filtra na leitura (reversível a qualquer momento).
// GET    /api/vhsys/relatorio-vendas/exclusoes?unidade=CODIGO
// POST   /api/vhsys/relatorio-vendas/exclusoes  { unidade, produto }
// DELETE /api/vhsys/relatorio-vendas/exclusoes?id=UUID
// (admin)

export async function GET(request: Request) {
  const supabase = await createServerSupabase()
  try {
    await requireVhsysAdmin(supabase)
    const unidade = vhsysUnidadePorCodigo(new URL(request.url).searchParams.get('unidade') ?? '')
    if (!unidade) {
      return Response.json({ error: 'unidade inválida' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('btx_vhsys_relatorio_exclusoes')
      .select('id,valor')
      .eq('unidade_codigo', unidade.codigo)
      .eq('tipo', 'produto')
      .order('valor')
    if (error) throw new Error('SUPABASE_QUERY_FALHOU')
    return Response.json({ produtos_excluidos: data ?? [] })
  } catch (error) {
    return responderErro(error)
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  try {
    await requireVhsysAdmin(supabase)
    const body = await request.json() as { unidade?: string; produto?: string }
    const unidade = vhsysUnidadePorCodigo(body.unidade ?? '')
    const produto = body.produto?.trim()
    if (!unidade || !produto) {
      return Response.json({ error: 'unidade ou produto inválido' }, { status: 400 })
    }
    const { error } = await supabase
      .from('btx_vhsys_relatorio_exclusoes')
      .upsert(
        { unidade_codigo: unidade.codigo, tipo: 'produto', valor: produto },
        { onConflict: 'unidade_codigo,tipo,valor' },
      )
    if (error) throw new Error('SUPABASE_INSERT_FALHOU')
    return Response.json({ ok: true })
  } catch (error) {
    return responderErro(error)
  }
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabase()
  try {
    await requireVhsysAdmin(supabase)
    const id = new URL(request.url).searchParams.get('id')
    if (!id) {
      return Response.json({ error: 'id obrigatório' }, { status: 400 })
    }
    const { error } = await supabase.from('btx_vhsys_relatorio_exclusoes').delete().eq('id', id)
    if (error) throw new Error('SUPABASE_DELETE_FALHOU')
    return Response.json({ ok: true })
  } catch (error) {
    return responderErro(error)
  }
}

function responderErro(error: unknown) {
  if (error instanceof VhsysAuthError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  const code = error instanceof Error ? error.message : 'ERRO'
  console.error('[relatorio-vendas/exclusoes]', code, error)
  return Response.json({ error: code }, { status: 500 })
}
