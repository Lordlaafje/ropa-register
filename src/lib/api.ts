import { getSession } from './auth'
import { getConfig } from './config'
import type {
  Activity,
  Me,
  ListActivitiesResponse,
  AppConfig,
  AppConfigPatch,
  VendorTransfer,
  ListVendorsResponse,
} from './types'

export function isApiConfigured(): boolean {
  return !!getConfig().clientId && !!getConfig().cognitoDomain
}

export class AccessDeniedError extends Error {
  constructor(message = 'Access denied') {
    super(message)
    this.name = 'AccessDeniedError'
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('Not authenticated')
    this.name = 'UnauthenticatedError'
  }
}

async function readBodyMessage(response: Response): Promise<string | null> {
  try {
    const text = await response.text()
    if (!text) return null
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && typeof parsed.message === 'string') {
        return parsed.message
      }
    } catch {
      // not JSON
    }
    return text
  } catch {
    return null
  }
}

async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const { apiBase } = getConfig()
  if (!apiBase) {
    throw new Error('API base URL not configured')
  }

  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }

  const session = await getSession()
  if (!session) {
    throw new UnauthenticatedError()
  }
  headers.set('Authorization', session.idToken || session.accessToken)

  const url = `${apiBase.replace(/\/$/, '')}${path}`
  const response = await fetch(url, { ...options, headers })

  if (response.status === 401) {
    throw new UnauthenticatedError()
  }
  if (response.status === 403) {
    const msg = await readBodyMessage(response)
    throw new AccessDeniedError(msg || 'Access denied')
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed (${response.status})`)
  }

  if (response.status === 204) {
    return null as T
  }

  return (await response.json()) as T
}

export async function getMe(): Promise<Me> {
  return apiFetch<Me>('/api/me')
}

export interface ListActivitiesParams {
  status?: 'active' | 'archived' | 'draft' | 'pending_review' | 'all'
  department?: string
  lawfulBasis?: string
  q?: string
  includeArchived?: boolean
  overdueReview?: 'yes' | 'no'
  childrensData?: 'yes' | 'no'
  specialCategoryData?: 'yes' | 'no'
  internationalTransfers?: 'yes' | 'no'
  aiInvolvement?: 'yes' | 'no'
  needsLegalReview?: 'yes' | 'no'
}

export async function listActivities(params: ListActivitiesParams = {}): Promise<ListActivitiesResponse> {
  const qs: Record<string, string> = {}
  if (params.status) qs.status = params.status
  if (params.department) qs.department = params.department
  if (params.lawfulBasis) qs.lawfulBasis = params.lawfulBasis
  if (params.q) qs.q = params.q
  if (params.includeArchived) qs.includeArchived = 'true'
  if (params.overdueReview) qs.overdueReview = params.overdueReview
  if (params.childrensData) qs.childrensData = params.childrensData
  if (params.specialCategoryData) qs.specialCategoryData = params.specialCategoryData
  if (params.internationalTransfers) qs.internationalTransfers = params.internationalTransfers
  if (params.aiInvolvement) qs.aiInvolvement = params.aiInvolvement
  if (params.needsLegalReview) qs.needsLegalReview = params.needsLegalReview
  const search = new URLSearchParams(qs).toString()
  const query = search ? `?${search}` : ''
  return apiFetch<ListActivitiesResponse>(`/api/activities${query}`)
}

export async function getActivity(id: string): Promise<Activity> {
  return apiFetch<Activity>(`/api/activities/${encodeURIComponent(id)}`)
}

export type ActivityInput = Partial<Omit<Activity, 'id' | 'createdAt' | 'createdByEmail' | 'lastUpdatedAt' | 'lastUpdatedByEmail' | 'changeLog'>>

export class ValidationError extends Error {
  errors: Record<string, string>
  constructor(message: string, errors: Record<string, string>) {
    super(message)
    this.name = 'ValidationError'
    this.errors = errors
  }
}

async function apiMutate<T>(path: string, method: string, body: unknown): Promise<T> {
  const { apiBase } = getConfig()
  if (!apiBase) throw new Error('API base URL not configured')
  const session = await getSession()
  if (!session) throw new UnauthenticatedError()
  const url = `${apiBase.replace(/\/$/, '')}${path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: session.idToken || session.accessToken,
  }
  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (response.status === 401) throw new UnauthenticatedError()
  if (response.status === 403) {
    const msg = await readBodyMessage(response)
    throw new AccessDeniedError(msg || 'Access denied')
  }
  if (response.status === 400) {
    let payload: { message?: string; errors?: Record<string, string> } = {}
    try {
      payload = await response.json()
    } catch {
      // ignore
    }
    throw new ValidationError(payload.message || 'Validation failed', payload.errors || {})
  }
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed (${response.status})`)
  }
  if (response.status === 204) return null as T
  return (await response.json()) as T
}

export async function createActivity(input: ActivityInput): Promise<Activity> {
  return apiMutate<Activity>('/api/activities', 'POST', input)
}

export async function updateActivity(id: string, patch: ActivityInput): Promise<Activity> {
  return apiMutate<Activity>(`/api/activities/${encodeURIComponent(id)}`, 'PATCH', patch)
}

export async function archiveActivity(id: string, reason: string): Promise<Activity> {
  return apiMutate<Activity>(`/api/activities/${encodeURIComponent(id)}/archive`, 'POST', { reason })
}

export async function restoreActivity(id: string): Promise<Activity> {
  return apiMutate<Activity>(`/api/activities/${encodeURIComponent(id)}/restore`, 'POST', {})
}

export async function flagReview(id: string, reason?: string): Promise<Activity> {
  return apiMutate<Activity>(`/api/activities/${encodeURIComponent(id)}/flag-review`, 'POST', { reason })
}

export async function clearReview(id: string, note?: string): Promise<Activity> {
  return apiMutate<Activity>(`/api/activities/${encodeURIComponent(id)}/clear-review`, 'POST', { note })
}

export async function approveActivity(id: string, reason?: string): Promise<Activity> {
  return apiMutate<Activity>(`/api/activities/${encodeURIComponent(id)}/approve`, 'POST', { reason })
}

export async function sendBackActivity(id: string, reason: string): Promise<Activity> {
  return apiMutate<Activity>(`/api/activities/${encodeURIComponent(id)}/sendback`, 'POST', { reason })
}

export async function nudgeOwner(id: string): Promise<Activity> {
  return apiMutate<Activity>(`/api/activities/${encodeURIComponent(id)}/nudge-owner`, 'POST', {})
}

export async function revertActivity(id: string, versionIndex: number): Promise<Activity> {
  return apiMutate<Activity>(`/api/activities/${encodeURIComponent(id)}/revert`, 'POST', { versionIndex })
}

export async function revertTransfer(id: string, versionIndex: number): Promise<VendorTransfer> {
  return apiMutate<VendorTransfer>(`/api/transfers/${encodeURIComponent(id)}/revert`, 'POST', { versionIndex })
}

// ---- Vendor transfers ----

export interface ListTransfersParams {
  status?: 'active' | 'archived' | 'draft' | 'pending_review' | 'all'
  dataLocation?: string
  transferMechanism?: string
  dpaStatus?: string
  tiaStatus?: string
  q?: string
  includeArchived?: boolean
  needsLegalReview?: 'yes' | 'no'
  processesPersonalData?: 'yes' | 'no'
}

export async function listTransfers(params: ListTransfersParams = {}): Promise<ListVendorsResponse> {
  const qs: Record<string, string> = {}
  if (params.status) qs.status = params.status
  if (params.dataLocation) qs.dataLocation = params.dataLocation
  if (params.transferMechanism) qs.transferMechanism = params.transferMechanism
  if (params.dpaStatus) qs.dpaStatus = params.dpaStatus
  if (params.tiaStatus) qs.tiaStatus = params.tiaStatus
  if (params.q) qs.q = params.q
  if (params.includeArchived) qs.includeArchived = 'true'
  if (params.needsLegalReview) qs.needsLegalReview = params.needsLegalReview
  if (params.processesPersonalData) qs.processesPersonalData = params.processesPersonalData
  const search = new URLSearchParams(qs).toString()
  const query = search ? `?${search}` : ''
  return apiFetch<ListVendorsResponse>(`/api/transfers${query}`)
}

export async function getTransfer(id: string): Promise<VendorTransfer> {
  return apiFetch<VendorTransfer>(`/api/transfers/${encodeURIComponent(id)}`)
}

export type VendorInput = Partial<
  Omit<VendorTransfer, 'id' | 'recordType' | 'createdAt' | 'createdByEmail' | 'lastUpdatedAt' | 'lastUpdatedByEmail' | 'changeLog'>
>

export async function createTransfer(input: VendorInput): Promise<VendorTransfer> {
  return apiMutate<VendorTransfer>('/api/transfers', 'POST', input)
}

export async function updateTransfer(id: string, patch: VendorInput): Promise<VendorTransfer> {
  return apiMutate<VendorTransfer>(`/api/transfers/${encodeURIComponent(id)}`, 'PATCH', patch)
}

export async function archiveTransfer(id: string, reason: string): Promise<VendorTransfer> {
  return apiMutate<VendorTransfer>(`/api/transfers/${encodeURIComponent(id)}/archive`, 'POST', { reason })
}

export async function restoreTransfer(id: string): Promise<VendorTransfer> {
  return apiMutate<VendorTransfer>(`/api/transfers/${encodeURIComponent(id)}/restore`, 'POST', {})
}

export async function flagTransferReview(id: string, reason?: string): Promise<VendorTransfer> {
  return apiMutate<VendorTransfer>(`/api/transfers/${encodeURIComponent(id)}/flag-review`, 'POST', { reason })
}

export async function clearTransferReview(id: string, note?: string): Promise<VendorTransfer> {
  return apiMutate<VendorTransfer>(`/api/transfers/${encodeURIComponent(id)}/clear-review`, 'POST', { note })
}

export async function approveTransfer(id: string, reason?: string): Promise<VendorTransfer> {
  return apiMutate<VendorTransfer>(`/api/transfers/${encodeURIComponent(id)}/approve`, 'POST', { reason })
}

export async function sendBackTransfer(id: string, reason: string): Promise<VendorTransfer> {
  return apiMutate<VendorTransfer>(`/api/transfers/${encodeURIComponent(id)}/sendback`, 'POST', { reason })
}

export async function nudgeTransferOwner(id: string): Promise<VendorTransfer> {
  return apiMutate<VendorTransfer>(`/api/transfers/${encodeURIComponent(id)}/nudge-owner`, 'POST', {})
}

export async function getAdminConfig(): Promise<AppConfig> {
  return apiFetch<AppConfig>('/api/admin/config')
}

export async function updateAdminConfig(patch: AppConfigPatch): Promise<AppConfig> {
  return apiMutate<AppConfig>('/api/admin/config', 'PATCH', patch)
}
