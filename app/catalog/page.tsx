'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/layout/Header'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { getProducts } from '@/lib/firestore/catalog'
import { Product } from '@/types'

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    getProducts()
      .then(setProducts)
      .finally(() => setLoading(false))
  }, [])

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.category ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <Header
        title="Catalog"
        subtitle="All cocktails, pricing and GP"
        action={<Button size="sm">+ Add product</Button>}
      />

      <div className="mb-5">
        <input
          type="text"
          placeholder="Search cocktails..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 bg-white"
        />
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <p className="text-sm text-gray-400 mb-3">
            {search ? 'No products match your search' : 'No products yet'}
          </p>
          {!search && <Button size="sm">Add first product</Button>}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium">Cocktail</th>
                <th className="text-left px-5 py-3 font-medium">Category</th>
                <th className="text-right px-5 py-3 font-medium">Serve size</th>
                <th className="text-right px-5 py-3 font-medium">Cost / unit</th>
                <th className="text-right px-5 py-3 font-medium">Cost / kg</th>
                <th className="text-left px-5 py-3 font-medium">Type</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const costPerKg =
                  product.recommendedServingG > 0
                    ? (product.costPerUnit / product.recommendedServingG) * 1000
                    : 0
                return (
                  <tr
                    key={product.id}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-medium text-gray-900">{product.name}</p>
                      {product.servingNotes && (
                        <p className="text-xs text-gray-400">{product.servingNotes}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">
                      {product.category ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-right text-gray-600">
                      {product.recommendedServingG}g
                    </td>
                    <td className="px-5 py-3.5 text-sm text-right font-medium text-gray-900">
                      £{product.costPerUnit.toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-right text-gray-500">
                      £{costPerKg.toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5">
                      {product.isNonAlcoholic ? (
                        <Badge label="N/A" variant="green" />
                      ) : (
                        <Badge label="Alcoholic" variant="gray" />
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge
                        label={product.isActive ? 'Active' : 'Inactive'}
                        variant={product.isActive ? 'green' : 'gray'}
                      />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Button variant="ghost" size="sm">Edit</Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}