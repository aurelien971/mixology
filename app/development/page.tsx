'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getProducts } from '@/lib/firestore/catalog'
import { getRecipes } from '@/lib/firestore/recipes'
import { getIngredients } from '@/lib/firestore/ingredients'
import { getAllOrders } from '@/lib/firestore/orders'
import { getStaffUsers, StaffUser } from '@/lib/firestore/staffUsers'
import { getTastings } from '@/lib/firestore/tastings'
import {
  getDevelopment, updateDevelopmentLogged, updateDevelopment, syncDevelopmentForRange,
} from '@/lib/firestore/development'
import { computeRecipeCost } from '@/lib/costing'
import { reconcileCoreRange, applyCoreRange, strays, RangeRow } from '@/lib/coreRange'
import { splitRecipeCost } from '@/lib/pricing'
import { useTable, ColumnDef } from '@/hooks/useTable'
import {
  Product, Recipe, Ingredient, Order, DevelopmentRecord, DevStage, DevVariant,
  DEV_STAGES, DEV_VARIANTS, DEV_DONE_STAGES, CORE_RANGE,
  TastingSession, TASTING_STAGES, TASTING_VERDICTS,
} from '@/types'
import toast from 'react-hot-toast'

const td: React.CSSProperties = {
  padding: '8px 10px', fontSize: '13px', color: '#374151', verticalAlign: 'middle',
}
const field: React.CSSProperties = {
  width: '100%', padding: '5px 7px', fontSize: '12.5px', color: '#374151',
  border: '1px solid transparent', borderRadius: '6px', outline: 'none',
  background: 'transparent', boxSizing: 'border-box', fontFamily: 'inherit',
}

function money(n: number) { return '£' + n.toFixed(2) }
const stageOf = (s: DevStage) => DEV_STAGES.find((x) => x.value === s) ?? DEV_STAGES[0]

interface Row {
  record: DevelopmentRecord
  product?: Product
  recipe?: Recipe
  /** Cost per litre of the part we actually supply in this format. */
  costPerLitre: number | null
  costPerServe: number | null
  servingMl: number
  venues: string[]
  lastOrdered?: Date
}

const COLUMNS: ColumnDef<Row>[] = [
  { key: 'drink',   label: 'Drink',        width: 190, sortValue: (r) => r.record.productName },
  { key: 'variant', label: 'Version',      width: 116, sortValue: (r) => r.record.variant },
  { key: 'stage',   label: 'Stage',        width: 144, sortValue: (r) => DEV_STAGES.findIndex((s) => s.value === r.record.stage) },
  { key: 'owner',   label: 'Owner',        width: 106, sortValue: (r) => r.record.owner },
  { key: 'cogs',    label: 'Cost / L',     width: 100, align: 'right', sortValue: (r) => r.costPerLitre, descFirst: true },
  { key: 'serve',   label: 'Cost / serve', width: 108, align: 'right', sortValue: (r) => r.costPerServe, descFirst: true },
  { key: 'tasting', label: 'Next tasting', width: 128, sortValue: (r) => r.record.nextTasting },
  { key: 'next',    label: 'Next step',    width: 190, sortValue: (r) => r.record.nextStep },
  { key: 'venues',  label: 'Ordering it',  width: 190, sortValue: (r) => r.venues.length, descFirst: true },
  { key: 'notes',   label: 'Notes',        width: 190, sortValue: (r) => r.record.notes },
  { key: 'updated', label: 'Updated',      width: 110, sortValue: (r) => r.record.updatedAt, descFirst: true },
]

