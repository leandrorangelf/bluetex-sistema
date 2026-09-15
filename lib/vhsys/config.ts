import 'server-only'
import type { VhsysConfig } from './types'
import { vhsysUnidadePorCodigo } from './unidades'

// Cada unidade tem sua própria conta VHSYS. As credenciais ficam em variáveis
// de ambiente sufixadas pelo código da unidade (ex: VHSYS_ACCESS_TOKEN_MG,
// VHSYS_ACCESS_TOKEN_GB_SP). A URL base é a mesma para todas as unidades.
export function getVhsysConfig(codigoUnidade: string): VhsysConfig {
  const unidade = vhsysUnidadePorCodigo(codigoUnidade)
  if (!unidade) {
    throw new Error('VHSYS_UNIDADE_INVALIDA')
  }

  const baseUrl = process.env.VHSYS_API_BASE_URL
  const accessToken = process.env[`VHSYS_ACCESS_TOKEN_${unidade.codigo}`]
  const secretAccessToken = process.env[`VHSYS_SECRET_ACCESS_TOKEN_${unidade.codigo}`]
  const partnerToken = process.env[`VHSYS_PARTNER_TOKEN_${unidade.codigo}`]

  if (!baseUrl || !accessToken || !secretAccessToken) {
    throw new Error('VHSYS_CONFIG_INCOMPLETA')
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    accessToken,
    secretAccessToken,
    partnerToken,
    timeoutMs: 15_000,
  }
}
