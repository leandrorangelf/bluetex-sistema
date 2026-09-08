import type { VhsysClient } from '../client'
import { importBancos } from './bancos'
import { importPagar, importReceber } from './financeiro'
import type {
  DomainImporter,
  DomainResult,
  VhsysDomain,
} from './shared'

// ponytail: por ora só o espelho financeiro (contas + saldo). Vendas/compras
// mexem no estoque e exigem contagem de abertura + mapa de produtos fechado —
// reativar (importVendas/importCompras/importEstoque) quando isso estiver feito.
export const DEFAULT_IMPORTERS: [VhsysDomain, DomainImporter][] = [
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
