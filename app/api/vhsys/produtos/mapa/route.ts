import { createServerSupabase } from '@/lib/supabase-server'
import { requireVhsysAdmin, VhsysAuthError } from '@/lib/vhsys/auth'
import { VhsysClient } from '@/lib/vhsys/client'
import { getVhsysConfig } from '@/lib/vhsys/config'
import { atualizarMapaProdutos } from '@/lib/vhsys/produto-map'
import { vhsysUnidadePorCodigo } from '@/lib/vhsys/unidades'

// Monta/atualiza btx_vhsys_produto_map casando o catálogo do VHSYS com os
// produtos locais por nome. Admin, somente leitura no VHSYS.
// GET  /api/vhsys/produtos/mapa?unidade=MG  -> grava o mapa
// POST /api/vhsys/produtos/mapa {"unidade":"MG"}     -> grava o mapa

async function montar(codigoUnidade: string) {
  const supabase = await createServerSupabase()
  await requireVhsysAdmin(supabase)

  const unidade = vhsysUnidadePorCodigo(codigoUnidade)
  if (!unidade) throw new Error('Unidade VHSYS inválida.')

  const client = new VhsysClient(getVhsysConfig(unidade.codigo))
  const resultado = await atualizarMapaProdutos(supabase, client, unidade.unidade)
  return { gravado: true, ...resultado }
}

function responder(promise: Promise<unknown>) {
  return promise
    .then((body) => Response.json(body))
    .catch((error: unknown) => {
      if (error instanceof VhsysAuthError) {
        return Response.json({ error: error.message }, { status: error.status })
      }
      return Response.json(
        { error: error instanceof Error ? error.message : 'ERRO' },
        { status: 502 },
      )
    })
}

export function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const unidade = params.get('unidade') ?? ''
  return responder(montar(unidade))
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { unidade?: string }
  return responder(montar(body.unidade ?? ''))
}
