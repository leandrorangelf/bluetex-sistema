import { createServiceSupabase } from '@/lib/supabase-server'
import { runAutoSync } from '@/lib/vhsys/auto'
import { VHSYS_UNIDADES } from '@/lib/vhsys/unidades'

// Sincronização automática agendada (Vercel Cron). Protegida por CRON_SECRET.
// Roda uma unidade de cada vez (cada uma tem sua própria conta VHSYS); uma
// unidade sem credenciais configuradas não derruba as outras.
// Configure em vercel.json e nas Environment Variables: CRON_SECRET e
// SUPABASE_SERVICE_ROLE_KEY.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'não autorizado' }, { status: 401 })
  }
  const supabase = createServiceSupabase()
  const resultados: Record<string, unknown> = {}
  let ok = true
  for (const unidade of VHSYS_UNIDADES) {
    try {
      resultados[unidade.codigo] = await runAutoSync(supabase, null, unidade.codigo)
    } catch (error) {
      ok = false
      resultados[unidade.codigo] = {
        error: error instanceof Error ? error.message : 'falha',
      }
    }
  }
  return Response.json({ ok, resultados })
}
