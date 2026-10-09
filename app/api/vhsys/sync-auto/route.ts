import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server'
import { requireVhsysSync, VhsysAuthError } from '@/lib/vhsys/auth'
import { runAutoSync } from '@/lib/vhsys/auto'

// Sincroniza e aplica em um passo: importa o novo, atualiza o já vinculado
// (inclusive baixas feitas no VHSYS) e resolve conflitos automaticamente.
export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  try {
    const body = await request.json().catch(() => ({})) as { unidade?: string }
    if (!body.unidade) {
      return Response.json({ error: 'Selecione a unidade.' }, { status: 400 })
    }
    const { userId, role } = await requireVhsysSync(supabase, body.unidade)
    // Usuário de unidade não tem permissão de escrita nas tabelas de
    // sincronização (RLS); a autorização acima já restringe à unidade dele.
    const db = role === 'admin' ? supabase : createServiceSupabase()
    const resultado = await runAutoSync(db, userId, body.unidade)
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
