import { createServerSupabase } from '@/lib/supabase-server'
import { analyzeVhsys } from '@/lib/vhsys/analyze'
import { requireVhsysAdmin, VhsysAuthError } from '@/lib/vhsys/auth'
import { VhsysClient } from '@/lib/vhsys/client'
import { getVhsysConfig } from '@/lib/vhsys/config'
import { vhsysUnidadePorCodigo } from '@/lib/vhsys/unidades'

export async function POST(request: Request) {
  const supabase = await createServerSupabase()

  try {
    const { userId } = await requireVhsysAdmin(supabase)
    const body = await request.json().catch(() => ({})) as { unidade?: string }
    const unidade = vhsysUnidadePorCodigo(body.unidade ?? '')
    if (!unidade) {
      return Response.json({ error: 'Unidade VHSYS inválida.' }, { status: 400 })
    }
    const client = new VhsysClient(getVhsysConfig(unidade.codigo))
    const id = await analyzeVhsys(supabase, userId, client, unidade.unidade)
    return Response.json({ id }, { status: 201 })
  } catch (error) {
    if (error instanceof VhsysAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json(
      { error: 'Não foi possível analisar os dados do VHSYS.' },
      { status: 502 },
    )
  }
}
