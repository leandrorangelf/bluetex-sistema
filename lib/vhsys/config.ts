import 'server-only'
import type { VhsysConfig } from './types'

export function getVhsysConfig(): VhsysConfig {
  const baseUrl = process.env.VHSYS_API_BASE_URL
  const accessToken = process.env.VHSYS_ACCESS_TOKEN
  const secretAccessToken = process.env.VHSYS_SECRET_ACCESS_TOKEN

  if (!baseUrl || !accessToken || !secretAccessToken) {
    throw new Error('Configuração VHSYS incompleta')
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    accessToken,
    secretAccessToken,
    partnerToken: process.env.VHSYS_PARTNER_TOKEN,
    timeoutMs: 15_000,
  }
}
