import { createServerSupabase } from '@/lib/supabase-server'
import { requireVhsysAdmin, VhsysAuthError } from '@/lib/vhsys/auth'
import { runAutoSync } from '@/lib/vhsys/auto'

// Sincroniza e aplica em um passo: importa o novo, atualiza o já vinculado
// (inclusive baixas feitas no VHSYS) e resolve conflitos automaticamente.
export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  try {
    const { userId } = await requireVhsysAdmin(supabase)
    const body = await request.json().catch(() => ({})) as { unidade?: string }
    if (!body.unidade) {
      return Response.json({ error: 'Selecione a unidade.' }, { status: 400 })
    }
    const resultado = await runAutoSync(supabase, userId, body.unidade)
    return Response.json(resultado)
  } catch (error) {
    if (error instanceof VhsysAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Falha na sincronização.' },
      { status: 502 },
    )
  }
}
