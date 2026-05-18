import type {
  LawfulBasis,
  TransferMechanism,
  DpiaStatus,
  ActivityStatus,
  TransferMechanismV2,
  DataLocation,
  DpaStatus,
  TiaStatus,
  VendorStatus,
} from './types'

export const DEPARTMENTS = [
  'Product',
  'Engineering',
  'Data Science & AI',
  'Marketing',
  'Customer Support',
  'HR',
  'Finance',
  'Legal',
  'B2B / Partnerships',
  'Operations',
] as const

export const LAWFUL_BASIS_OPTIONS: LawfulBasis[] = [
  'Contract',
  'Consent',
  'Legitimate interests',
  'Legal obligation',
  'Vital interests',
  'Public task',
]

export const TRANSFER_MECHANISMS: TransferMechanism[] = [
  'SCC',
  'Adequacy decision',
  'Art. 49 derogation',
  'UK IDTA',
  'Other',
]

export const DPIA_STATUSES: DpiaStatus[] = [
  'not_required',
  'pending',
  'completed',
  'not_assessed',
]

export const STATUSES: ActivityStatus[] = ['draft', 'pending_review', 'active', 'archived']

export const STATUS_LABELS: Record<ActivityStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending review',
  active: 'Active',
  archived: 'Archived',
}

export const DATA_SUBJECT_CATEGORIES = [
  'Customers',
  'Prospects / leads',
  'Website visitors',
  'Employees',
  'Job applicants',
  'Contractors / freelancers',
  'Suppliers / vendors',
  'Business contacts',
  'Members / subscribers',
  'Children (under 16)',
  'Other',
] as const

export const PERSONAL_DATA_CATEGORIES = [
  'Name',
  'Email address',
  'Phone number',
  'Postal address',
  'Date of birth',
  'Age',
  'Gender',
  'Usage / behavioural data',
  'Device identifiers',
  'IP address',
  'Cookies / tracking data',
  'Location data',
  'Payment details',
  'Bank account',
  'Photos / video',
  'Audio recordings',
  'Login credentials',
  'Free-text content',
  'Employment data',
  'Salary / payroll data',
  'ID document data',
  'National ID number',
  'Health data',
  'Ethnicity',
  'Religious beliefs',
  'Political opinions',
  'Biometric data',
] as const

export const STANDARD_TOMS = [
  'Encryption at rest',
  'Encryption in transit',
  'Access control / RBAC',
  'MFA',
  'Logging & monitoring',
  'Backup & recovery',
  'Pseudonymisation',
  'Staff training',
  'Signed DPA with processors',
] as const

export const STALE_REVIEW_MONTHS = 12

export function isReviewOverdue(lastReviewedAt: string, today = new Date()): boolean {
  if (!lastReviewedAt) return true
  const last = new Date(lastReviewedAt)
  if (Number.isNaN(last.getTime())) return true
  const diffMs = today.getTime() - last.getTime()
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30.4375)
  return diffMonths > STALE_REVIEW_MONTHS
}

import type { Activity } from './types'

export function isIncomplete(a: Activity): boolean {
  if (!a.purposeFull?.trim() && !a.purposeShort?.trim()) return true
  if (!a.lawfulBasis) return true
  if (!(a.dataSubjects?.length)) return true
  if (!(a.personalDataCategories?.length)) return true
  if (!a.retentionPeriod?.trim()) return true
  return false
}

// Organisation details now live in admin config (DynamoDB) and are loaded
// via /api/me. Exports read them from `me.organisation`.

// ---- Data transfers register ----

export const DATA_LOCATIONS: DataLocation[] = [
  'EU/EEA',
  'EU+US',
  'US',
  'UK',
  'Non-EU',
  'Mixed',
  'Unknown',
]

export const DATA_LOCATION_LABELS: Record<DataLocation, string> = {
  'EU/EEA': 'EU/EEA only',
  'EU+US': 'EU and US',
  US: 'US only',
  UK: 'United Kingdom',
  'Non-EU': 'Non-EU (other)',
  Mixed: 'Mixed / multiple regions',
  Unknown: 'Unknown',
}

export const TRANSFER_MECHANISMS_V2: TransferMechanismV2[] = [
  'SCC + DTIA',
  'DPF (EU-US Data Privacy Framework)',
  'Adequacy decision',
  'BCR (Binding Corporate Rules)',
  'UK IDTA',
  'Art. 49 derogation',
  'N/A — data stays in EU/EEA',
  'Other',
]

export const TRANSFER_MECHANISM_V2_DESCRIPTIONS: Record<TransferMechanismV2, string> = {
  'N/A — data stays in EU/EEA': 'Data stays in the EU/EEA — no transfer mechanism needed.',
  'Adequacy decision': 'The receiving country is officially considered safe by the European Commission.',
  'DPF (EU-US Data Privacy Framework)': 'The US recipient is certified under the EU-US Data Privacy Framework.',
  'SCC + DTIA': 'Standard Contractual Clauses, plus a Data Transfer Impact Assessment.',
  'BCR (Binding Corporate Rules)': 'Binding Corporate Rules approved by a Data Protection Authority.',
  'UK IDTA': 'UK International Data Transfer Agreement (or UK addendum to the SCCs).',
  'Art. 49 derogation': 'Derogation for specific situations (consent, contract necessity, etc.).',
  Other: 'Other mechanism, or unclear — flagged for legal review.',
}

export const DPA_STATUSES: DpaStatus[] = ['signed', 'pending', 'not_required', 'missing']
export const DPA_STATUS_LABELS: Record<DpaStatus, string> = {
  signed: 'Signed',
  pending: 'Pending',
  not_required: 'Not required',
  missing: 'Missing',
}

export const TIA_STATUSES: TiaStatus[] = ['completed', 'pending', 'not_required', 'not_assessed']
export const TIA_STATUS_LABELS: Record<TiaStatus, string> = {
  completed: 'Completed',
  pending: 'Pending',
  not_required: 'Not required',
  not_assessed: 'Not assessed',
}

export const VENDOR_STATUSES: VendorStatus[] = ['draft', 'pending_review', 'active', 'archived']
export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending review',
  active: 'Active',
  archived: 'Archived',
}
