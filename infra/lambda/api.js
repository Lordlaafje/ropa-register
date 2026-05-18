'use strict'

const crypto = require('crypto')
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  QueryCommand,
  PutCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb')
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager')

// Email domain whose users get read access (and edit by default). Required.
const ALLOWED_EMAIL_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || '').toLowerCase()
const TABLE = process.env.ACTIVITIES_TABLE
const SLACK_WEBHOOK_SECRET_NAME = process.env.SLACK_WEBHOOK_SECRET_NAME || ''
const SLACK_BOT_TOKEN_SECRET_NAME = process.env.SLACK_BOT_TOKEN_SECRET_NAME || ''
const APP_BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/$/, '')
const APP_NAME = process.env.APP_NAME || 'RoPA Register'
const SAFETY_CAP = 5000 // hard ceiling so a runaway scan can't hammer the function
const CONFIG_ID = '__config__'
// First admin account, seeded into the config on first run. Required.
const INITIAL_ADMIN = (process.env.INITIAL_ADMIN_EMAIL || '').toLowerCase()

const secrets = new SecretsManagerClient({})
let cachedSlackWebhook = null
let cachedSlackBotToken = null

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
})

const DEPARTMENTS = [
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
]

const LAWFUL_BASIS_OPTIONS = [
  'Contract',
  'Consent',
  'Legitimate interests',
  'Legal obligation',
  'Vital interests',
  'Public task',
]

const TRANSFER_MECHANISMS = ['SCC', 'Adequacy decision', 'Art. 49 derogation', 'UK IDTA', 'Other']
const DPIA_STATUSES = ['not_required', 'pending', 'completed', 'not_assessed']
const CONTROLLER_ROLES = ['controller', 'processor']

const STANDARD_TOMS = [
  'Encryption at rest',
  'Encryption in transit',
  'Access control / RBAC',
  'MFA',
  'Logging & monitoring',
  'Backup & recovery',
  'Pseudonymisation',
  'Staff training',
  'Signed DPA with processors',
]

const ALLOWED_FIELDS = new Set([
  'status',
  'activityName',
  'purposeShort',
  'purposeFull',
  'department',
  'ownerName',
  'ownerEmail',
  'controllerRole',
  'systemsVendors',
  'recipients',
  'dataSubjects',
  'personalDataCategories',
  'lawfulBasis',
  'retentionPeriod',
  'retentionNotes',
  'internationalTransfers',
  'transferMechanism',
  'transferCountries',
  'childrensData',
  'specialCategoryData',
  'aiInvolvement',
  'tomsChecklist',
  'tomsAdditional',
  'needsLegalReview',
  'dpiaStatus',
  'references',
  'notes',
  'lastReviewedAt',
  'nextReviewAt',
])

const SCALAR_FIELDS = [
  'activityName',
  'purposeShort',
  'purposeFull',
  'department',
  'ownerName',
  'ownerEmail',
  'controllerRole',
  'lawfulBasis',
  'retentionPeriod',
  'retentionNotes',
  'internationalTransfers',
  'transferMechanism',
  'childrensData',
  'specialCategoryData',
  'aiInvolvement',
  'tomsAdditional',
  'needsLegalReview',
  'dpiaStatus',
  'references',
  'notes',
  'status',
  'lastReviewedAt',
  'nextReviewAt',
]

const ARRAY_FIELDS = [
  'systemsVendors',
  'recipients',
  'dataSubjects',
  'personalDataCategories',
  'transferCountries',
  'tomsChecklist',
]

// ---- Vendor transfers ----

const DATA_LOCATIONS = ['EU/EEA', 'EU+US', 'US', 'UK', 'Non-EU', 'Mixed', 'Unknown']
const TRANSFER_MECHANISMS_V2 = [
  'SCC + DTIA',
  'DPF (EU-US Data Privacy Framework)',
  'Adequacy decision',
  'BCR (Binding Corporate Rules)',
  'UK IDTA',
  'Art. 49 derogation',
  'N/A — data stays in EU/EEA',
  'Other',
]
const DPA_STATUSES = ['signed', 'pending', 'not_required', 'missing']
const TIA_STATUSES = ['completed', 'pending', 'not_required', 'not_assessed']

const VENDOR_ALLOWED_FIELDS = new Set([
  'status',
  'toolName',
  'vendorName',
  'description',
  'processesPersonalData',
  'dataCategories',
  'dataSubjects',
  'dataLocation',
  'dataLocationDetail',
  'transferMechanism',
  'dpaStatus',
  'dpaSignedDate',
  'dpaUrl',
  'tiaStatus',
  'tiaNotes',
  'linkedActivityIds',
  'ownerName',
  'ownerEmail',
  'notes',
  'needsLegalReview',
  'lastReviewedAt',
  'nextReviewAt',
])

const VENDOR_SCALAR_FIELDS = [
  'status',
  'toolName',
  'vendorName',
  'description',
  'processesPersonalData',
  'dataLocation',
  'dataLocationDetail',
  'transferMechanism',
  'dpaStatus',
  'dpaSignedDate',
  'dpaUrl',
  'tiaStatus',
  'tiaNotes',
  'ownerName',
  'ownerEmail',
  'notes',
  'needsLegalReview',
  'lastReviewedAt',
  'nextReviewAt',
]

const VENDOR_ARRAY_FIELDS = ['dataCategories', 'dataSubjects', 'linkedActivityIds']

const ORG_FIELDS = [
  'companyName',
  'chamberOfCommerce',
  'address',
  'contactName',
  'contactEmail',
  'contactPhone',
  'dpoName',
  'dpoEmail',
  'tomsReferenceUrl',
  'tomsReferenceVersion',
]

