import type { VhsysClient } from '../client'
import { importBancos } from './bancos'
import { importCompras } from './compras'
import { importPagar, importReceber } from './financeiro'
import type {
  DomainImporter,
  DomainResult,
  VhsysDomain,
} from './shared'
import { importVendas } from './vendas'

// ponytail: estoque fora por ora — o estoque do VHSYS não é exibido em nenhuma
// tela (o Painel calcula pelas entradas/saídas locais). Reativar quando houver
// onde mostrar e o mapa de produtos cobrir todas as unidades de medida.
export const DEFAULT_IMPORTERS: [VhsysDomain, DomainImporter][] = [
  ['vendas', importVendas],
  ['compras', importCompras],
  ['receber', importReceber],
  ['pagar', importPagar],
  ['bancos', importBancos],
]

function sanitizedError(error: unknown): string {
  if (error instanceof Error && /^VHSYS_[A-Z0-9_]+$/.test(error.message)) {
    return error.message
  }
  return 'VHSYS_IMPORT_ERROR'
}

export async function runDomainImporters(
  client: VhsysClient,
  importers: [VhsysDomain, DomainImporter][] = DEFAULT_IMPORTERS,
): Promise<DomainResult[]> {
  return Promise.all(importers.map(async ([domain, importer]) => {
    try {
      return { domain, items: await importer(client), error: null }
    } catch (error) {
      return { domain, items: [], error: sanitizedError(error) }
    }
  }))
}

export type {
  DomainImporter,
  DomainResult,
  ImportedItem,
  VhsysDomain,
} from './shared'
