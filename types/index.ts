export interface Account {
  id: string
  legalName: string
  tradingName: string
  type: 'internal' | 'external'
  contactName: string
  contactEmail: string
  contactPhone?: string
  address: string
  vatNumber?: string
  paymentTermsDays: number
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export interface Product {
  id: string
  name: string
  description?: string
  category?: string
  servingSize: number
  isNonAlcoholic: boolean
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface AccountPricing {
  id: string
  accountId: string
  productId: string
  productName: string
  pricePerUnit: number
  rrp: number
  gpPercent: number
  servingSize: number
}

export type OrderStatus = 'received' | 'picking' | 'dispatched' | 'delivered' | 'cancelled'

export interface OrderItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  totalPrice: number
  servingSize: number
}

export interface Order {
  id: string
  orderNumber: string
  accountId: string
  accountName: string
  status: OrderStatus
  items: OrderItem[]
  subtotal: number
  total: number
  deliveryAddress?: string
  notes?: string
  poReference?: string
  deliveryNoteUrl?: string
  invoiceUrl?: string
  createdAt: Date
  updatedAt: Date
  dispatchedAt?: Date
  deliveredAt?: Date
}

export type PaymentStatus = 'pending' | 'paid' | 'overdue'

export interface Payment {
  id: string
  orderId: string
  orderNumber: string
  accountId: string
  accountName: string
  amount: number
  status: PaymentStatus
  dueDate: Date
  paidAt?: Date
  notes?: string
  createdAt: Date
}

export interface DashboardStats {
  revenueThisMonth: number
  revenueLastMonth: number
  ordersThisMonth: number
  pendingPaymentsTotal: number
  overduePaymentsTotal: number
  activeAccounts: number
}