exports.handler = async (event) => {
  const method = event.httpMethod || 'GET'
  const rawPath = event.path || '/'

  if (method === 'OPTIONS') return emptyResponse(204)

  if (!event.requestContext?.authorizer) {
    return jsonResponse(401, { message: 'Unauthorized' })
  }

  const claims = event.requestContext.authorizer.claims || {}
  const email = extractEmail(claims)
  if (!email || !email.endsWith('@' + ALLOWED_EMAIL_DOMAIN)) {
    return jsonResponse(403, { message: 'Access denied' })
  }

  const segments = rawPath.split('?')[0].split('/').filter(Boolean)
  if (segments[0] !== 'api') return jsonResponse(404, { message: 'Not found' })

  let body = null
  if (event.body) {
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
    } catch {
      return jsonResponse(400, { message: 'Invalid JSON body' })
    }
  }

  try {
    const config = await getOrBootstrapConfig()
    const role = determineRole(email, config)
    const requireWrite = () => {
      if (role === 'read') {
        return jsonResponse(403, {
          message: 'Read-only access — contact admin for edit rights',
        })
      }
      return null
    }
    const requireAdmin = () => {
      if (role !== 'admin') {
        return jsonResponse(403, { message: 'Admin access required' })
      }
      return null
    }

    if (segments[1] === 'me' && method === 'GET') {
      return jsonResponse(200, {
        email,
        role,
        organisation: config.organisation || {},
        tomsLibrary: config.tomsLibrary || STANDARD_TOMS,
      })
    }

    if (segments[1] === 'admin' && segments[2] === 'config') {
      if (method === 'GET') {
        const block = requireAdmin()
        if (block) return block
        return jsonResponse(200, config)
      }
      if (method === 'PATCH') {
        const block = requireAdmin()
        if (block) return block
        return await updateConfig(body || {})
      }
    }

    if (segments[1] === 'activities' && method === 'GET' && segments.length === 2) {
      const qs = event.queryStringParameters || {}
      return await listActivities(qs)
    }

    if (segments[1] === 'activities' && method === 'POST' && segments.length === 2) {
      // All authenticated allowed-domain users may create. Read users are
      // forced into pending_review; edit/admin choose active or pending_review.
      return await createActivity(body || {}, email, role)
    }

    if (segments[1] === 'activities' && segments[2] && method === 'GET' && segments.length === 3) {
      return await getActivity(segments[2])
    }

    if (segments[1] === 'activities' && segments[2] && method === 'PATCH' && segments.length === 3) {
      const block = requireWrite()
      if (block) return block
      return await updateActivity(segments[2], body || {}, email)
    }

    if (segments[1] === 'activities' && segments[2] && method === 'POST' && segments.length === 4) {
      const action = segments[3]
      // Routine actions only need edit
      if (action === 'flag-review' || action === 'clear-review' || action === 'nudge-owner' || action === 'revert') {
        const block = requireWrite()
        if (block) return block
        if (action === 'flag-review') return await flagReview(segments[2], body || {}, email)
        if (action === 'clear-review') return await clearReview(segments[2], body || {}, email)
        if (action === 'nudge-owner') return await nudgeOwner(segments[2], email)
        if (action === 'revert') return await revertActivity(segments[2], body || {}, email)
      }
      // Archive/restore/approve/sendback are admin-only (less reversible)
      const block = requireAdmin()
      if (block) return block
      if (action === 'archive') return await archiveActivity(segments[2], body || {}, email)
      if (action === 'restore') return await restoreActivity(segments[2], email)
      if (action === 'approve') return await approveActivity(segments[2], body || {}, email)
      if (action === 'sendback') return await sendBackActivity(segments[2], body || {}, email)
    }

    // ---- Vendor transfers ----
    if (segments[1] === 'transfers' && method === 'GET' && segments.length === 2) {
      const qs = event.queryStringParameters || {}
      return await listVendors(qs)
    }

    if (segments[1] === 'transfers' && method === 'POST' && segments.length === 2) {
      return await createVendor(body || {}, email, role)
    }

    if (segments[1] === 'transfers' && segments[2] && method === 'GET' && segments.length === 3) {
      return await getVendor(segments[2])
    }

    if (segments[1] === 'transfers' && segments[2] && method === 'PATCH' && segments.length === 3) {
      const block = requireWrite()
      if (block) return block
      return await updateVendor(segments[2], body || {}, email)
    }

    if (segments[1] === 'transfers' && segments[2] && method === 'POST' && segments.length === 4) {
      const action = segments[3]
      if (action === 'flag-review' || action === 'clear-review' || action === 'nudge-owner' || action === 'revert') {
        const block = requireWrite()
        if (block) return block
        if (action === 'flag-review') return await flagVendorReview(segments[2], body || {}, email)
        if (action === 'clear-review') return await clearVendorReview(segments[2], body || {}, email)
        if (action === 'nudge-owner') return await nudgeVendorOwner(segments[2], email)
        if (action === 'revert') return await revertVendor(segments[2], body || {}, email)
      }
      const block = requireAdmin()
      if (block) return block
      if (action === 'archive') return await archiveVendor(segments[2], body || {}, email)
      if (action === 'restore') return await restoreVendor(segments[2], email)
      if (action === 'approve') return await approveVendor(segments[2], body || {}, email)
      if (action === 'sendback') return await sendBackVendor(segments[2], body || {}, email)
    }
  } catch (err) {
    console.error('Handler error', err)
    return jsonResponse(500, { message: 'Internal error', error: String(err?.message || err) })
  }

  return jsonResponse(404, { message: 'Not found' })
}

// ---- Config (allowlists, organisation, TOMs library) ----

function defaultConfig() {
  return {
    id: CONFIG_ID,
    editAllowlist: [],
    adminAllowlist: INITIAL_ADMIN ? [INITIAL_ADMIN] : [],
    // Empty by default — admins fill in organisation details on the Admin page.
    organisation: {},
    tomsLibrary: [...STANDARD_TOMS],
  }
}

async function getOrBootstrapConfig() {
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id: CONFIG_ID } }))
  if (out.Item) return normalizeConfig(out.Item)
  const seeded = defaultConfig()
  await ddb.send(new PutCommand({ TableName: TABLE, Item: seeded }))
  return seeded
}

function normalizeConfig(item) {
  const def = defaultConfig()
  return {
    id: CONFIG_ID,
    editAllowlist: Array.isArray(item.editAllowlist) ? item.editAllowlist.map(lc) : def.editAllowlist,
    adminAllowlist: Array.isArray(item.adminAllowlist) ? item.adminAllowlist.map(lc) : def.adminAllowlist,
    organisation:
      item.organisation && typeof item.organisation === 'object'
        ? item.organisation
        : def.organisation,
    tomsLibrary:
      Array.isArray(item.tomsLibrary) && item.tomsLibrary.length
        ? item.tomsLibrary.filter((s) => typeof s === 'string' && s.trim().length)
        : def.tomsLibrary,
  }
}

function determineRole(email, config) {
  const e = (email || '').toLowerCase()
  if ((config.adminAllowlist || []).includes(e)) return 'admin'
  // Any authenticated allowed-domain address gets edit rights by default.
  // Admin role is the only gated tier (used for archive/restore/approve/admin config).
  if (e.endsWith('@' + ALLOWED_EMAIL_DOMAIN)) return 'edit'
  return 'read'
}

function lc(s) {
  return typeof s === 'string' ? s.trim().toLowerCase() : ''
}

function sanitizeEmailList(list) {
  if (!Array.isArray(list)) return undefined
  const seen = new Set()
  const out = []
  for (const raw of list) {
    const e = lc(raw)
    if (!e || !e.includes('@')) continue
    if (seen.has(e)) continue
    seen.add(e)
    out.push(e)
  }
  return out
}

function sanitizeOrganisation(org) {
  if (!org || typeof org !== 'object') return undefined
  const out = {}
  for (const k of ORG_FIELDS) {
    if (typeof org[k] === 'string') {
      const v = org[k].trim()
      if (v.length) out[k] = v
    }
  }
  return out
}

function sanitizeTomsLibrary(list) {
  if (!Array.isArray(list)) return undefined
  const seen = new Set()
  const out = []
  for (const raw of list) {
    if (typeof raw !== 'string') continue
    const v = raw.trim()
    if (!v) continue
    if (seen.has(v.toLowerCase())) continue
    seen.add(v.toLowerCase())
    out.push(v)
  }
  return out
}

async function updateConfig(rawBody) {
  const existing = await getOrBootstrapConfig()
  const next = { ...existing }

  if ('editAllowlist' in rawBody) {
    const v = sanitizeEmailList(rawBody.editAllowlist)
    if (v !== undefined) next.editAllowlist = v
  }
  if ('adminAllowlist' in rawBody) {
    const v = sanitizeEmailList(rawBody.adminAllowlist)
    if (v !== undefined) next.adminAllowlist = v
  }
  if ('organisation' in rawBody) {
    const v = sanitizeOrganisation(rawBody.organisation)
    if (v !== undefined) next.organisation = v
  }
  if ('tomsLibrary' in rawBody) {
    const v = sanitizeTomsLibrary(rawBody.tomsLibrary)
    if (v !== undefined) next.tomsLibrary = v
  }

  next.id = CONFIG_ID

  await ddb.send(new PutCommand({ TableName: TABLE, Item: next }))
  return jsonResponse(200, next)
}

// ---- Activities ----

