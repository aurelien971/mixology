'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/layout/Header'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import AddProductModal from '@/components/catalog/AddProductModal'
import EditProductModal from '@/components/catalog/EditProductModal'
import { getProducts } from '@/lib/firestore/catalog'
import { Product } from '@/types'

const CATEGORIES = [
  'All', 'Highball', 'Martini', 'Sour', 'Negroni', 'Margarita',
  'Spritz', 'G&T', 'Old Fashioned', 'Milk Punch', 'Tropical',
  'Savoury', 'Coffee', 'Non-Alcoholic',
]

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [hidden, setHidden] = useState(true)

  function load() {
    getProducts()
      .then(setProducts)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.productCode.toLowerCase().includes(search.toLowerCase())
    const matchCat = categoryFilter === 'All' || p.category === categoryFilter
    return matchSearch && matchCat
  })

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
        subtitle="Master product list — costs and serve sizes"
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
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium">Code</th>
                <th className="text-left px-5 py-3 font-medium">Cocktail</th>
                <th className="text-left px-5 py-3 font-medium">Category</th>
                <th className="text-right px-5 py-3 font-medium">Serve size</th>
                <th className="text-right px-5 py-3 font-medium">Servings / litre</th>
                <th className="text-right px-5 py-3 font-medium" style={{ color: hidden ? '#e5e7eb' : undefined }}>Cost / unit</th>
                <th className="text-right px-5 py-3 font-medium" style={{ color: hidden ? '#e5e7eb' : undefined }}>Cost / litre</th>
                <th className="text-left px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-5 py-3 text-xs text-gray-400 font-mono">
                    {product.productCode}
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-sm font-medium text-gray-900">{product.name}</p>
                    {product.servingNotes && (
                      <p className="text-xs text-gray-400">{product.servingNotes}</p>
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
                      £{((product.costToMake ?? (product as any).costPerUnit) ?? 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-right font-medium text-gray-700">
                    <span style={hidden ? { filter: 'blur(6px)', userSelect: 'none', display: 'inline-block' } : {}}>
                      {pricePerLitre(product.costToMake ?? (product as any).costPerUnit ?? 0, product.recommendedServingG)}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {product.isNonAlcoholic ? (
                      <Badge label="N/A" variant="green" />
                    ) : (
                      <Badge label="Alcoholic" variant="gray" />
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditingProduct(product)}>Edit</Button>
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