import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { vhsysUnidadePorCodigo } from './unidades'

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

// Sincronização manual: o admin sincroniza qualquer unidade; o usuário de
// unidade só a própria. Os demais recursos VHSYS seguem só para admin.
export async function requireVhsysSync(
  supabase: SupabaseClient,
  codigoUnidade: string,
): Promise<{ userId: string; role: 'admin' | 'unidade' }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new VhsysAuthError(401, 'Não autenticado')
  }

  const { data: profile } = await supabase
    .from('btx_profiles')
    .select('role, unidade, ativo')
    .eq('id', user.id)
    .single()
  if (profile?.role === 'admin') {
    return { userId: user.id, role: 'admin' }
  }
  const alvo = vhsysUnidadePorCodigo(codigoUnidade)
  if (profile?.role === 'unidade' && profile.ativo !== false && alvo && profile.unidade === alvo.unidade) {
    return { userId: user.id, role: 'unidade' }
  }
  throw new VhsysAuthError(403, 'Você só pode sincronizar a sua própria unidade')
}