async function listActivities(qs) {
  const status = (qs.status || 'active').toLowerCase()
  const includeArchived = qs.includeArchived === 'true' || qs.includeArchived === '1'
  const statusFilter = qs.status === 'all' || includeArchived ? null : status
  const department = qs.department || null
  const lawfulBasis = qs.lawfulBasis || null
  const q = (qs.q || '').trim().toLowerCase()
  const overdueReview = triParam(qs.overdueReview)
  const childrensData = triParam(qs.childrensData)
  const specialCategoryData = triParam(qs.specialCategoryData)
  const internationalTransfers = triParam(qs.internationalTransfers)
  const aiInvolvement = triParam(qs.aiInvolvement)
  const needsLegalReview = triParam(qs.needsLegalReview)

  const hasExtraFilters =
    overdueReview !== null ||
    childrensData !== null ||
    specialCategoryData !== null ||
    internationalTransfers !== null ||
    aiInvolvement !== null ||
    needsLegalReview !== null

  let items = []
  if (statusFilter && !department && !lawfulBasis && !q && !hasExtraFilters) {
    items = await paginate(async (cursor) =>
      ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'status_lastReviewedAt',
        KeyConditionExpression: '#s = :s',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':s': statusFilter },
        ScanIndexForward: true,
        ExclusiveStartKey: cursor,
      })),
    )
  } else if (department && !q && !hasExtraFilters) {
    items = await paginate(async (cursor) =>
      ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'department_lastReviewedAt',
        KeyConditionExpression: 'department = :d',
        ExpressionAttributeValues: { ':d': department },
        ScanIndexForward: true,
        ExclusiveStartKey: cursor,
      })),
    )
    if (statusFilter) items = items.filter((it) => it.status === statusFilter)
    if (lawfulBasis) items = items.filter((it) => it.lawfulBasis === lawfulBasis)
  } else {
    items = await paginate(async (cursor) =>
      ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey: cursor })),
    )
    items = items.filter((it) => it.id !== CONFIG_ID)
    if (statusFilter) items = items.filter((it) => it.status === statusFilter)
    if (department) items = items.filter((it) => it.department === department)
    if (lawfulBasis) items = items.filter((it) => it.lawfulBasis === lawfulBasis)
    if (q) items = items.filter((it) => matchesSearch(it, q))
  }

  // strip config item if it slipped in via the GSI scans (it shouldn't, since it lacks status/department, but be safe)
  items = items.filter((it) => it && it.id !== CONFIG_ID)
  // exclude vendor records from the activities register
  items = items.filter((it) => it.recordType !== 'vendor')

  if (overdueReview !== null) {
    items = items.filter((it) => isReviewOverdue(it.lastReviewedAt) === overdueReview)
  }
  if (childrensData !== null) items = items.filter((it) => !!it.childrensData === childrensData)
  if (specialCategoryData !== null) items = items.filter((it) => !!it.specialCategoryData === specialCategoryData)
  if (internationalTransfers !== null) items = items.filter((it) => !!it.internationalTransfers === internationalTransfers)
  if (aiInvolvement !== null) items = items.filter((it) => !!it.aiInvolvement === aiInvolvement)
  if (needsLegalReview !== null) items = items.filter((it) => !!it.needsLegalReview === needsLegalReview)

  items.sort((a, b) => (a.lastReviewedAt || '').localeCompare(b.lastReviewedAt || ''))
  items = items.map(normalizeActivity)

  return jsonResponse(200, { items, count: items.length })
}

function normalizeActivity(it) {
  if (!it) return it
  return {
    ...it,
    systemsVendors: it.systemsVendors || [],
    recipients: it.recipients || [],
    dataSubjects: it.dataSubjects || [],
    personalDataCategories: it.personalDataCategories || [],
    transferCountries: it.transferCountries || [],
    tomsChecklist: it.tomsChecklist || [],
    changeLog: it.changeLog || [],
    versions: it.versions || [],
  }
}

const VERSION_LIMIT = 20

// Build a snapshot of the current record state (without nested versions to avoid quadratic growth).
function snapshotOf(record, actorEmail, label) {
  const { versions: _v, ...rest } = record
  return {
    savedAt: nowIso(),
    savedByEmail: actorEmail,
    label: label || 'auto',
    snapshot: rest,
  }
}

// Push a snapshot of the BEFORE state onto a record, capped at VERSION_LIMIT entries (FIFO).
function withSnapshot(record, beforeState, actorEmail, label) {
  const snap = snapshotOf(beforeState, actorEmail, label)
  const prev = Array.isArray(record.versions) ? record.versions : []
  const next = [...prev, snap]
  if (next.length > VERSION_LIMIT) next.splice(0, next.length - VERSION_LIMIT)
  return { ...record, versions: next }
}

async function paginate(runQuery) {
  const all = []
  let cursor = undefined
  do {
    const out = await runQuery(cursor)
    if (out.Items?.length) all.push(...out.Items)
    cursor = out.LastEvaluatedKey
    if (all.length >= SAFETY_CAP) break
  } while (cursor)
  return all
}

function triParam(v) {
  if (v === undefined || v === null) return null
  const s = String(v).toLowerCase()
  if (s === 'yes' || s === 'true' || s === '1') return true
  if (s === 'no' || s === 'false' || s === '0') return false
  return null
}

function isReviewOverdue(lastReviewedAt) {
  if (!lastReviewedAt) return true
  const last = new Date(lastReviewedAt)
  if (Number.isNaN(last.getTime())) return true
  const diffMonths = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24 * 30.4375)
  return diffMonths > 12
}

function matchesSearch(item, q) {
  const hay = [
    item.activityName,
    item.purposeShort,
    item.purposeFull,
    item.department,
    item.ownerName || '',
    item.ownerEmail,
    ...(item.systemsVendors || []),
    ...(item.recipients || []),
    ...(item.dataSubjects || []),
    ...(item.personalDataCategories || []),
    item.notes || '',
    item.references || '',
  ].join(' ').toLowerCase()
  return hay.includes(q)
}

async function getActivity(id) {
  if (id === CONFIG_ID) return jsonResponse(404, { message: 'Not found' })
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!out.Item) return jsonResponse(404, { message: 'Not found' })
  if (out.Item.recordType === 'vendor') return jsonResponse(404, { message: 'Not found' })
  return jsonResponse(200, normalizeActivity(out.Item))
}

function sanitize(input) {
  const out = {}
  for (const k of Object.keys(input || {})) {
    if (ALLOWED_FIELDS.has(k)) out[k] = input[k]
  }
  return out
}

function validate(record, level) {
  // level: 'draft' | 'pending' | 'full'
  const errors = {}
  if (level === 'draft') return errors

  if (!str(record.activityName)) errors.activityName = 'Activity name is required'
  if (!str(record.department)) {
    errors.department = 'Department is required'
  } else if (!DEPARTMENTS.includes(record.department)) {
    errors.department = 'Department must be from the canonical list'
  }
  if (!str(record.ownerEmail) || !record.ownerEmail.includes('@')) {
    errors.ownerEmail = 'Valid owner email is required'
  }

  if (level === 'pending') return errors

  if (!str(record.purposeShort)) errors.purposeShort = 'Short purpose is required'
  if (!str(record.controllerRole) || !CONTROLLER_ROLES.includes(record.controllerRole)) {
    errors.controllerRole = 'Role must be controller or processor'
  }
  if (!str(record.lawfulBasis) || !LAWFUL_BASIS_OPTIONS.includes(record.lawfulBasis)) {
    errors.lawfulBasis = 'A valid lawful basis is required'
  }
  if (!Array.isArray(record.dataSubjects) || record.dataSubjects.length < 1) {
    errors.dataSubjects = 'At least one data subject is required'
  }
  if (!Array.isArray(record.personalDataCategories) || record.personalDataCategories.length < 1) {
    errors.personalDataCategories = 'At least one data category is required'
  }
  if (record.internationalTransfers && record.transferMechanism &&
    !TRANSFER_MECHANISMS.includes(record.transferMechanism)) {
    errors.transferMechanism = 'Invalid transfer mechanism'
  }
  if (record.dpiaStatus && !DPIA_STATUSES.includes(record.dpiaStatus)) {
    errors.dpiaStatus = 'Invalid DPIA status'
  }
  return errors
}

