import { createServerSupabase } from '@/lib/supabase-server'
import { requireVhsysAdmin, VhsysAuthError } from '@/lib/vhsys/auth'
import {
  confirmVhsys,
  type SyncDecision,
} from '@/lib/vhsys/confirm'

interface ConfirmBody {
  decisions?: SyncDecision[]
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase()

  try {
    const { userId } = await requireVhsysAdmin(supabase)
    const { id } = await context.params
    const body = await request.json() as ConfirmBody
    if (!Array.isArray(body.decisions)) {
      return Response.json({ error: 'Decisões inválidas.' }, { status: 400 })
    }
    const domains = await confirmVhsys(
      supabase,
      id,
      userId,
      body.decisions,
    )
    return Response.json({ domains })
  } catch (error) {
    if (error instanceof VhsysAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error
      ? error.message
      : 'Não foi possível confirmar a sincronização.'
    return Response.json({ error: message }, { status: 400 })
  }
}
