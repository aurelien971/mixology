'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import AddProductModal from '@/components/catalog/AddProductModal'
import EditProductModal from '@/components/catalog/EditProductModal'
import { getProducts, getAllPricing, updateProduct } from '@/lib/firestore/catalog'
import { Product, AccountPricing } from '@/types'
import { useTable, ColumnDef } from '@/hooks/useTable'
import toast from 'react-hot-toast'

// Both of these mirror what the cells render, so a column always sorts by the
// thing you can actually see in it.
function productType(p: Product): string {
  return p.isNonAlcoholic ? 'N/A' : p.isCoreRange ? 'Core' : 'Venue'
}

function unitCost(p: Product): number {
  return p.costToMake ?? (p as Product & { costPerUnit?: number }).costPerUnit ?? 0
}

const COLUMNS: ColumnDef<Product>[] = [
  { key: 'code',     label: 'Code',            width: 110, sortValue: (p) => p.productCode },
  { key: 'name',     label: 'Cocktail',        width: 240, sortValue: (p) => p.name },
  { key: 'cat',      label: 'Category',        width: 130, sortValue: (p) => p.category },
  { key: 'serve',    label: 'Serve size',      width: 100, align: 'right', sortValue: (p) => p.recommendedServingG, descFirst: true },
  { key: 'perLitre', label: 'Servings / litre',width: 128, align: 'right', sortValue: (p) => 1000 / (p.recommendedServingG || 100), descFirst: true },
  { key: 'costUnit', label: 'Cost / unit',     width: 108, align: 'right', sortValue: (p) => (p.costMissing ? null : unitCost(p)), descFirst: true },
  { key: 'costL',    label: 'Cost / litre',    width: 108, align: 'right', sortValue: (p) => (p.costMissing ? null : (unitCost(p) / (p.recommendedServingG || 100)) * 1000), descFirst: true },
  { key: 'type',     label: 'Type',            width: 108, sortValue: (p) => productType(p) },
  { key: 'go',       label: '',                width: 74 },
]

const CATEGORIES = [
  'All', 'Highball', 'Martini', 'Sour', 'Negroni', 'Margarita',
  'Spritz', 'G&T', 'Old Fashioned', 'Milk Punch', 'Tropical',
  'Savoury', 'Coffee', 'Non-Alcoholic',
]