function str(v) {
  return typeof v === 'string' && v.trim().length > 0
}

function nowIso() {
  return new Date().toISOString()
}

function defaultRecord() {
  return {
    activityName: '',
    purposeShort: '',
    purposeFull: '',
    department: '',
    ownerEmail: '',
    controllerRole: 'controller',
    systemsVendors: [],
    recipients: [],
    dataSubjects: [],
    personalDataCategories: [],
    lawfulBasis: 'Legitimate interests',
    retentionPeriod: '',
    retentionNotes: '',
    internationalTransfers: false,
    transferMechanism: undefined,
    transferCountries: [],
    childrensData: false,
    specialCategoryData: false,
    aiInvolvement: false,
    tomsChecklist: [],
    tomsAdditional: '',
    needsLegalReview: false,
    dpiaStatus: 'not_assessed',
    references: '',
    notes: '',
    lastReviewedAt: '',
    nextReviewAt: undefined,
  }
}

async function createActivity(rawBody, actorEmail, role) {
  const body = sanitize(rawBody)

  // Status policy:
  // - read users are forced to 'pending_review'
  // - edit/admin can choose 'active' (default), 'draft' or 'pending_review'
  let status
  if (role === 'read') {
    status = 'pending_review'
  } else {
    const requested = body.status
    if (requested === 'active' || requested === 'pending_review' || requested === 'draft') {
      status = requested
    } else {
      status = 'active'
    }
  }

  const merged = { ...defaultRecord(), ...body, status }

  const level = status === 'draft' ? 'draft' : status === 'pending_review' ? 'pending' : 'full'
  const errors = validate(merged, level)
  if (Object.keys(errors).length > 0) {
    return jsonResponse(400, { message: 'Validation failed', errors })
  }

  const now = nowIso()
  const id = crypto.randomUUID()
  const record = {
    ...merged,
    id,
    createdAt: now,
    createdByEmail: actorEmail,
    lastUpdatedAt: now,
    lastUpdatedByEmail: actorEmail,
    lastReviewedAt: merged.lastReviewedAt || now,
    changeLog: [
      {
        timestamp: now,
        actorEmail,
        eventType: 'created',
        note: `Created as ${status}`,
      },
    ],
  }

  await ddb.send(new PutCommand({ TableName: TABLE, Item: record }))

  if (status === 'pending_review') {
    notifyPendingSubmission(record).catch(() => {})
  }

  return jsonResponse(201, record)
}

async function updateActivity(id, rawBody, actorEmail) {
  if (id === CONFIG_ID) return jsonResponse(404, { message: 'Not found' })
  const existingOut = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!existingOut.Item) return jsonResponse(404, { message: 'Not found' })
  const existing = existingOut.Item

  const patch = sanitize(rawBody)
  const merged = { ...existing, ...patch }

  const targetStatus = merged.status || 'draft'
  const level = targetStatus === 'draft' ? 'draft' : targetStatus === 'pending_review' ? 'pending' : 'full'
  const errors = validate(merged, level)
  if (Object.keys(errors).length > 0) {
    return jsonResponse(400, { message: 'Validation failed', errors })
  }

  const now = nowIso()
  const newEntries = []
  for (const f of SCALAR_FIELDS) {
    if (!(f in patch)) continue
    const oldV = existing[f]
    const newV = patch[f]
    if (normalizeForCompare(oldV) === normalizeForCompare(newV)) continue
    newEntries.push({
      timestamp: now,
      actorEmail,
      eventType: 'updated',
      fieldName: f,
      oldValue: toLogValue(oldV),
      newValue: toLogValue(newV),
    })
  }
  for (const f of ARRAY_FIELDS) {
    if (!(f in patch)) continue
    const oldV = Array.isArray(existing[f]) ? existing[f] : []
    const newV = Array.isArray(patch[f]) ? patch[f] : []
    if (oldV.join('|') === newV.join('|')) continue
    newEntries.push({
      timestamp: now,
      actorEmail,
      eventType: 'updated',
      fieldName: f,
      oldValue: oldV.join(', '),
      newValue: newV.join(', '),
    })
  }

  if (newEntries.length === 0) {
    return jsonResponse(200, normalizeActivity(existing))
  }

  const merged2 = {
    ...merged,
    id: existing.id,
    createdAt: existing.createdAt,
    createdByEmail: existing.createdByEmail,
    lastUpdatedAt: now,
    lastUpdatedByEmail: actorEmail,
    changeLog: [...(existing.changeLog || []), ...newEntries],
  }
  const updated = withSnapshot(merged2, existing, actorEmail, 'pre-update')

  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }))
  return jsonResponse(200, updated)
}

async function revertActivity(id, body, actorEmail) {
  if (id === CONFIG_ID) return jsonResponse(404, { message: 'Not found' })
  const existingOut = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!existingOut.Item) return jsonResponse(404, { message: 'Not found' })
  const existing = existingOut.Item
  const versions = Array.isArray(existing.versions) ? existing.versions : []
  const idx = typeof body?.versionIndex === 'number' ? body.versionIndex : -1
  if (idx < 0 || idx >= versions.length) {
    return jsonResponse(400, { message: 'Invalid versionIndex' })
  }
  const target = versions[idx]
  if (!target?.snapshot) {
    return jsonResponse(400, { message: 'Selected version has no snapshot' })
  }
  const now = nowIso()
  const restored = {
    ...target.snapshot,
    id: existing.id,
    createdAt: existing.createdAt,
    createdByEmail: existing.createdByEmail,
    lastUpdatedAt: now,
    lastUpdatedByEmail: actorEmail,
    changeLog: [
      ...(existing.changeLog || []),
      {
        timestamp: now,
        actorEmail,
        eventType: 'reverted',
        note: `Reverted to version saved ${target.savedAt} by ${target.savedByEmail}`,
      },
    ],
  }
  const final = withSnapshot(restored, existing, actorEmail, 'pre-revert')
  await ddb.send(new PutCommand({ TableName: TABLE, Item: final }))
  return jsonResponse(200, normalizeActivity(final))
}

function normalizeForCompare(v) {
  if (v === undefined || v === null) return ''
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v)
}
function toLogValue(v) {
  if (v === undefined || v === null) return ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

async function archiveActivity(id, body, actorEmail) {
  if (id === CONFIG_ID) return jsonResponse(404, { message: 'Not found' })
  const reason = (body.reason || '').toString().trim()
  if (!reason) return jsonResponse(400, { message: 'A reason is required to archive' })

  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!out.Item) return jsonResponse(404, { message: 'Not found' })
  const existing = out.Item

  const now = nowIso()
  const entry = {
    timestamp: now,
    actorEmail,
    eventType: 'archived',
    reason,
  }

  const updated = {
    ...existing,
    status: 'archived',
    lastUpdatedAt: now,
    lastUpdatedByEmail: actorEmail,
    changeLog: [...(existing.changeLog || []), entry],
  }
  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }))
  return jsonResponse(200, updated)
}