export default function DevelopmentPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [records, setRecords] = useState<DevelopmentRecord[]>([])
  const [staff, setStaff] = useState<StaffUser[]>([])
  const [tastings, setTastings] = useState<TastingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [variant, setVariant] = useState<DevVariant | 'all'>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [showSetup, setShowSetup] = useState(false)

  const cols = useTable<Row>('development', COLUMNS)

  function load() {
    Promise.all([
      getProducts(), getRecipes(), getIngredients(), getAllOrders(),
      getDevelopment(), getStaffUsers(), getTastings(),
    ])
      .then(([p, r, i, o, d, s, t]) => {
        setProducts(p); setRecipes(r); setIngredients(i); setOrders(o)
        setRecords(d); setStaff(s); setTastings(t)
      })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const classics = useMemo(
    () => products.filter((p) => p.isActive !== false && p.isClassic),
    [products]
  )

  // The twenty against the catalog: what is already in, what needs the flag,
  // what does not exist yet, and which of them have no recipe to cost.
  const range = useMemo<RangeRow[]>(() => reconcileCoreRange(products, recipes), [products, recipes])
  const todo = range.filter((r) => r.state !== 'linked').length
  const noRecipe = range.filter((r) => !r.hasRecipe).length
  const offList = useMemo(() => strays(products), [products])

  async function setUpRange() {
    setBusy(true)
    try {
      const res = await applyCoreRange(range, products)
      const [fresh, freshRecipes] = await Promise.all([getProducts(), getRecipes()])
      setProducts(fresh); setRecipes(freshRecipes)
      const classicsNow = fresh.filter((p) => p.isActive !== false && p.isClassic)
      const added = await syncDevelopmentForRange(classicsNow, records)
      toast.success(
        `${res.flagged} flagged, ${res.created} created, ${added} version${added === 1 ? '' : 's'} tracked`
      )
      load()
    } catch {
      toast.error('Could not set the range up')
    } finally { setBusy(false) }
  }

  async function sync() {
    setBusy(true)
    try {
      const n = await syncDevelopmentForRange(classics, records)
      toast.success(n ? `${n} version${n === 1 ? '' : 's'} added to the rollout` : 'Already up to date')
      load()
    } finally { setBusy(false) }
  }

  const rows = useMemo<Row[]>(() => {
    return records
      .filter((r) => variant === 'all' || r.variant === variant)
      .map((r) => {
        const product = products.find((p) => p.id === r.productId)
        const recipe = r.recipeId
          ? recipes.find((x) => x.id === r.recipeId)
          : recipes.find((x) => x.productId === r.productId)
        const servingMl = product?.recommendedServingG || 100

        // The syrup version only costs us the part without the spirit.
        let costPerLitre: number | null = null
        if (recipe) {
          if (r.variant === 'syrup') {
            const split = splitRecipeCost(recipe, ingredients)
            costPerLitre = split.mixerPerLitre || null
          } else {
            const c = computeRecipeCost(recipe, ingredients)
            costPerLitre = c.complete ? c.costPerLitre : null
          }
        }

        const lines = orders
          .filter((o) => o.status !== 'cancelled' && o.type !== 'rd')
          .filter((o) => o.lineItems.some((li) => li.productId === r.productId))
        const venues = [...new Set(lines.map((o) => o.accountName))]
        const lastOrdered = lines.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.createdAt

        return {
          record: r, product, recipe, costPerLitre,
          costPerServe: costPerLitre === null ? null : (costPerLitre * servingMl) / 1000,
          servingMl, venues, lastOrdered,
        }
      })
      .sort((a, b) => a.record.productName.localeCompare(b.record.productName))
  }, [records, products, recipes, ingredients, orders, variant])

  const stats = useMemo(() => {
    const done = records.filter((r) => DEV_DONE_STAGES.includes(r.stage)).length
    return {
      drinks: new Set(records.map((r) => r.productId)).size,
      versions: records.length,
      done,
      pct: records.length ? Math.round((done / records.length) * 100) : 0,
      tasting: records.filter((r) => r.stage === 'tasting').length,
      blocked: records.filter((r) => r.blocker).length,
      upcoming: records.filter((r) => r.nextTasting && r.nextTasting >= new Date()).length,
    }
  }, [records])

  async function patch(rec: DevelopmentRecord, data: Partial<DevelopmentRecord>, logNote?: string) {
    setRecords((prev) => prev.map((r) => (r.id === rec.id ? { ...r, ...data, updatedAt: new Date() } : r)))
    const updates = await updateDevelopmentLogged(rec, data, logNote)
    setRecords((prev) => prev.map((r) => (r.id === rec.id ? { ...r, updates } : r)))
  }

  async function quiet(rec: DevelopmentRecord, data: Partial<DevelopmentRecord>) {
    setRecords((prev) => prev.map((r) => (r.id === rec.id ? { ...r, ...data, updatedAt: new Date() } : r)))
    await updateDevelopment(rec.id, data)
  }

  return (
    <div>
      <Header
        title="Product development"
        subtitle="Getting the core classics into every venue we already sell to, one version at a time."
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href="/catalog"><Button size="sm" variant="ghost">Catalog</Button></Link>
            <Button size="sm" onClick={sync} loading={busy} disabled={busy}>
              Sync with the range
            </Button>
          </div>
        }
      />

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '1px',
        background: '#e5e7eb', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px',
      }}>
        {[
          { k: 'Drinks in the range', v: String(stats.drinks) },
          { k: 'Versions tracked', v: String(stats.versions) },
          { k: 'Signed off or beyond', v: `${stats.done}/${stats.versions}` },
          { k: 'In tasting', v: String(stats.tasting) },
          { k: 'Tastings booked', v: String(stats.upcoming) },
          { k: 'Blocked', v: String(stats.blocked), warn: stats.blocked > 0 },
        ].map((s) => (
          <div key={s.k} style={{ background: '#fff', padding: '11px 13px' }}>
            <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{s.k}</p>
            <p style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: s.warn ? '#b45309' : '#111827' }}>{s.v}</p>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
          <span style={{ fontSize: '12.5px', color: '#6b7280' }}>Rollout progress</span>
          <span style={{ fontSize: '12px', color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{stats.pct}%</span>
        </div>
        <div style={{ height: '6px', background: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
          <div style={{ width: `${stats.pct}%`, height: '100%', background: stats.pct === 100 ? '#16a34a' : '#111827', transition: 'width .2s' }} />
        </div>
      </div>

      {(todo > 0 || noRecipe > 0 || showSetup) && (
        <div style={{
          border: `1px solid ${todo ? '#fde68a' : '#f3f4f6'}`, background: todo ? '#fffbeb' : '#fff',
          borderRadius: '12px', padding: '15px 17px', marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div>
              <p style={{ margin: '0 0 3px', fontSize: '13.5px', fontWeight: 700, color: '#111827' }}>
                The range is {CORE_RANGE.length - todo} of {CORE_RANGE.length} set up
              </p>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#6b7280', lineHeight: 1.5 }}>
                {todo > 0
                  ? `${range.filter((r) => r.state === 'match').length} already in the catalog need the flag, ${range.filter((r) => r.state === 'create').length} do not exist yet.`
                  : 'All twenty are in the catalog and flagged.'}
                {noRecipe > 0 && <> <strong style={{ color: '#b45309' }}>{noRecipe} have no recipe</strong>, so nothing can be costed for them yet.</>}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button size="sm" variant="ghost" onClick={() => setShowSetup((v) => !v)}>
                {showSetup ? 'Hide the list' : 'Show the list'}
              </Button>
              {todo > 0 && (
                <Button size="sm" onClick={setUpRange} loading={busy} disabled={busy}>
                  Set the range up
                </Button>
              )}
            </div>
          </div>

          {showSetup && (
            <div style={{ marginTop: '14px', border: '1px solid #f3f4f6', borderRadius: '10px', background: '#fff', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', minWidth: '620px' }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    {['Drink', 'In the catalog', 'Code', 'Recipe', ''].map((h, i) => (
                      <th key={h + i} style={{
                        padding: '8px 12px', fontSize: '10px', fontWeight: 600, color: '#9ca3af',
                        textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {range.map((r) => (
                    <tr key={r.spec.name} style={{ borderTop: '1px solid #f9fafb' }}>
                      <td style={{ padding: '7px 12px', fontWeight: 600, color: '#111827' }}>{r.spec.name}</td>
                      <td style={{ padding: '7px 12px', color: '#6b7280' }}>
                        {r.product
                          ? (r.product.name !== r.spec.name ? <>filed as <strong style={{ color: '#374151' }}>{r.product.name}</strong></> : 'yes')
                          : <span style={{ color: '#b45309' }}>will be created</span>}
                      </td>
                      <td style={{ padding: '7px 12px', color: '#9ca3af', fontFamily: 'monospace', fontSize: '11.5px' }}>
                        {r.product?.productCode ?? '—'}
                      </td>
                      <td style={{ padding: '7px 12px' }}>
                        {r.hasRecipe && r.recipe ? (
                          <Link href={`/recipes/${r.recipe.id}`} style={{ color: '#1d4ed8' }}>{r.recipe.name}</Link>
                        ) : (
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: '#fee2e2', color: '#991b1b' }}>
                            missing
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                        <span style={{
                          fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                          background: r.state === 'linked' ? '#dcfce7' : r.state === 'match' ? '#fef3c7' : '#e0f2fe',
                          color: r.state === 'linked' ? '#166534' : r.state === 'match' ? '#92400e' : '#0369a1',
                        }}>
                          {r.state === 'linked' ? 'in the range' : r.state === 'match' ? 'needs flagging' : 'new product'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {offList.length > 0 && (
                <p style={{ margin: 0, padding: '10px 12px', fontSize: '11.5px', color: '#6b7280', borderTop: '1px solid #f3f4f6' }}>
                  Also flagged as a classic but not one of the twenty: {offList.map((p) => p.name).join(', ')}. Untick
                  them from the catalog if they should not be in the rollout.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-1 mb-3 flex-wrap items-center">
        {([{ value: 'all' as const, label: 'Both versions' }, ...DEV_VARIANTS]).map((v) => (
          <button
            key={v.value}
            onClick={() => setVariant(v.value as DevVariant | 'all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              variant === v.value ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {'short' in v ? v.short : v.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto' }}><cols.ResetButton /></span>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '26px' }}>
          <p style={{ margin: '0 0 10px', fontSize: '14px', color: '#374151' }}>
            Nothing in the rollout yet. {classics.length
              ? `There are ${classics.length} drinks in the core range — sync to track both versions of each.`
              : 'Add drinks to the core range from the catalog first.'}
          </p>
          <Button size="sm" onClick={sync} loading={busy} disabled={busy || !classics.length}>Sync with the range</Button>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflowX: 'auto' }}>
          <table className="dt" style={{ minWidth: cols.minWidth }}>
            <cols.ColGroup />
            <cols.Head />
            <tbody>
              {cols.sortRows(rows).map((r) => {
                const sc = stageOf(r.record.stage)
                const isOpen = open === r.record.id
                return (
                  <React.Fragment key={r.record.id}>
                    <tr style={{ borderBottom: '1px solid #f9fafb', background: isOpen ? '#f9fafb' : undefined }}>
                      <td style={{ ...td, fontWeight: 600, color: '#111827' }}>
                        <button
                          onClick={() => setOpen(isOpen ? null : r.record.id)}
                          style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontWeight: 700, textAlign: 'left' }}
                        >
                          {r.record.productName}
                        </button>
                        {!r.recipe && (
                          <span style={{
                            marginLeft: '7px', fontSize: '10px', fontWeight: 700, padding: '1px 6px',
                            borderRadius: '20px', background: '#fee2e2', color: '#991b1b', whiteSpace: 'nowrap',
                          }}>no recipe</span>
                        )}
                      </td>
                      <td style={td}>
                        <span style={{
                          fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px',
                          background: r.record.variant === 'syrup' ? '#ccfbf1' : '#e0f2fe',
                          color: r.record.variant === 'syrup' ? '#0f766e' : '#0369a1',
                        }}>
                          {DEV_VARIANTS.find((v) => v.value === r.record.variant)?.short}
                        </span>
                      </td>
                      <td style={td}>
                        <select
                          value={r.record.stage}
                          onChange={(e) => patch(r.record, { stage: e.target.value as DevStage })}
                          style={{ ...field, fontWeight: 600, cursor: 'pointer', textAlign: 'center', borderRadius: '20px', background: sc.bg, color: sc.fg }}
                        >
                          {DEV_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td style={td}>
                        <input
                          list="dev-owners"
                          value={r.record.owner ?? ''}
                          onChange={(e) => patch(r.record, { owner: e.target.value || undefined })}
                          placeholder="—"
                          style={{ ...field, color: r.record.owner ? '#374151' : '#fca5a5' }}
                        />
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {r.costPerLitre === null ? <span style={{ color: '#d1d5db' }}>—</span> : money(r.costPerLitre)}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {r.costPerServe === null ? <span style={{ color: '#d1d5db' }}>—</span> : money(r.costPerServe)}
                      </td>
                      <td style={td}>
                        <input
                          type="date"
                          value={r.record.nextTasting ? format(r.record.nextTasting, 'yyyy-MM-dd') : ''}
                          onChange={(e) => patch(r.record, { nextTasting: e.target.value ? new Date(e.target.value + 'T12:00:00') : undefined })}
                          style={{ ...field, fontFamily: 'monospace', fontSize: '11.5px' }}
                        />
                      </td>
                      <td style={td}>
                        <input
                          defaultValue={r.record.nextStep ?? ''}
                          onBlur={(e) => e.target.value !== (r.record.nextStep ?? '') && patch(r.record, { nextStep: e.target.value || undefined })}
                          placeholder="—"
                          style={field}
                        />
                      </td>
                      <td style={td}>
                        {r.venues.length === 0 ? (
                          <span style={{ fontSize: '11.5px', color: '#d1d5db' }}>nobody yet</span>
                        ) : (
                          <span style={{ fontSize: '11.5px', color: '#374151' }} title={r.venues.join(', ')}>
                            <strong>{r.venues.length}</strong> · {r.venues.join(', ')}
                          </span>
                        )}
                      </td>
                      <td style={td}>
                        <input
                          defaultValue={r.record.notes ?? ''}
                          onBlur={(e) => e.target.value !== (r.record.notes ?? '') && quiet(r.record, { notes: e.target.value || undefined })}
                          placeholder="—"
                          style={field}
                        />
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <input
                          type="date"
                          value={format(r.record.updatedAt, 'yyyy-MM-dd')}
                          onChange={(e) => e.target.value && quiet(r.record, { updatedAt: new Date(e.target.value + 'T12:00:00') })}
                          style={{ ...field, fontFamily: 'monospace', fontSize: '11px', color: '#9ca3af', textAlign: 'right' }}
                        />
                      </td>
                    </tr>

                    {isOpen && (
                      <tr>
                        <td colSpan={COLUMNS.length} style={{ padding: 0, background: '#fbfbfc', borderBottom: '1px solid #f3f4f6' }}>
                          <div style={{ padding: '16px 20px 20px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '16px' }}>
                            <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '10px', padding: '14px 16px' }}>
                              <p style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
                                The spec
                              </p>
                              {r.recipe ? (
                                <>
                                  <p style={{ margin: '0 0 8px', fontSize: '13.5px' }}>
                                    <Link href={`/recipes/${r.recipe.id}`} style={{ color: '#1d4ed8', fontWeight: 600 }}>{r.recipe.name}</Link>
                                    <span style={{ color: '#9ca3af', marginLeft: '7px' }}>{r.recipe.ingredients.length} ingredients</span>
                                  </p>
                                  {r.record.variant === 'syrup' && (
                                    <p style={{ margin: '0 0 8px', fontSize: '12.5px', color: '#6b7280', lineHeight: 1.5 }}>
                                      Costed without the spirit — the venue pours its own, so only what we supply counts.
                                    </p>
                                  )}
                                  <select
                                    value={r.record.recipeId ?? ''}
                                    onChange={(e) => patch(r.record, { recipeId: e.target.value || undefined })}
                                    style={{ ...field, border: '1px solid #e5e7eb', fontSize: '12.5px', cursor: 'pointer' }}
                                  >
                                    <option value="">Use the drink&apos;s default recipe</option>
                                    {recipes.filter((x) => x.productId === r.record.productId).map((x) => (
                                      <option key={x.id} value={x.id}>{x.name}{x.variation ? ` · ${x.variation}` : ''}</option>
                                    ))}
                                  </select>
                                </>
                              ) : (
                                <p style={{ margin: 0, fontSize: '13px', color: '#b45309' }}>
                                  No recipe on this drink yet — add one from the catalog and it will cost itself.
                                </p>
                              )}

                              <div style={{ marginTop: '14px' }}>
                                <p style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>
                                  Blocker
                                </p>
                                <input
                                  defaultValue={r.record.blocker ?? ''}
                                  onBlur={(e) => e.target.value !== (r.record.blocker ?? '') && patch(r.record, { blocker: e.target.value || undefined })}
                                  placeholder="Nothing"
                                  style={{ ...field, border: '1px solid #e5e7eb', color: r.record.blocker ? '#b91c1c' : undefined }}
                                />
                              </div>

                              {(() => {
                                const poured = tastings
                                  .filter((t) => t.items.some((i) => i.productId === r.record.productId && i.variant === r.record.variant))
                                  .sort((a, b) => (b.scheduledAt?.getTime() ?? 0) - (a.scheduledAt?.getTime() ?? 0))
                                if (!poured.length) return null
                                return (
                                  <div style={{ marginTop: '14px' }}>
                                    <p style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>
                                      Poured at {poured.length} tasting{poured.length === 1 ? '' : 's'}
                                    </p>
                                    {poured.map((t) => {
                                      const item = t.items.find((i) => i.productId === r.record.productId && i.variant === r.record.variant)
                                      const vc = TASTING_VERDICTS.find((v) => v.value === item?.verdict) ?? TASTING_VERDICTS[0]
                                      const sc = TASTING_STAGES.find((x) => x.value === t.stage) ?? TASTING_STAGES[0]
                                      return (
                                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '12.5px' }}>
                                          <Link href="/tastings" style={{ color: '#111827', fontWeight: 600 }}>{t.accountName}</Link>
                                          <span style={{ color: '#9ca3af', fontSize: '11.5px' }}>
                                            {t.scheduledAt ? format(t.scheduledAt, 'd MMM yyyy') : 'no date'}
                                          </span>
                                          <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '20px', background: sc.bg, color: sc.fg }}>
                                            {sc.label}
                                          </span>
                                          {item?.verdict !== 'pending' && (
                                            <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '20px', background: vc.bg, color: vc.fg }}>
                                              {vc.label}
                                            </span>
                                          )}
                                          <span style={{ marginLeft: 'auto', color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                                            {item?.pricePerLitre ? money(item.pricePerLitre) + '/L' : ''}
                                          </span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )
                              })()}

                              {r.venues.length > 0 && (
                                <div style={{ marginTop: '14px' }}>
                                  <p style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>
                                    Already ordering this drink
                                  </p>
                                  <p style={{ margin: 0, fontSize: '12.5px', color: '#374151', lineHeight: 1.6 }}>
                                    {r.venues.join(' · ')}
                                    {r.lastOrdered && (
                                      <span style={{ color: '#9ca3af' }}> — last on {format(r.lastOrdered, 'd MMM yyyy')}</span>
                                    )}
                                  </p>
                                </div>
                              )}
                            </div>

                            <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '10px', padding: '14px 16px' }}>
                              <p style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
                                What has happened
                              </p>
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault()
                                  if (!note.trim()) return
                                  patch(r.record, {}, note)
                                  setNote('')
                                }}
                                style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}
                              >
                                <input
                                  value={note}
                                  onChange={(e) => setNote(e.target.value)}
                                  placeholder="Tasted with Mark, needs more acid…"
                                  style={{ ...field, border: '1px solid #e5e7eb' }}
                                />
                                <Button size="sm" type="submit" disabled={!note.trim()}>Log</Button>
                              </form>
                              {(r.record.updates ?? []).length === 0 ? (
                                <p style={{ margin: 0, fontSize: '12.5px', color: '#9ca3af' }}>
                                  Nothing logged yet. Moving the stage, owner, tasting date or blocker records itself here.
                                </p>
                              ) : (
                                <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                                  {(r.record.updates ?? []).map((u, i) => (
                                    <div key={u.at + i} style={{ display: 'flex', gap: '10px', padding: '7px 0', borderBottom: '1px solid #fafafa' }}>
                                      <span style={{
                                        width: '6px', height: '6px', borderRadius: '50%', marginTop: '6px', flex: 'none',
                                        background: u.kind === 'note' ? '#111827' : '#d1d5db',
                                      }} />
                                      <div>
                                        <p style={{ margin: 0, fontSize: '12.5px', color: u.kind === 'note' ? '#111827' : '#6b7280', lineHeight: 1.45 }}>{u.text}</p>
                                        <p style={{ margin: '2px 0 0', fontSize: '10.5px', color: '#c4c4c4', fontFamily: 'monospace' }}>
                                          {format(new Date(u.at), 'd MMM yyyy, HH:mm')}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <datalist id="dev-owners">
        {staff.map((u) => <option key={u.id} value={u.displayName} />)}
      </datalist>

      <p style={{ fontSize: '11.5px', color: '#9ca3af', marginTop: '14px', lineHeight: 1.6, maxWidth: '84ch' }}>
        Every drink in the core range is tracked in both formats, because they move at different speeds and get signed
        off separately. <strong style={{ color: '#6b7280' }}>Cost per litre is the part we actually supply</strong> —
        for the syrup that excludes the spirit, since the venue buys its own. Add a drink to the range from the catalog
        and it appears here on the next sync.
      </p>
    </div>
  )
}
