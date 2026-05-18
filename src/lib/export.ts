import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import type { Activity, OrganisationDetails, VendorTransfer } from './types'

function yn(b: boolean) {
  return b ? 'Yes' : 'No'
}

function semi(v: string[] | undefined) {
  return v && v.length ? v.join('; ') : ''
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function stamp() {
  return new Date().toISOString().slice(0, 10)
}

const ORG_LABELS: Record<keyof OrganisationDetails, string> = {
  companyName: 'Company name',
  chamberOfCommerce: 'Chamber of Commerce (KvK)',
  address: 'Address',
  contactName: 'Primary contact name',
  contactEmail: 'Primary contact email',
  contactPhone: 'Primary contact phone',
  dpoName: 'DPO name',
  dpoEmail: 'DPO email',
  tomsReferenceUrl: 'TOMs reference URL',
  tomsReferenceVersion: 'TOMs reference version',
}

export async function exportToExcel(
  activities: Activity[],
  organisation: OrganisationDetails = {},
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'RoPA Register'
  wb.created = new Date()

  const ws = wb.addWorksheet('Processing activities')
  const headers = [
    'ID',
    'Status',
    'Role',
    'Activity name',
    'Department',
    'Owner',
    'Purpose (short)',
    'Purpose (full)',
    'Systems / vendors',
    'Recipients',
    'Data subjects',
    'Personal data categories',
    'Lawful basis',
    'Retention period',
    'Retention notes',
    'International transfers',
    'Transfer mechanism',
    'Transfer countries',
    "Children's data",
    'Special category',
    'AI involvement',
    'TOMs',
    'TOMs additional',
    'Needs legal review',
    'DPIA status',
    'References',
    'Notes',
    'Created at',
    'Last updated at',
    'Last reviewed at',
  ]
  ws.addRow(headers)
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } }

  for (const a of activities) {
    ws.addRow([
      a.id,
      a.status,
      a.controllerRole,
      a.activityName,
      a.department,
      a.ownerEmail,
      a.purposeShort,
      a.purposeFull,
      semi(a.systemsVendors),
      semi(a.recipients),
      semi(a.dataSubjects),
      semi(a.personalDataCategories),
      a.lawfulBasis,
      a.retentionPeriod,
      a.retentionNotes || '',
      yn(a.internationalTransfers),
      a.transferMechanism || '',
      semi(a.transferCountries),
      yn(a.childrensData),
      yn(a.specialCategoryData),
      yn(a.aiInvolvement),
      semi(a.tomsChecklist),
      a.tomsAdditional || '',
      yn(a.needsLegalReview),
      a.dpiaStatus,
      a.references || '',
      a.notes || '',
      a.createdAt?.slice(0, 10) || '',
      a.lastUpdatedAt?.slice(0, 10) || '',
      a.lastReviewedAt?.slice(0, 10) || '',
    ])
  }
  ws.columns.forEach((c) => {
    c.width = Math.min(40, Math.max(14, (c.header?.toString().length || 14) + 2))
  })

  const org = wb.addWorksheet('Organisation details')
  for (const key of Object.keys(ORG_LABELS) as (keyof OrganisationDetails)[]) {
    const v = organisation[key]
    if (v) org.addRow([ORG_LABELS[key], v])
  }
  if (org.rowCount === 0) {
    org.addRow(['Company name', '(not configured — set in Admin → Organisation details)'])
  }
  org.getColumn(1).width = 28
  org.getColumn(2).width = 60

  const meta = wb.addWorksheet('Export metadata')
  meta.addRow(['Exported at', new Date().toISOString()])
  meta.addRow(['Record count', activities.length])
  meta.addRow(['Tool', 'RoPA Register'])
  meta.getColumn(1).width = 20
  meta.getColumn(2).width = 60

  const buf = await wb.xlsx.writeBuffer()
  download(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `ropa-register-${stamp()}.xlsx`,
  )
}