export default function CatalogPage() {
  const searchParams = useSearchParams()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [accountFilter, setAccountFilter] = useState('All')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [hidden, setHidden] = useState(true)
  const [missingOnly, setMissingOnly] = useState(searchParams.get('missing') === '1')
  const [allPricing, setAllPricing] = useState<AccountPricing[]>([])
  const cols = useTable<Product>('catalog', COLUMNS)

  function load() {
    Promise.all([getProducts(), getAllPricing()])
      .then(([prods, pricing]) => { setProducts(prods); setAllPricing(pricing) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Build list of accounts that have any pricing
  const allAccounts = ['All', ...Array.from(new Set(allPricing.map(p => p.accountName))).sort()]

  // Product IDs that are priced for the selected account
  const pricedForAccount = accountFilter === 'All'
    ? null
    : new Set(allPricing.filter(p => p.accountName === accountFilter).map(p => p.productId))

  const rowsUnsorted = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.productCode.toLowerCase().includes(search.toLowerCase())
    const matchCat     = categoryFilter === 'All' || p.category === categoryFilter
    const matchMissing = !missingOnly || p.costMissing
    const matchAccount = !pricedForAccount || pricedForAccount.has(p.id)
    return matchSearch && matchCat && matchMissing && matchAccount
  })
  const filtered = cols.sortRows(rowsUnsorted)

  const missingTotal = products.filter(p => p.costMissing).length

  // servings per litre = 1000 / serving size in ml (ml ≈ g for these drinks)
  // price per litre = (cost / serving size) * 1000
  function servingsPerLitre(servingG: number) {
    if (!servingG) return '—'
    return (1000 / servingG).toFixed(1)
  }

  function pricePerLitre(costPerUnit: number, servingG: number) {
    if (!servingG || !costPerUnit) return '—'
    return `£${((costPerUnit / servingG) * 1000).toFixed(2)}`
  }

  return (
    <div style={{ position: 'relative' }}>
      {showAddModal && (
        <AddProductModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => { load() }}
        />
      )}
      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={() => { load() }}
        />
      )}
      <Header
        title="Catalog"
        subtitle={`Master product list — costs and serve sizes${filtered.filter(p => p.costMissing).length > 0 ? ` · ⚠ ${filtered.filter(p => p.costMissing).length} missing costs` : ''}`}
        action={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setHidden(h => !h)}
              title={hidden ? 'Show costs' : 'Hide costs'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '34px', height: '34px', borderRadius: '8px',
                border: '1px solid #e5e7eb', background: '#fff',
                cursor: 'pointer', color: '#9ca3af',
              }}
            >
              {hidden ? (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <path d="M3 3l14 14M8.5 8.6A3 3 0 0011.4 11.5M6.5 6.6C4.8 7.7 3.5 9 2 10c2 2.7 5 5 8 5a8 8 0 003.5-.8M9 5.1A8 8 0 0118 10c-.7 1-1.6 1.9-2.6 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <ellipse cx="10" cy="10" rx="8" ry="5" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              )}
            </button>
            <Button size="sm" onClick={() => setShowAddModal(true)}>+ Add product</Button>
          </div>
        }
      />

      {missingOnly && missingTotal > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '10px', marginBottom: '16px' }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: '#92400e' }}>
            ⚠ Showing {missingTotal} product{missingTotal !== 1 ? 's' : ''} with missing costs — click <strong>+ Add cost</strong> on each row to fix
          </span>
          <button
            onClick={() => setMissingOnly(false)}
            style={{ fontSize: '12px', color: '#92400e', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Show all
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search by name or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 bg-white"
        />
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                categoryFilter === cat
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Account filter */}
      {allAccounts.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>Account:</span>
          {allAccounts.map(acc => (
            <button
              key={acc}
              onClick={() => setAccountFilter(acc)}
              style={{
                padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                border: `1px solid ${accountFilter === acc ? '#111827' : '#e5e7eb'}`,
                background: accountFilter === acc ? '#111827' : '#fff',
                color: accountFilter === acc ? '#fff' : '#6b7280',
              }}
            >
              {acc}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <p className="text-sm text-gray-400 mb-3">
            {search || categoryFilter !== 'All' ? 'No products match your search' : 'No products yet'}
          </p>
          {!search && categoryFilter === 'All' && <Button size="sm">Add first product</Button>}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100" style={{ overflowX: 'auto' }}>
          <table className="dt" style={{ minWidth: cols.minWidth }}>
              <cols.ColGroup />
              <cols.Head />
            <tbody>
              {filtered.map((product) => (
                <tr
                  key={product.id}
                  className={`border-b border-gray-50 transition-colors ${product.costMissing ? 'bg-amber-50 hover:bg-amber-50' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-5 py-3 text-xs text-gray-400 font-mono">
                    {product.productCode}
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-sm font-medium text-gray-900">{product.name}</p>
                    {product.servingNotes && (
                      <p className="text-xs text-gray-400">{product.servingNotes}</p>
                    )}
                    {product.costMissing && (
                      <p className="text-xs font-medium" style={{ color: '#92400e' }}>⚠ Cost missing — profit calculations affected</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-500">
                    {product.category ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-sm text-right text-gray-600">
                    {product.recommendedServingG}ml
                  </td>
                  <td className="px-5 py-3 text-sm text-right text-gray-600">
                    {servingsPerLitre(product.recommendedServingG)}
                  </td>
                  <td className="px-5 py-3 text-sm text-right font-medium text-gray-900">
                    <span style={hidden ? { filter: 'blur(6px)', userSelect: 'none', display: 'inline-block' } : {}}>
                      {product.costMissing
                        ? <span style={{ color: '#92400e', fontSize: '11px', fontWeight: 600 }}>not set</span>
                        : `£${unitCost(product).toFixed(2)}`
                      }
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-right font-medium text-gray-700">
                    <span style={hidden ? { filter: 'blur(6px)', userSelect: 'none', display: 'inline-block' } : {}}>
                      {product.costMissing ? '—' : pricePerLitre(unitCost(product), product.recommendedServingG)}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {product.isNonAlcoholic ? (
                      <Badge label="N/A" variant="green" />
                    ) : product.isCoreRange ? (
                      <Badge label="Core" variant="blue" />
                    ) : (
                      <Badge label="Venue" variant="gray" />
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {product.costMissing ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                        <button
                          onClick={() => setEditingProduct(product)}
                          style={{
                            padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                            background: '#92400e', color: '#fff', border: 'none', cursor: 'pointer',
                            whiteSpace: 'nowrap' as const,
                          }}
                        >
                          + Add cost
                        </button>
                        <button
                          title="Remove from the platform"
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (!confirm(`Remove “${product.name}” (${product.productCode}) from the platform?\n\nIt disappears from the catalog, recipes and pricing — past orders keep their numbers.`)) return
                            try {
                              await updateProduct(product.id, { isActive: false })
                              toast.success(`${product.name} removed`)
                              load()
                            } catch { toast.error('Failed to remove') }
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d97706', fontSize: '15px', padding: '2px 4px', lineHeight: 1 }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#dc2626')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#d97706')}
                        >×</button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setEditingProduct(product)}>Edit</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
            {filtered.length} products · Costs shown are Foodlab production costs. Sell prices are set per account in the Accounts → Pricing tab.
          </div>
        </div>
      )}
    </div>
  )
}