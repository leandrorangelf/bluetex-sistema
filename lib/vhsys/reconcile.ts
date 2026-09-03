import type { ImportedItem } from './importers'

export interface LocalCandidate {
  id: string
  vhsys_id: string | null
  numero_documento: string | null
  documento_pessoa: string | null
  data: string | null
  pessoa_nome: string | null
  valor_total: number
}

export interface ReconciledItem extends ImportedItem {
  classification:
    | 'novo'
    | 'ja_vinculado'
    | 'correspondencia_exata'
    | 'possivel_duplicidade'
  localId: string | null
}

function normalizedName(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase('pt-BR')
}

export function reconcileItem(
  external: ImportedItem,
  locals: LocalCandidate[],
): ReconciledItem {
  const data = external.data
  const linked = locals.find((local) => local.vhsys_id === external.externalId)
  if (linked) {
    return {
      ...external,
      classification: 'ja_vinculado',
      localId: linked.id,
    }
  }

  const document = String(data.numero_documento ?? '')
  const personDocument = String(data.documento_pessoa ?? '')
  const exact = document && personDocument
    ? locals.find((local) =>
      local.numero_documento === document
      && local.documento_pessoa === personDocument
      && Number(local.valor_total) === Number(data.valor_total),
    )
    : undefined
  if (exact) {
    return {
      ...external,
      classification: 'correspondencia_exata',
      localId: exact.id,
    }
  }

  const personName = normalizedName(data.pessoa_nome)
  const possible = personName
    ? locals.find((local) =>
      local.data === data.data
      && normalizedName(local.pessoa_nome) === personName
      && Number(local.valor_total) === Number(data.valor_total),
    )
    : undefined
  if (possible) {
    return {
      ...external,
      classification: 'possivel_duplicidade',
      localId: possible.id,
    }
  }

  return {
    ...external,
    classification: 'novo',
    localId: null,
  }
}
