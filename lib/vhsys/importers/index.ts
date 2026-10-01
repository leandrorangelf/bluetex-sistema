import type { VhsysClient } from '../client'
import { importCompras } from './compras'
import { importEstoque } from './estoque'
import { importReceber } from './financeiro'
import type {
  DomainImporter,
  DomainResult,
  VhsysDomain,
} from './shared'
import { importVendas } from './vendas'

// Escopo do VHSYS: faturamento (vendas, compras, estoque) e os boletos a
// receber gerados pela venda. Contas a pagar NÃO entram automaticamente:
// o usuário já mantém um lançamento manual detalhado delas (sem CNPJ nem
// vínculo de fornecedor estruturado), e tentar casar por nome/valor contra
// texto livre gerou duplicata quase 1:1 do histórico inteiro na primeira
// tentativa (ver commits deste dia) — revertido. Saldo bancário também
// continua manual.
export const DEFAULT_IMPORTERS: [VhsysDomain, DomainImporter][] = [
  ['vendas', importVendas],
  ['compras', importCompras],
  ['receber', importReceber],
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
