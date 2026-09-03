import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export class VhsysAuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message)
    this.name = 'VhsysAuthError'
  }
}

export async function requireVhsysAdmin(
  supabase: SupabaseClient,
): Promise<{ userId: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new VhsysAuthError(401, 'Não autenticado')
  }

  const { data: profile } = await supabase
    .from('btx_profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    throw new VhsysAuthError(403, 'Acesso restrito a administradores')
  }

  return { userId: user.id }
}