async function restoreActivity(id, actorEmail) {
  if (id === CONFIG_ID) return jsonResponse(404, { message: 'Not found' })
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!out.Item) return jsonResponse(404, { message: 'Not found' })
  const existing = out.Item

  const now = nowIso()
  const entry = {
    timestamp: now,
    actorEmail,
    eventType: 'restored',
  }
  const updated = {
    ...existing,
    status: 'active',
    lastUpdatedAt: now,
    lastUpdatedByEmail: actorEmail,
    changeLog: [...(existing.changeLog || []), entry],
  }
  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }))
  return jsonResponse(200, updated)
}

async function flagReview(id, body, actorEmail) {
  if (id === CONFIG_ID) return jsonResponse(404, { message: 'Not found' })
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!out.Item) return jsonResponse(404, { message: 'Not found' })
  const existing = out.Item
  const now = nowIso()
  const entry = {
    timestamp: now,
    actorEmail,
    eventType: 'flagged_review',
    reason: body.reason || undefined,
  }
  const updated = {
    ...existing,
    needsLegalReview: true,
    lastUpdatedAt: now,
    lastUpdatedByEmail: actorEmail,
    changeLog: [...(existing.changeLog || []), entry],
  }
  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }))
  return jsonResponse(200, updated)
}

async function clearReview(id, body, actorEmail) {
  if (id === CONFIG_ID) return jsonResponse(404, { message: 'Not found' })
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!out.Item) return jsonResponse(404, { message: 'Not found' })
  const existing = out.Item
  const now = nowIso()
  const entry = {
    timestamp: now,
    actorEmail,
    eventType: 'cleared_review',
    reason: body.note || undefined,
  }
  const updated = {
    ...existing,
    needsLegalReview: false,
    lastUpdatedAt: now,
    lastUpdatedByEmail: actorEmail,
    changeLog: [...(existing.changeLog || []), entry],
  }
  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }))
  return jsonResponse(200, updated)
}

async function approveActivity(id, body, actorEmail) {
  if (id === CONFIG_ID) return jsonResponse(404, { message: 'Not found' })
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!out.Item) return jsonResponse(404, { message: 'Not found' })
  const existing = out.Item
  if (existing.status !== 'pending_review') {
    return jsonResponse(409, { message: 'Activity is not pending review' })
  }
  const reason = (body && typeof body.reason === 'string') ? body.reason.trim() : ''
  const now = nowIso()
  const entry = {
    timestamp: now,
    actorEmail,
    eventType: 'approved',
  }
  if (reason) entry.reason = reason
  const updated = {
    ...existing,
    status: 'active',
    lastUpdatedAt: now,
    lastUpdatedByEmail: actorEmail,
    lastReviewedAt: now,
    changeLog: [...(existing.changeLog || []), entry],
  }
  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }))
  notifyTransition('approved', updated, actorEmail, reason).catch(() => {})
  return jsonResponse(200, updated)
}

async function sendBackActivity(id, body, actorEmail) {
  if (id === CONFIG_ID) return jsonResponse(404, { message: 'Not found' })
  const reason = (body && typeof body.reason === 'string') ? body.reason.trim() : ''
  if (!reason) return jsonResponse(400, { message: 'A reason is required to send back' })
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!out.Item) return jsonResponse(404, { message: 'Not found' })
  const existing = out.Item
  if (existing.status !== 'pending_review') {
    return jsonResponse(409, { message: 'Activity is not pending review' })
  }
  const now = nowIso()
  const entry = {
    timestamp: now,
    actorEmail,
    eventType: 'sent_back',
    reason,
  }
  const updated = {
    ...existing,
    status: 'draft',
    lastUpdatedAt: now,
    lastUpdatedByEmail: actorEmail,
    changeLog: [...(existing.changeLog || []), entry],
  }
  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }))
  notifyTransition('sent_back', updated, actorEmail, reason).catch(() => {})
  return jsonResponse(200, updated)
}

// ---- Owner nudging ----

const NUDGE_COOLDOWN_HOURS = 24

async function nudgeOwner(id, actorEmail) {
  if (id === CONFIG_ID) return jsonResponse(404, { message: 'Not found' })
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!out.Item) return jsonResponse(404, { message: 'Not found' })
  const r = out.Item

  // Only nudge if action needed
  const needsAction = r.status === 'draft' || r.needsLegalReview === true
  if (!needsAction) {
    return jsonResponse(409, { message: "Nothing to nudge — record isn't draft and doesn't need legal review." })
  }

  // Owner email must be set and on the allowed domain
  const ownerEmail = (r.ownerEmail || '').toLowerCase().trim()
  if (!ownerEmail || !ownerEmail.endsWith('@' + ALLOWED_EMAIL_DOMAIN)) {
    return jsonResponse(400, { message: 'Owner email is missing or not on the allowed domain. Assign a real owner first.' })
  }

  // Cooldown — don't double-nudge
  if (r.lastNudgedAt) {
    const hoursAgo = (Date.now() - new Date(r.lastNudgedAt).getTime()) / (1000 * 60 * 60)
    if (hoursAgo < NUDGE_COOLDOWN_HOURS) {
      const wait = Math.ceil(NUDGE_COOLDOWN_HOURS - hoursAgo)
      return jsonResponse(429, { message: `Owner was recently nudged. Try again in ${wait}h.` })
    }
  }

  // Look up Slack user by email
  const token = await getSlackBotToken()
  if (!token) return jsonResponse(500, { message: 'Slack bot token not configured' })

  const lookupRes = await slackApi(token, 'users.lookupByEmail', { email: ownerEmail })
  if (!lookupRes.ok || !lookupRes.user) {
    return jsonResponse(404, {
      message: `Slack user not found for ${ownerEmail}. The owner may have left the company.`,
    })
  }
  if (lookupRes.user.deleted) {
    return jsonResponse(404, {
      message: `${ownerEmail} appears to be a former employee (Slack account deactivated). Reassign the owner first.`,
    })
  }

  const userId = lookupRes.user.id
  const firstName = (r.ownerName || '').split(' ')[0] || 'there'
  const reason = r.needsLegalReview && r.status === 'draft'
    ? 'It’s a draft and needs legal verification.'
    : r.needsLegalReview
    ? 'It’s pending legal verification.'
    : 'It’s still a draft awaiting completion.'

  const url = recordUrl(id)
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Hi ${firstName} 👋\n\nA record you're listed as the owner of needs attention in the ${APP_NAME} register:\n\n*${r.activityName || '(unnamed)'}*\n\n${reason}`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open record' },
          url: url || APP_BASE_URL,
        },
      ],
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `_Sent from ${APP_NAME} on behalf of ${actorEmail}_` }] },
  ]

  const postRes = await slackApi(token, 'chat.postMessage', {
    channel: userId,
    text: `A RoPA record needs attention: ${r.activityName || '(unnamed)'}`,
    blocks,
  })

  if (!postRes.ok) {
    console.error('Slack postMessage failed', postRes)
    return jsonResponse(502, { message: `Slack DM failed: ${postRes.error || 'unknown error'}` })
  }

  // Persist nudge timestamp + changelog
  const now = nowIso()
  const entry = {
    timestamp: now,
    actorEmail,
    eventType: 'nudged_owner',
    note: `Slack DM sent to ${ownerEmail}`,
  }
  const updated = {
    ...r,
    lastNudgedAt: now,
    changeLog: [...(r.changeLog || []), entry],
  }
  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }))

  return jsonResponse(200, updated)
}

