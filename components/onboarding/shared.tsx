import {
  Account, Ingredient, MenuDrink, Order, Product, Recipe, RolloutStage, RolloutVenue, TastingSession,
} from '@/types'
import { StaffUser } from '@/lib/firestore/staffUsers'
import { DrinkState, Readiness } from '@/lib/onboarding'
import { VenueOrders } from '@/lib/rollout'

export const INK = '#111827'
export const SECONDARY = '#6b7280'
export const MUTED = '#9ca3af'

export const card: React.CSSProperties = { background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '16px 18px' }
export const kicker: React.CSSProperties = { fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }
export const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: '13.5px', color: '#374151', border: '1px solid #e5e7eb',
  borderRadius: '8px', outline: 'none', boxSizing: 'border-box', background: '#fff', fontFamily: 'inherit',
}
export const linkBtn: React.CSSProperties = {
  border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit',
  fontSize: '12.5px', color: SECONDARY, textDecoration: 'underline',
}

export const money = (n: number) => '£' + n.toFixed(2)

export type VenueTab = 'overview' | 'menu' | 'gp' | 'recipes' | 'tastings' | 'orders' | 'timeline'

/** Everything a section of a venue page reads, and the ways it can change it. */
export interface VenueCtx {
  venue: RolloutVenue
  account?: Account
  accounts: Account[]
  drinks: MenuDrink[]
  states: Map<string, DrinkState>
  readiness: Readiness
  stage: RolloutStage
  attention: string | null
  orderInfo: VenueOrders
  menuProductIds: Set<string>
  products: Product[]
  recipes: Recipe[]
  ingredients: Ingredient[]
  orders: Order[]
  tastings: TastingSession[]
  staff: StaffUser[]
  patchVenue: (data: Partial<RolloutVenue>, note?: string, auto?: string) => Promise<void>
  patchDrink: (d: MenuDrink, data: Partial<MenuDrink>, note?: string, auto?: string) => Promise<void>
  reload: () => Promise<void>
  openDrink: (id: string) => void
  writeRecipes: (drinks: MenuDrink[]) => void
  goTo: (tab: VenueTab) => void
}

export function Pill({ bg, fg, children, title }: { bg: string; fg: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} style={{ display: 'inline-block', fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '20px', background: bg, color: fg, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

/** A money or number field that saves when you leave it. Empty clears it. */
export function NumInput({ value, onSave, placeholder, width = '90px', decimals = 2, highlightEmpty = false }: {
  value?: number
  onSave: (v: number | undefined) => void
  placeholder?: string
  width?: string
  decimals?: number
  /** Show an empty box in yellow, so what still needs typing stands out. */
  highlightEmpty?: boolean
}) {
  return (
    <input
      key={`n-${value ?? ''}`}
      defaultValue={value !== undefined ? value.toFixed(decimals) : ''}
      inputMode="decimal"
      placeholder={placeholder}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        const raw = e.target.value.replace(/[^0-9.]/g, '')
        const n = raw === '' ? undefined : Math.round(parseFloat(raw) * 10 ** decimals) / 10 ** decimals
        if (n !== undefined && !Number.isFinite(n)) return
        if (n === value) return
        onSave(n)
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      style={{
        ...input, width, padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontSize: '13px',
        ...(highlightEmpty && value === undefined ? { background: '#fffbeb', border: '1.5px solid #fcd34d' } : {}),
      }}
    />
  )
}
