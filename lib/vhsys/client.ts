import 'server-only'
import type { VhsysConfig, VhsysListResponse } from './types'

type QueryValue = string | number | boolean

export class VhsysClient {
  constructor(private readonly config: VhsysConfig) {}

  private async request<T>(
    path: string,
    query: Record<string, QueryValue> = {},
  ): Promise<T> {
    const url = new URL(`${this.config.baseUrl}${path}`)
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value))
    }

    const headers = new Headers({
      'access-token': this.config.accessToken,
      'secret-access-token': this.config.secretAccessToken,
      'Cache-Control': 'no-cache',
      'User-Agent': 'BluetexSistema/1.0',
      'Content-Type': 'application/json',
    })
    if (this.config.partnerToken) {
      headers.set('partner-token', this.config.partnerToken)
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(this.config.timeoutMs),
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new Error('VHSYS_TIMEOUT')
      }
      throw new Error('VHSYS_NETWORK_ERROR')
    }

    if (!response.ok) {
      throw new Error(`VHSYS_HTTP_${response.status}`)
    }

    return response.json() as Promise<T>
  }

  async get<T>(
    path: string,
    query: Record<string, QueryValue> = {},
  ): Promise<T> {
    const response = await this.request<{ data: T }>(path, query)
    return response.data
  }

  async list<T>(
    path: string,
    query: Record<string, QueryValue> = {},
    pageSize = 250,
  ): Promise<T[]> {
    const result: T[] = []
    let offset = 0

    for (;;) {
      const page = await this.request<VhsysListResponse<T>>(path, {
        ...query,
        limit: pageSize,
        offset,
      })
      result.push(...page.data)

      const total = Number(
        page.paging?.total_count ?? page.paging?.total ?? result.length,
      )
      if (page.data.length === 0 || result.length >= total) {
        return result
      }
      offset += page.data.length
    }
  }
}
