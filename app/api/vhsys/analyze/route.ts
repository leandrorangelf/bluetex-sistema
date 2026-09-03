import { createServerSupabase } from '@/lib/supabase-server'
import { analyzeVhsys } from '@/lib/vhsys/analyze'
import { requireVhsysAdmin, VhsysAuthError } from '@/lib/vhsys/auth'
import { VhsysClient } from '@/lib/vhsys/client'
import { getVhsysConfig } from '@/lib/vhsys/config'

export async function POST() {
  const supabase = await createServerSupabase()

  try {
    const { userId } = await requireVhsysAdmin(supabase)
    const client = new VhsysClient(getVhsysConfig())
    const id = await analyzeVhsys(supabase, userId, client)
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
