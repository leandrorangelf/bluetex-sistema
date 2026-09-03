export interface VhsysConfig {
  baseUrl: string
  accessToken: string
  secretAccessToken: string
  partnerToken?: string
  timeoutMs: number
}

export interface VhsysListResponse<T> {
  code: number | string
  status: string
  paging?: {
    total?: number | string
    total_count?: number | string
    offset?: number | string
    limit?: number | string
    limit_max?: number | string
  }
  data: T[]
}
