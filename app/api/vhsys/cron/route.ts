import { createServiceSupabase } from '@/lib/supabase-server'
import { runAutoSync } from '@/lib/vhsys/auto'

// Sincronização automática agendada (Vercel Cron). Protegida por CRON_SECRET.
// Configure em vercel.json e nas Environment Variables: CRON_SECRET e
// SUPABASE_SERVICE_ROLE_KEY.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'não autorizado' }, { status: 401 })
  }
  try {
    const supabase = createServiceSupabase()
    const resultado = await runAutoSync(supabase, null)
    return Response.json({ ok: true, ...resultado })
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'falha' },
      { status: 502 },
    )
  }
}