export async function exportToPdf(
  activities: Activity[],
  organisation: OrganisationDetails = {},
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const margin = 36
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  const drawFooter = () => {
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(120)
      doc.text(`RoPA Register — Confidential  ·  Page ${i} of ${pageCount}`, margin, pageH - 18)
      doc.setTextColor(0)
    }
  }

  // Cover
  doc.setFontSize(22)
  doc.text('Register of Processing Activities', margin, margin + 20)
  doc.setFontSize(11)
  doc.setTextColor(80)
  let coverY = margin + 44
  if (organisation.companyName) {
    doc.text(organisation.companyName, margin, coverY)
    coverY += 16
  }
  const idLine: string[] = []
  if (organisation.chamberOfCommerce) idLine.push(`KvK: ${organisation.chamberOfCommerce}`)
  if (organisation.dpoEmail) idLine.push(`DPO: ${organisation.dpoEmail}`)
  else if (organisation.dpoName) idLine.push(`DPO: ${organisation.dpoName}`)
  if (idLine.length) {
    doc.text(idLine.join('  ·  '), margin, coverY)
    coverY += 16
  }
  if (organisation.address) {
    doc.text(organisation.address, margin, coverY)
    coverY += 16
  }
  doc.text(`Exported: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, margin, coverY)
  coverY += 16
  doc.text(`Records: ${activities.length}`, margin, coverY)
  doc.setTextColor(0)

  for (const a of activities) {
    doc.addPage()
    let y = margin
    doc.setFontSize(14)
    doc.text(a.activityName || '(untitled)', margin, y)
    y += 18
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(
      `${a.department} · ${a.ownerEmail} · ${a.controllerRole} · status: ${a.status}`,
      margin,
      y,
    )
    doc.setTextColor(0)
    y += 16

    const rows: [string, string][] = [
      ['Purpose', a.purposeFull || a.purposeShort || ''],
      ['Systems / vendors', semi(a.systemsVendors)],
      ['Recipients', semi(a.recipients)],
      ['Data subjects', semi(a.dataSubjects)],
      ['Personal data', semi(a.personalDataCategories)],
      ['Lawful basis', a.lawfulBasis],
      ['Retention', a.retentionPeriod + (a.retentionNotes ? ` — ${a.retentionNotes}` : '')],
      [
        'International transfers',
        a.internationalTransfers
          ? `Yes${a.transferMechanism ? ` (${a.transferMechanism})` : ''}${
              a.transferCountries?.length ? ` — ${a.transferCountries.join(', ')}` : ''
            }`
          : 'No',
      ],
      ["Children's data", yn(a.childrensData)],
      ['Special category', yn(a.specialCategoryData)],
      ['AI involvement', yn(a.aiInvolvement)],
      ['TOMs', semi(a.tomsChecklist)],
      ['Additional TOMs', a.tomsAdditional || ''],
      ['DPIA status', a.dpiaStatus],
      ['Needs legal review', yn(a.needsLegalReview)],
      ['Last reviewed', a.lastReviewedAt?.slice(0, 10) || ''],
      ['References', a.references || ''],
      ['Notes', a.notes || ''],
    ]
    doc.setFontSize(9)
    for (const [k, v] of rows) {
      if (y > pageH - margin - 40) {
        doc.addPage()
        y = margin
      }
      doc.setFont('helvetica', 'bold')
      doc.text(k + ':', margin, y)
      doc.setFont('helvetica', 'normal')
      const wrapped = doc.splitTextToSize(v || '—', pageW - margin * 2 - 120)
      doc.text(wrapped, margin + 120, y)
      y += Math.max(12, wrapped.length * 11) + 2
    }
  }

  drawFooter()
  const blob = doc.output('blob')
  download(blob, `ropa-register-${stamp()}.pdf`)
}

export async function exportTransfersToExcel(
  transfers: VendorTransfer[],
  organisation: OrganisationDetails = {},
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'RoPA Register'
  wb.created = new Date()

  const ws = wb.addWorksheet('Data transfers')
  const headers = [
    'ID', 'Status', 'Tool name', 'Vendor', 'Description',
    'Processes personal data', 'Data categories', 'Data subjects',
    'Data location', 'Location detail', 'Transfer mechanism',
    'DPA status', 'DPA signed date', 'DPA URL',
    'TIA status', 'TIA notes',
    'Owner', 'Owner email', 'Needs legal review',
    'Notes', 'Created at', 'Last updated at', 'Last reviewed at',
  ]
  ws.addRow(headers)
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } }

  for (const v of transfers) {
    ws.addRow([
      v.id, v.status, v.toolName, v.vendorName || '', v.description || '',
      yn(v.processesPersonalData), semi(v.dataCategories), semi(v.dataSubjects),
      v.dataLocation, v.dataLocationDetail || '', v.transferMechanism || '',
      v.dpaStatus, v.dpaSignedDate || '', v.dpaUrl || '',
      v.tiaStatus, v.tiaNotes || '',
      v.ownerName || '', v.ownerEmail, yn(v.needsLegalReview),
      v.notes || '',
      v.createdAt?.slice(0, 10) || '',
      v.lastUpdatedAt?.slice(0, 10) || '',
      v.lastReviewedAt?.slice(0, 10) || '',
    ])
  }
  ws.columns.forEach((c) => {
    c.width = Math.min(40, Math.max(14, (c.header?.toString().length || 14) + 2))
  })

  const org = wb.addWorksheet('Organisation details')
  for (const key of Object.keys(ORG_LABELS) as (keyof OrganisationDetails)[]) {
    const v = organisation[key]
    if (v) org.addRow([ORG_LABELS[key], v])
  }
  if (org.rowCount === 0) org.addRow(['Company name', '(not configured)'])
  org.getColumn(1).width = 28
  org.getColumn(2).width = 60

  const meta = wb.addWorksheet('Export metadata')
  meta.addRow(['Exported at', new Date().toISOString()])
  meta.addRow(['Transfer count', transfers.length])
  meta.addRow(['Tool', 'RoPA Register — Data transfers'])
  meta.getColumn(1).width = 20
  meta.getColumn(2).width = 60

  const buf = await wb.xlsx.writeBuffer()
  download(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `ropa-transfers-${stamp()}.xlsx`,
  )
}

export async function exportTransfersToCsv(transfers: VendorTransfer[]): Promise<void> {
  const headers = [
    'id', 'status', 'toolName', 'vendorName', 'description',
    'processesPersonalData', 'dataCategories', 'dataSubjects',
    'dataLocation', 'dataLocationDetail', 'transferMechanism',
    'dpaStatus', 'dpaSignedDate', 'dpaUrl',
    'tiaStatus', 'tiaNotes',
    'ownerName', 'ownerEmail', 'needsLegalReview',
    'notes', 'createdAt', 'lastUpdatedAt', 'lastReviewedAt',
  ]
  const esc = (s: string) => `"${(s || '').replace(/"/g, '""')}"`
  const lines = [headers.join(',')]
  for (const v of transfers) {
    lines.push([
      v.id, v.status, v.toolName, v.vendorName || '', v.description || '',
      yn(v.processesPersonalData), semi(v.dataCategories), semi(v.dataSubjects),
      v.dataLocation, v.dataLocationDetail || '', v.transferMechanism || '',
      v.dpaStatus, v.dpaSignedDate || '', v.dpaUrl || '',
      v.tiaStatus, v.tiaNotes || '',
      v.ownerName || '', v.ownerEmail, yn(v.needsLegalReview),
      v.notes || '',
      v.createdAt || '', v.lastUpdatedAt || '', v.lastReviewedAt || '',
    ].map((x) => esc(String(x ?? ''))).join(','))
  }
  download(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `ropa-transfers-${stamp()}.csv`)
}

