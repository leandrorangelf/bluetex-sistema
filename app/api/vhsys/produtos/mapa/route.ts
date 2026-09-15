import { createServerSupabase } from '@/lib/supabase-server'
import { requireVhsysAdmin, VhsysAuthError } from '@/lib/vhsys/auth'
import { VhsysClient } from '@/lib/vhsys/client'
import { getVhsysConfig } from '@/lib/vhsys/config'
import { melhorMatch, tokens, type LocalProduto } from '@/lib/vhsys/produto-match'
import { vhsysUnidadePorCodigo } from '@/lib/vhsys/unidades'

// Monta/atualiza btx_vhsys_produto_map casando o catálogo do VHSYS com os
// produtos locais por nome. Admin, somente leitura no VHSYS.
// GET  /api/vhsys/produtos/mapa?unidade=MG           -> mostra o mapa proposto sem gravar
// GET  /api/vhsys/produtos/mapa?unidade=MG&gravar=1  -> grava o mapa
// POST /api/vhsys/produtos/mapa {"unidade":"MG"}     -> grava o mapa

async function montar(codigoUnidade: string, gravar: boolean) {
  const supabase = await createServerSupabase()
  await requireVhsysAdmin(supabase)

  const unidade = vhsysUnidadePorCodigo(codigoUnidade)
  if (!unidade) throw new Error('Unidade VHSYS inválida.')

  const client = new VhsysClient(getVhsysConfig(unidade.codigo))
  const vhsysProdutos = await client.list<Record<string, unknown>>('/produtos', {}, 250)

  const { data: locaisRaw } = await supabase
    .from('btx_produtos')
    .select('id,nome')
    .eq('ativo', true)
    .or('origem_sistema.is.null,origem_sistema.eq.manual')
  const locais: LocalProduto[] = (locaisRaw ?? []).map((p) => {
    const nome = String((p as { nome: unknown }).nome)
    return { id: String((p as { id: unknown }).id), nome, _tokens: tokens(nome) }
  })

  const linhas = vhsysProdutos.map((row) => {
    const desc = String(row.desc_produto ?? '')
    const match = melhorMatch(desc, locais)
    return {
      vhsys_id_produto: String(row.id_produto),
      cod_produto: String(row.cod_produto ?? ''),
      desc_vhsys: desc,
      produto_id: match?.id ?? null,
      produto_local: match?.nome ?? null,
      ignorar: match === null,
    }
  })

  if (gravar) {
    const { error } = await supabase.from('btx_vhsys_produto_map').upsert(
      linhas.map(({ produto_local: _omit, ...l }) => ({
        ...l,
        unidade: unidade.unidade,
        atualizado_em: new Date().toISOString(),
      })),
      { onConflict: 'unidade,vhsys_id_produto' },
    )
    if (error) throw new Error('MAPA_GRAVACAO_FALHOU')
  }

  return {
    gravado: gravar,
    ligados: linhas.filter((l) => l.produto_id).length,
    ignorados: linhas.filter((l) => !l.produto_id).length,
    mapa: linhas,
  }
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
  const gravar = params.get('gravar') === '1'
  const unidade = params.get('unidade') ?? ''
  return responder(montar(unidade, gravar))
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { unidade?: string }
  return responder(montar(body.unidade ?? '', true))
}