async function getSlackBotToken() {
  if (cachedSlackBotToken) return cachedSlackBotToken
  if (!SLACK_BOT_TOKEN_SECRET_NAME) return null
  try {
    const res = await secrets.send(new GetSecretValueCommand({ SecretId: SLACK_BOT_TOKEN_SECRET_NAME }))
    const raw = res.SecretString
    if (!raw) return null
    cachedSlackBotToken = raw.startsWith('xox') ? raw : null
    return cachedSlackBotToken
  } catch (err) {
    console.error('getSlackBotToken failed', err)
    return null
  }
}

async function slackApi(token, method, payload) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  return res.json()
}

// ---- Slack notifications (channel webhook) ----

async function getSlackWebhook() {
  if (cachedSlackWebhook) return cachedSlackWebhook
  if (!SLACK_WEBHOOK_SECRET_NAME) return null
  try {
    const res = await secrets.send(new GetSecretValueCommand({ SecretId: SLACK_WEBHOOK_SECRET_NAME }))
    const raw = res.SecretString
    if (!raw) return null
    let url = raw.trim()
    // Allow JSON-wrapped secret (e.g. {"webhookUrl":"https://..."})
    if (url.startsWith('{')) {
      try {
        const obj = JSON.parse(url)
        url = obj.webhookUrl || obj.url || obj.SLACK_WEBHOOK_URL || ''
      } catch {
        // fall through
      }
    }
    if (!url || !url.startsWith('http')) return null
    cachedSlackWebhook = url
    return cachedSlackWebhook
  } catch (err) {
    console.warn('Slack webhook fetch failed', err && err.message)
    return null
  }
}

async function postSlack(webhook, payload, attempt = 0) {
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok && attempt === 0 && (res.status >= 500 || res.status === 429)) {
      return postSlack(webhook, payload, 1)
    }
  } catch (err) {
    if (attempt === 0) return postSlack(webhook, payload, 1)
    console.warn('Slack notify failed', err && err.message)
  }
}

async function notifySlack(payload) {
  const webhook = await getSlackWebhook()
  if (!webhook) return
  await postSlack(webhook, payload)
}

function recordUrl(id) {
  if (!APP_BASE_URL) return ''
  return `${APP_BASE_URL}/activities/${encodeURIComponent(id)}`
}

function yn(v) { return v ? 'Yes' : 'No' }

