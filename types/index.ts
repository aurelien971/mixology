export type AccountType = 'internal' | 'external'

export type OrderStatus =
  | 'received'
  | 'production'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'

export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'disputed'

export type PaymentTerms =
  | 'net_14'
  | 'net_30'
  | 'net_60'
  | 'upfront'
  | 'split_50'

export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  net_14: 'Net 14 days',
  net_30: 'Net 30 days',
  net_60: 'Net 60 days',
  upfront: 'Upfront (100%)',
  split_50: '50% upfront / 50% on delivery',
}

export const PAYMENT_TERMS_DAYS: Record<PaymentTerms, number> = {
  net_14: 14,
  net_30: 30,
  net_60: 60,
  upfront: 0,
  split_50: 30,
}

export interface Group {
  id: string
  name: string
  type: 'managed' | 'standalone'
  contactEmail?: string
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export interface Account {
  id: string
  legalName: string
  tradingName: string
  type: AccountType
  groupId?: string
  groupName?: string
  email: string
  phone?: string
  address: {
    line1: string
    line2?: string
    city: string
    postcode: string
  }
  billingEmail?: string
  vatNumber?: string
  paymentTerms: PaymentTerms
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export interface Product {
  id: string
  productCode: string
  name: string
  description?: string
  category?: string
  servingNotes?: string
  costToMake: number            // Foodlab production cost — internal only
  costMissing: boolean          // true when cost data is not yet known
  recommendedServingG: number
  isNonAlcoholic: boolean
  isCoreRange: boolean          // available to any external client
  defaultPricePerLitre?: number // standard sell price/L for core range
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface AccountPricing {
  id: string
  accountId: string
  accountName: string
  groupId?: string
  groupName?: string
  productId: string
  productCode: string
  productName: string
  recommendedServingG: number
  pricePerUnit: number
  pricePerLitre: number
  rrp: number
  venueGpPercent: number
  foodlabGpPercent: number      // internal — never shown in client PDFs
  createdAt: Date
  updatedAt: Date
}

export interface OrderLineItem {
  productId: string
  productCode: string
  productName: string
  quantity: number
  unitPrice: number
  lineTotal: number
  servingSizeG: number
}

export interface Order {
  id: string
  orderNumber: string
  accountId: string
  accountName: string
  status: OrderStatus
  lineItems: OrderLineItem[]
  subtotal: number
  vatRate: number
  vatAmount: number
  total: number
  notes?: string
  poReference?: string
  expectedDeliveryDate?: Date
  deliveryNoteNumber?: string
  deliveryNoteUrl?: string
  invoiceNumber?: string
  invoiceUrl?: string
  deliveryDate?: Date
  createdAt: Date
  updatedAt: Date
}

export interface Payment {
  id: string
  orderId: string
  orderNumber: string
  accountId: string
  accountName: string
  invoiceNumber: string
  amount: number
  dueDate: Date
  paidDate?: Date
  status: PaymentStatus
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export interface DashboardStats {
  totalRevenueMTD: number
  totalOutstanding: number
  ordersThisMonth: number
  overdueCount: number
}