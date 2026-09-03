import type { VhsysClient } from '../client'

export type VhsysDomain =
  | 'vendas'
  | 'compras'
  | 'receber'
  | 'pagar'
  | 'estoque'
  | 'bancos'

export interface ImportedItem {
  domain: VhsysDomain
  externalId: string
  data: Record<string, unknown>
}

export interface DomainResult {
  domain: VhsysDomain
  items: ImportedItem[]
  error: string | null
}

export type DomainImporter = (client: VhsysClient) => Promise<ImportedItem[]>