async function notifyPendingSubmission(record) {
  const url = recordUrl(record.id)
  const flagsLine = `Children: ${yn(record.childrensData)} · Special category: ${yn(record.specialCategoryData)} · Transfer: ${yn(record.internationalTransfers)} · AI: ${yn(record.aiInvolvement)}`
  const lines = [
    '*New RoPA submission for review*',
    `*Activity:* ${record.activityName || '(unnamed)'}`,
    `*Submitter:* ${record.createdByEmail || '—'}`,
    `*Department:* ${record.department || '—'}`,
    `*Flags:* ${flagsLine}`,
  ]
  if (url) lines.push(`<${url}|View in RoPA>`)
  await notifySlack({
    text: `New RoPA submission for review: ${record.activityName || '(unnamed)'}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
    ],
  })
}

async function notifyTransition(kind, record, actorEmail, reason) {
  const url = recordUrl(record.id)
  let title
  if (kind === 'approved') title = `Approved: ${record.activityName || '(unnamed)'}`
  else title = `Sent back: ${record.activityName || '(unnamed)'}`

  const lines = [`*${title}*`, `*Reviewer:* ${actorEmail}`]
  if (reason) lines.push(`*Reason:* ${reason}`)
  if (url) lines.push(`<${url}|View in RoPA>`)

  await notifySlack({
    text: title,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
    ],
  })
}

function extractEmail(claims) {
  const email = (claims.email || '').toLowerCase()
  if (email) return email
  // Cognito prefixes federated usernames with "<identityProvider>_".
  // Strip it to recover the bare email when the email claim is absent.
  const username = (claims['cognito:username'] || '').toLowerCase()
  const idpPrefix = (process.env.IDENTITY_PROVIDER_NAME || 'GoogleWorkspace').toLowerCase() + '_'
  if (username.startsWith(idpPrefix)) return username.slice(idpPrefix.length)
  return ''
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    },
    body: JSON.stringify(body),
  }
}

function emptyResponse(statusCode) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    },
    body: '',
  }
}

// ---- Vendor transfers handlers ----

function normalizeVendor(it) {
  if (!it) return it
  return {
    ...it,
    recordType: 'vendor',
    dataCategories: it.dataCategories || [],
    dataSubjects: it.dataSubjects || [],
    linkedActivityIds: it.linkedActivityIds || [],
    changeLog: it.changeLog || [],
    versions: it.versions || [],
  }
}

function sanitizeVendor(input) {
  const out = {}
  for (const k of Object.keys(input || {})) {
    if (VENDOR_ALLOWED_FIELDS.has(k)) out[k] = input[k]
  }
  return out
}

function defaultVendorRecord() {
  return {
    toolName: '',
    vendorName: '',
    description: '',
    processesPersonalData: false,
    dataCategories: [],
    dataSubjects: [],
    dataLocation: 'Unknown',
    dataLocationDetail: '',
    transferMechanism: undefined,
    dpaStatus: 'missing',
    dpaSignedDate: '',
    dpaUrl: '',
    tiaStatus: 'not_assessed',
    tiaNotes: '',
    linkedActivityIds: [],
    ownerName: '',
    ownerEmail: '',
    notes: '',
    needsLegalReview: false,
    lastReviewedAt: '',
    nextReviewAt: undefined,
  }
}

function validateVendor(record, level) {
  const errors = {}
  if (level === 'draft') return errors
  if (!str(record.toolName)) errors.toolName = 'Tool name is required'
  if (!str(record.ownerEmail) || !record.ownerEmail.includes('@')) {
    errors.ownerEmail = 'Valid owner email is required'
  }
  if (level === 'pending') return errors
  if (!record.dataLocation || !DATA_LOCATIONS.includes(record.dataLocation)) {
    errors.dataLocation = 'A valid data location is required'
  }
  if (record.transferMechanism && !TRANSFER_MECHANISMS_V2.includes(record.transferMechanism)) {
    errors.transferMechanism = 'Invalid transfer mechanism'
  }
  if (record.dpaStatus && !DPA_STATUSES.includes(record.dpaStatus)) {
    errors.dpaStatus = 'Invalid DPA status'
  }
  if (record.tiaStatus && !TIA_STATUSES.includes(record.tiaStatus)) {
    errors.tiaStatus = 'Invalid TIA status'
  }
  return errors
}

function vendorRecordUrl(id) {
  if (!APP_BASE_URL) return ''
  return `${APP_BASE_URL}/transfers/${encodeURIComponent(id)}`
}

function vendorMatchesSearch(item, q) {
  const hay = [
    item.toolName,
    item.vendorName || '',
    item.description || '',
    item.dataLocation || '',
    item.dataLocationDetail || '',
    item.transferMechanism || '',
    item.ownerName || '',
    item.ownerEmail || '',
    item.notes || '',
    ...(item.dataCategories || []),
    ...(item.dataSubjects || []),
  ].join(' ').toLowerCase()
  return hay.includes(q)
}

async function listVendors(qs) {
  const status = (qs.status || 'active').toLowerCase()
  const includeArchived = qs.includeArchived === 'true' || qs.includeArchived === '1'
  const statusFilter = qs.status === 'all' || includeArchived ? null : status
  const dataLocation = qs.dataLocation || null
  const transferMechanism = qs.transferMechanism || null
  const dpaStatus = qs.dpaStatus || null
  const tiaStatus = qs.tiaStatus || null
  const q = (qs.q || '').trim().toLowerCase()
  const needsLegalReview = triParam(qs.needsLegalReview)
  const processesPersonalData = triParam(qs.processesPersonalData)

  let items = await paginate(async (cursor) =>
    ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey: cursor })),
  )
  items = items.filter((it) => it && it.recordType === 'vendor')
  if (statusFilter) items = items.filter((it) => it.status === statusFilter)
  if (dataLocation) items = items.filter((it) => it.dataLocation === dataLocation)
  if (transferMechanism) items = items.filter((it) => it.transferMechanism === transferMechanism)
  if (dpaStatus) items = items.filter((it) => it.dpaStatus === dpaStatus)
  if (tiaStatus) items = items.filter((it) => it.tiaStatus === tiaStatus)
  if (needsLegalReview !== null) items = items.filter((it) => !!it.needsLegalReview === needsLegalReview)
  if (processesPersonalData !== null) items = items.filter((it) => !!it.processesPersonalData === processesPersonalData)
  if (q) items = items.filter((it) => vendorMatchesSearch(it, q))

  items.sort((a, b) => (a.toolName || '').localeCompare(b.toolName || ''))
  items = items.map(normalizeVendor)

  return jsonResponse(200, { items, count: items.length })
}

async function getVendor(id) {
  if (id === CONFIG_ID) return jsonResponse(404, { message: 'Not found' })
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!out.Item) return jsonResponse(404, { message: 'Not found' })
  if (out.Item.recordType !== 'vendor') return jsonResponse(404, { message: 'Not found' })
  return jsonResponse(200, normalizeVendor(out.Item))
}

async function createVendor(rawBody, actorEmail, role) {
  const body = sanitizeVendor(rawBody)

  let status
  if (role === 'read') {
    status = 'pending_review'
  } else {
    const requested = body.status
    if (requested === 'active' || requested === 'pending_review' || requested === 'draft') {
      status = requested
    } else {
      status = 'active'
    }
  }

  const merged = { ...defaultVendorRecord(), ...body, status }
  const level = status === 'draft' ? 'draft' : status === 'pending_review' ? 'pending' : 'full'
  const errors = validateVendor(merged, level)
  if (Object.keys(errors).length > 0) {
    return jsonResponse(400, { message: 'Validation failed', errors })
  }

  const now = nowIso()
  const id = 'vendor-' + crypto.randomBytes(8).toString('hex')
  const record = {
    ...merged,
    id,
    recordType: 'vendor',
    createdAt: now,
    createdByEmail: actorEmail,
    lastUpdatedAt: now,
    lastUpdatedByEmail: actorEmail,
    lastReviewedAt: merged.lastReviewedAt || now,
    changeLog: [
      {
        timestamp: now,
        actorEmail,
        eventType: 'created',
        note: `Created as ${status}`,
      },
    ],
  }

  await ddb.send(new PutCommand({ TableName: TABLE, Item: record }))

  if (status === 'pending_review') {
    notifyVendorPending(record).catch(() => {})
  }

  return jsonResponse(201, record)
}

async function updateVendor(id, rawBody, actorEmail) {
  if (id === CONFIG_ID) return jsonResponse(404, { message: 'Not found' })
  const existingOut = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!existingOut.Item || existingOut.Item.recordType !== 'vendor') {
    return jsonResponse(404, { message: 'Not found' })
  }
  const existing = existingOut.Item

  const patch = sanitizeVendor(rawBody)
  const merged = { ...existing, ...patch }

  const targetStatus = merged.status || 'draft'
  const level = targetStatus === 'draft' ? 'draft' : targetStatus === 'pending_review' ? 'pending' : 'full'
  const errors = validateVendor(merged, level)
  if (Object.keys(errors).length > 0) {
    return jsonResponse(400, { message: 'Validation failed', errors })
  }

  const now = nowIso()
  const newEntries = []
  for (const f of VENDOR_SCALAR_FIELDS) {
    if (!(f in patch)) continue
    const oldV = existing[f]
    const newV = patch[f]
    if (normalizeForCompare(oldV) === normalizeForCompare(newV)) continue
    newEntries.push({
      timestamp: now,
      actorEmail,
      eventType: 'updated',
      fieldName: f,
      oldValue: toLogValue(oldV),
      newValue: toLogValue(newV),
    })
  }
  for (const f of VENDOR_ARRAY_FIELDS) {
    if (!(f in patch)) continue
    const oldV = Array.isArray(existing[f]) ? existing[f] : []
    const newV = Array.isArray(patch[f]) ? patch[f] : []
    if (oldV.join('|') === newV.join('|')) continue
    newEntries.push({
      timestamp: now,
      actorEmail,
      eventType: 'updated',
      fieldName: f,
      oldValue: oldV.join(', '),
      newValue: newV.join(', '),
    })
  }

  if (newEntries.length === 0) {
    return jsonResponse(200, normalizeVendor(existing))
  }

  const merged2 = {
    ...merged,
    id: existing.id,
    recordType: 'vendor',
    createdAt: existing.createdAt,
    createdByEmail: existing.createdByEmail,
    lastUpdatedAt: now,
    lastUpdatedByEmail: actorEmail,
    changeLog: [...(existing.changeLog || []), ...newEntries],
  }
  const updated = withSnapshot(merged2, existing, actorEmail, 'pre-update')

  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }))
  return jsonResponse(200, updated)
}

async function revertVendor(id, body, actorEmail) {
  const existingOut = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!existingOut.Item || existingOut.Item.recordType !== 'vendor') {
    return jsonResponse(404, { message: 'Not found' })
  }
  const existing = existingOut.Item
  const versions = Array.isArray(existing.versions) ? existing.versions : []
  const idx = typeof body?.versionIndex === 'number' ? body.versionIndex : -1
  if (idx < 0 || idx >= versions.length) {
    return jsonResponse(400, { message: 'Invalid versionIndex' })
  }
  const target = versions[idx]
  if (!target?.snapshot) {
    return jsonResponse(400, { message: 'Selected version has no snapshot' })
  }
  const now = nowIso()
  const restored = {
    ...target.snapshot,
    id: existing.id,
    recordType: 'vendor',
    createdAt: existing.createdAt,
    createdByEmail: existing.createdByEmail,
    lastUpdatedAt: now,
    lastUpdatedByEmail: actorEmail,
    changeLog: [
      ...(existing.changeLog || []),
      {
        timestamp: now,
        actorEmail,
        eventType: 'reverted',
        note: `Reverted to version saved ${target.savedAt} by ${target.savedByEmail}`,
      },
    ],
  }
  const final = withSnapshot(restored, existing, actorEmail, 'pre-revert')
  await ddb.send(new PutCommand({ TableName: TABLE, Item: final }))
  return jsonResponse(200, normalizeVendor(final))
}

async function archiveVendor(id, body, actorEmail) {
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!out.Item || out.Item.recordType !== 'vendor') return jsonResponse(404, { message: 'Not found' })
  const reason = (body.reason || '').toString().trim()
  if (!reason) return jsonResponse(400, { message: 'A reason is required to archive' })
  const existing = out.Item
  const now = nowIso()
  const updated = {
    ...existing,
    status: 'archived',
    lastUpdatedAt: now,
    lastUpdatedByEmail: actorEmail,
    changeLog: [...(existing.changeLog || []), { timestamp: now, actorEmail, eventType: 'archived', reason }],
  }
  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }))
  return jsonResponse(200, updated)
}

async function restoreVendor(id, actorEmail) {
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!out.Item || out.Item.recordType !== 'vendor') return jsonResponse(404, { message: 'Not found' })
  const existing = out.Item
  const now = nowIso()
  const updated = {
    ...existing,
    status: 'active',
    lastUpdatedAt: now,
    lastUpdatedByEmail: actorEmail,
    changeLog: [...(existing.changeLog || []), { timestamp: now, actorEmail, eventType: 'restored' }],
  }
  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }))
  return jsonResponse(200, updated)
}

async function flagVendorReview(id, body, actorEmail) {
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!out.Item || out.Item.recordType !== 'vendor') return jsonResponse(404, { message: 'Not found' })
  const existing = out.Item
  const now = nowIso()
  const updated = {
    ...existing,
    needsLegalReview: true,
    lastUpdatedAt: now,
    lastUpdatedByEmail: actorEmail,
    changeLog: [...(existing.changeLog || []), { timestamp: now, actorEmail, eventType: 'flagged_review', reason: body.reason || undefined }],
  }
  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }))
  return jsonResponse(200, updated)
}

async function clearVendorReview(id, body, actorEmail) {
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!out.Item || out.Item.recordType !== 'vendor') return jsonResponse(404, { message: 'Not found' })
  const existing = out.Item
  const now = nowIso()
  const updated = {
    ...existing,
    needsLegalReview: false,
    lastUpdatedAt: now,
    lastUpdatedByEmail: actorEmail,
    changeLog: [...(existing.changeLog || []), { timestamp: now, actorEmail, eventType: 'cleared_review', reason: body.note || undefined }],
  }
  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }))
  return jsonResponse(200, updated)
}

async function approveVendor(id, body, actorEmail) {
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!out.Item || out.Item.recordType !== 'vendor') return jsonResponse(404, { message: 'Not found' })
  const existing = out.Item
  if (existing.status !== 'pending_review') return jsonResponse(409, { message: 'Transfer is not pending review' })
  const reason = body && typeof body.reason === 'string' ? body.reason.trim() : ''
  const now = nowIso()
  const entry = { timestamp: now, actorEmail, eventType: 'approved' }
  if (reason) entry.reason = reason
  const updated = {
    ...existing,
    status: 'active',
    lastUpdatedAt: now,
    lastUpdatedByEmail: actorEmail,
    lastReviewedAt: now,
    changeLog: [...(existing.changeLog || []), entry],
  }
  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }))
  notifyVendorTransition('approved', updated, actorEmail, reason).catch(() => {})
  return jsonResponse(200, updated)
}

async function sendBackVendor(id, body, actorEmail) {
  const reason = body && typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason) return jsonResponse(400, { message: 'A reason is required to send back' })
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!out.Item || out.Item.recordType !== 'vendor') return jsonResponse(404, { message: 'Not found' })
  const existing = out.Item
  if (existing.status !== 'pending_review') return jsonResponse(409, { message: 'Transfer is not pending review' })
  const now = nowIso()
  const updated = {
    ...existing,
    status: 'draft',
    lastUpdatedAt: now,
    lastUpdatedByEmail: actorEmail,
    changeLog: [...(existing.changeLog || []), { timestamp: now, actorEmail, eventType: 'sent_back', reason }],
  }
  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }))
  notifyVendorTransition('sent_back', updated, actorEmail, reason).catch(() => {})
  return jsonResponse(200, updated)
}

async function nudgeVendorOwner(id, actorEmail) {
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }))
  if (!out.Item || out.Item.recordType !== 'vendor') return jsonResponse(404, { message: 'Not found' })
  const r = out.Item

  const needsAction = r.status === 'draft' || r.needsLegalReview === true
  if (!needsAction) {
    return jsonResponse(409, { message: "Nothing to nudge — record isn't draft and doesn't need legal review." })
  }

  const ownerEmail = (r.ownerEmail || '').toLowerCase().trim()
  if (!ownerEmail || !ownerEmail.endsWith('@' + ALLOWED_EMAIL_DOMAIN)) {
    return jsonResponse(400, { message: 'Owner email is missing or not on the allowed domain. Assign a real owner first.' })
  }

  if (r.lastNudgedAt) {
    const hoursAgo = (Date.now() - new Date(r.lastNudgedAt).getTime()) / (1000 * 60 * 60)
    if (hoursAgo < NUDGE_COOLDOWN_HOURS) {
      const wait = Math.ceil(NUDGE_COOLDOWN_HOURS - hoursAgo)
      return jsonResponse(429, { message: `Owner was recently nudged. Try again in ${wait}h.` })
    }
  }

  const token = await getSlackBotToken()
  if (!token) return jsonResponse(500, { message: 'Slack bot token not configured' })

  const lookupRes = await slackApi(token, 'users.lookupByEmail', { email: ownerEmail })
  if (!lookupRes.ok || !lookupRes.user) {
    return jsonResponse(404, { message: `Slack user not found for ${ownerEmail}.` })
  }
  if (lookupRes.user.deleted) {
    return jsonResponse(404, { message: `${ownerEmail} appears to be a former employee.` })
  }

  const userId = lookupRes.user.id
  const firstName = (r.ownerName || '').split(' ')[0] || 'there'
  const reason = r.needsLegalReview && r.status === 'draft'
    ? 'It’s a draft transfer assessment and needs legal verification.'
    : r.needsLegalReview
    ? 'It’s pending legal verification.'
    : 'It’s still a draft awaiting completion.'

  const url = vendorRecordUrl(id)
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Hi ${firstName} 👋\n\nA data-transfer assessment you're listed as the owner of needs attention in the ${APP_NAME} register:\n\n*${r.toolName || '(unnamed tool)'}*\n\n${reason}`,
      },
    },
    {
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Open record' }, url: url || APP_BASE_URL },
      ],
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `_Sent from ${APP_NAME} on behalf of ${actorEmail}_` }] },
  ]

  const postRes = await slackApi(token, 'chat.postMessage', {
    channel: userId,
    text: `A transfer assessment needs attention: ${r.toolName || '(unnamed)'}`,
    blocks,
  })

  if (!postRes.ok) {
    console.error('Slack postMessage failed', postRes)
    return jsonResponse(502, { message: `Slack DM failed: ${postRes.error || 'unknown error'}` })
  }

  const now = nowIso()
  const updated = {
    ...r,
    lastNudgedAt: now,
    changeLog: [...(r.changeLog || []), { timestamp: now, actorEmail, eventType: 'nudged_owner', note: `Slack DM sent to ${ownerEmail}` }],
  }
  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }))
  return jsonResponse(200, updated)
}