export async function exportToCsv(activities: Activity[]): Promise<void> {
  const headers = [
    'id', 'status', 'role', 'activityName', 'department', 'ownerEmail',
    'purposeShort', 'purposeFull', 'systemsVendors', 'recipients',
    'dataSubjects', 'personalDataCategories', 'lawfulBasis',
    'retentionPeriod', 'retentionNotes', 'internationalTransfers',
    'transferMechanism', 'transferCountries', 'childrensData',
    'specialCategoryData', 'aiInvolvement', 'tomsChecklist', 'tomsAdditional',
    'needsLegalReview', 'dpiaStatus', 'references', 'notes',
    'createdAt', 'lastUpdatedAt', 'lastReviewedAt',
  ]
  const esc = (s: string) => `"${(s || '').replace(/"/g, '""')}"`
  const lines = [headers.join(',')]
  for (const a of activities) {
    lines.push([
      a.id, a.status, a.controllerRole, a.activityName, a.department, a.ownerEmail,
      a.purposeShort, a.purposeFull, semi(a.systemsVendors), semi(a.recipients),
      semi(a.dataSubjects), semi(a.personalDataCategories), a.lawfulBasis,
      a.retentionPeriod, a.retentionNotes || '', yn(a.internationalTransfers),
      a.transferMechanism || '', semi(a.transferCountries), yn(a.childrensData),
      yn(a.specialCategoryData), yn(a.aiInvolvement), semi(a.tomsChecklist), a.tomsAdditional || '',
      yn(a.needsLegalReview), a.dpiaStatus, a.references || '', a.notes || '',
      a.createdAt || '', a.lastUpdatedAt || '', a.lastReviewedAt || '',
    ].map((v) => esc(String(v ?? ''))).join(','))
  }
  download(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `ropa-register-${stamp()}.csv`)
}
