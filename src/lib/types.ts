export type ActivityStatus = 'draft' | 'pending_review' | 'active' | 'archived'
export type ControllerRole = 'controller' | 'processor'
export type LawfulBasis =
  | 'Contract'
  | 'Consent'
  | 'Legitimate interests'
  | 'Legal obligation'
  | 'Vital interests'
  | 'Public task'
export type TransferMechanism =
  | 'SCC'
  | 'Adequacy decision'
  | 'Art. 49 derogation'
  | 'UK IDTA'
  | 'Other'
export type DpiaStatus = 'not_required' | 'pending' | 'completed' | 'not_assessed'

export type ChangeLogEventType =
  | 'created'
  | 'updated'
  | 'archived'
  | 'restored'
  | 'flagged_review'
  | 'cleared_review'
  | 'approved'
  | 'sent_back'
  | 'rejected'
  | 'nudged_owner'
  | 'reverted'

export interface ChangeLogEntry {
  timestamp: string
  actorEmail: string
  eventType: ChangeLogEventType
  fieldName?: string
  oldValue?: string
  newValue?: string
  reason?: string
  note?: string
}

export interface RecordVersion<T> {
  savedAt: string
  savedByEmail: string
  label?: string
  snapshot: T
}

export interface Activity {
  id: string
  status: ActivityStatus
  activityName: string
  purposeShort: string
  purposeFull: string
  department: string
  ownerName?: string
  ownerEmail: string
  controllerRole: ControllerRole
  systemsVendors: string[]
  recipients: string[]
  dataSubjects: string[]
  personalDataCategories: string[]
  lawfulBasis: LawfulBasis
  retentionPeriod: string
  retentionNotes?: string
  internationalTransfers: boolean
  transferMechanism?: TransferMechanism
  transferCountries?: string[]
  childrensData: boolean
  specialCategoryData: boolean
  aiInvolvement: boolean
  tomsChecklist: string[]
  tomsAdditional?: string
  needsLegalReview: boolean
  dpiaStatus: DpiaStatus
  references?: string
  notes?: string
  createdAt: string
  createdByEmail: string
  lastUpdatedAt: string
  lastUpdatedByEmail: string
  lastReviewedAt: string
  lastNudgedAt?: string
  nextReviewAt?: string
  changeLog: ChangeLogEntry[]
  versions: RecordVersion<Activity>[]
}

export type UserRole = 'read' | 'edit' | 'admin'

export interface OrganisationDetails {
  companyName?: string
  chamberOfCommerce?: string
  address?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  dpoName?: string
  dpoEmail?: string
  tomsReferenceUrl?: string
  tomsReferenceVersion?: string
}

export interface Me {
  email: string
  role: UserRole
  organisation: OrganisationDetails
  tomsLibrary: string[]
}

export interface AppConfig {
  id: '__config__'
  editAllowlist: string[]
  adminAllowlist: string[]
  organisation: OrganisationDetails
  tomsLibrary: string[]
}

export type AppConfigPatch = Partial<Omit<AppConfig, 'id'>>

export interface ListActivitiesResponse {
  items: Activity[]
  count: number
}

// ---- Vendor / Data transfers register ----

export type VendorStatus = 'draft' | 'active' | 'archived' | 'pending_review'

export type DataLocation =
  | 'EU/EEA'
  | 'EU+US'
  | 'US'
  | 'UK'
  | 'Non-EU'
  | 'Mixed'
  | 'Unknown'

export type TransferMechanismV2 =
  | 'SCC + DTIA'
  | 'DPF (EU-US Data Privacy Framework)'
  | 'Adequacy decision'
  | 'BCR (Binding Corporate Rules)'
  | 'UK IDTA'
  | 'Art. 49 derogation'
  | 'N/A — data stays in EU/EEA'
  | 'Other'

export type DpaStatus = 'signed' | 'pending' | 'not_required' | 'missing'
export type TiaStatus = 'completed' | 'pending' | 'not_required' | 'not_assessed'

export interface VendorTransfer {
  id: string
  recordType: 'vendor'
  status: VendorStatus

  toolName: string
  vendorName?: string
  description?: string

  processesPersonalData: boolean
  dataCategories: string[]
  dataSubjects: string[]

  dataLocation: DataLocation
  dataLocationDetail?: string

  transferMechanism?: TransferMechanismV2

  dpaStatus: DpaStatus
  dpaSignedDate?: string
  dpaUrl?: string

  tiaStatus: TiaStatus
  tiaNotes?: string

  linkedActivityIds?: string[]
  ownerName?: string
  ownerEmail: string

  notes?: string

  needsLegalReview: boolean
  lastReviewedAt: string
  nextReviewAt?: string
  lastNudgedAt?: string

  createdAt: string
  createdByEmail: string
  lastUpdatedAt: string
  lastUpdatedByEmail: string
  changeLog: ChangeLogEntry[]
  versions: RecordVersion<VendorTransfer>[]
}

export interface ListVendorsResponse {
  items: VendorTransfer[]
  count: number
}
