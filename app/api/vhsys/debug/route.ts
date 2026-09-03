import { createServerSupabase } from '@/lib/supabase-server'
import { requireVhsysAdmin, VhsysAuthError } from '@/lib/vhsys/auth'
import { VhsysClient } from '@/lib/vhsys/client'
import { getVhsysConfig } from '@/lib/vhsys/config'

// Amostra crua de um recurso do VHSYS, só para conferir nomes de campos.
// Uso: GET /api/vhsys/debug?recurso=produtos&limite=2  (admin, somente leitura)
const RECURSOS: Record<string, string> = {
  produtos: '/produtos',
  clientes: '/clientes',
  'contas-receber': '/contas-receber',
  'contas-pagar': '/contas-pagar',
  'contas-bancarias': '/contas-bancarias',
  'entradas-mercadoria': '/entradas-mercadoria',
  pedidos: '/pedidos',
}

export async function GET(request: Request) {
  const supabase = await createServerSupabase()
  try {
    await requireVhsysAdmin(supabase)
    const url = new URL(request.url)
    const recurso = url.searchParams.get('recurso') ?? 'produtos'
    const limite = Math.min(Number(url.searchParams.get('limite') ?? 2) || 2, 10)
    const path = RECURSOS[recurso]
    if (!path) {
      return Response.json(
        { error: `recurso inválido. use um de: ${Object.keys(RECURSOS).join(', ')}` },
        { status: 400 },
      )
    }
    const client = new VhsysClient(getVhsysConfig())
    const rows = await client.list<Record<string, unknown>>(path, {}, limite)
    return Response.json({ recurso, total_amostra: rows.length, amostra: rows.slice(0, limite) })
  } catch (error) {
    if (error instanceof VhsysAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    const code = error instanceof Error ? error.message : 'VHSYS_ERRO'
    return Response.json({ error: code }, { status: 502 })
  }
}