async function notifyVendorPending(record) {
  const url = vendorRecordUrl(record.id)
  const lines = [
    '*New transfer assessment for review*',
    `*Tool:* ${record.toolName || '(unnamed)'}`,
    `*Submitter:* ${record.createdByEmail || '—'}`,
    `*Location:* ${record.dataLocation || '—'}`,
    `*Mechanism:* ${record.transferMechanism || '—'}`,
    `*DPA:* ${record.dpaStatus || '—'} · *TIA:* ${record.tiaStatus || '—'}`,
  ]
  if (url) lines.push(`<${url}|View in RoPA>`)
  await notifySlack({
    text: `New transfer assessment for review: ${record.toolName || '(unnamed)'}`,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } }],
  })
}

async function notifyVendorTransition(kind, record, actorEmail, reason) {
  const url = vendorRecordUrl(record.id)
  let title
  if (kind === 'approved') title = `Approved transfer: ${record.toolName || '(unnamed)'}`
  else title = `Sent back transfer: ${record.toolName || '(unnamed)'}`
  const lines = [`*${title}*`, `*Reviewer:* ${actorEmail}`]
  if (reason) lines.push(`*Reason:* ${reason}`)
  if (url) lines.push(`<${url}|View in RoPA>`)
  await notifySlack({
    text: title,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } }],
  })
}

// Suppress unused-import warning for UpdateCommand (kept available for future granular updates)
void UpdateCommand
