import type { VhsysClient } from '../client'
import { importCompras } from './compras'
import { importEstoque } from './estoque'
import { importPagar, importReceber } from './financeiro'
import type {
  DomainImporter,
  DomainResult,
  VhsysDomain,
} from './shared'
import { importVendas } from './vendas'

// Escopo do VHSYS: faturamento (vendas, compras, estoque) e os títulos a
// pagar/receber de lá — inclusive baixa feita no VHSYS, propagada aqui.
// Saldo bancário continua lançado manualmente por cada unidade.
export const DEFAULT_IMPORTERS: [VhsysDomain, DomainImporter][] = [
  ['vendas', importVendas],
  ['compras', importCompras],
  ['receber', importReceber],
  ['pagar', importPagar],
  ['estoque', importEstoque],
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
