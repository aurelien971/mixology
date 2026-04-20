import { format, addDays } from 'date-fns'
import { Order } from '@/types'

interface XeroInvoiceOptions {
  order: Order
  legalName?: string
  email?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  postcode?: string
  paymentTermsDays?: number
  accountCode?: string   // Xero sales account code, default 200
}

// Xero CSV column order (must match exactly)
const HEADERS = [
  '*ContactName', 'EmailAddress',
  'POAddressLine1', 'POAddressLine2', 'POAddressLine3', 'POAddressLine4',
  'POCity', 'PORegion', 'POPostalCode', 'POCountry',
  '*InvoiceNumber', 'Reference',
  '*InvoiceDate', '*DueDate',
  'Total',
  'InventoryItemCode', '*Description', '*Quantity', '*UnitAmount',
  'Discount', '*AccountCode', '*TaxType', 'TaxAmount',
  'TrackingName1', 'TrackingOption1', 'TrackingName2', 'TrackingOption2',
  'Currency', 'BrandingTheme',
]

function csvEscape(val: string | number | undefined): string {
  const s = String(val ?? '')
  // Wrap in quotes if contains comma, quote, or newline
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function row(values: (string | number | undefined)[]): string {
  return values.map(csvEscape).join(',')
}

export function generateXeroCSV(opts: XeroInvoiceOptions): string {
  const {
    order,
    legalName,
    email        = '',
    addressLine1 = '',
    addressLine2 = '',
    city         = '',
    postcode     = '',
    paymentTermsDays = 30,
    accountCode  = '200',
  } = opts

  const invoiceNumber = order.invoiceNumber ?? `INV-${order.orderNumber.replace('FL-', '')}`
  const issueDate     = format(order.deliveryDate ?? order.createdAt, 'dd/MM/yyyy')
  const dueDate       = format(addDays(order.deliveryDate ?? order.createdAt, paymentTermsDays), 'dd/MM/yyyy')
  const contactName   = legalName ?? order.accountName
  const reference     = order.poReference ?? order.orderNumber

  const lines: string[] = [HEADERS.join(',')]

  order.lineItems.forEach((item, i) => {
    // Contact/address fields only on the first line — Xero groups rows by InvoiceNumber
    const isFirst = i === 0

    lines.push(row([
      isFirst ? contactName   : '',   // *ContactName
      isFirst ? email         : '',   // EmailAddress
      isFirst ? addressLine1  : '',   // POAddressLine1
      isFirst ? addressLine2  : '',   // POAddressLine2
      '',                             // POAddressLine3
      '',                             // POAddressLine4
      isFirst ? city          : '',   // POCity
      '',                             // PORegion
      isFirst ? postcode      : '',   // POPostalCode
      isFirst ? 'GB'          : '',   // POCountry
      invoiceNumber,                  // *InvoiceNumber
      isFirst ? reference     : '',   // Reference
      isFirst ? issueDate     : '',   // *InvoiceDate
      isFirst ? dueDate       : '',   // *DueDate
      '',                             // Total (Xero calculates)
      item.productCode,               // InventoryItemCode
      item.productName,               // *Description
      item.quantity,                  // *Quantity
      item.unitPrice.toFixed(2),      // *UnitAmount
      '',                             // Discount
      accountCode,                    // *AccountCode
      'OUTPUT2',                      // *TaxType (20% VAT on Income, UK)
      '',                             // TaxAmount (Xero calculates)
      '', '', '', '',                 // Tracking fields
      'GBP',                          // Currency
      '',                             // BrandingTheme
    ]))
  })

  return lines.join('\n')
}

export function downloadXeroCSV(opts: XeroInvoiceOptions): void {
  const csv      = generateXeroCSV(opts)
  const blob     = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url      = URL.createObjectURL(blob)
  const filename = `${opts.order.invoiceNumber ?? opts.order.orderNumber}-Xero.csv`
  const a        = document.createElement('a')
  a.href         = url
  a.download     = filename
  a.click()
  URL.revokeObjectURL(url)
}