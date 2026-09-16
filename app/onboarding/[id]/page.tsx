'use client'

import { use, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import RecipeEditor, { RecipeDraft } from '@/components/recipes/RecipeEditor'
import NewTastingModal from '@/components/tastings/NewTastingModal'
import OverviewSection from '@/components/onboarding/OverviewSection'
import MenuSection from '@/components/onboarding/MenuSection'
import GpSection from '@/components/onboarding/GpSection'
import RecipesSection from '@/components/onboarding/RecipesSection'
import TastingsSection from '@/components/onboarding/TastingsSection'
import OrdersSection from '@/components/onboarding/OrdersSection'
import MenuDrinkPanel from '@/components/onboarding/MenuDrinkPanel'
import AddDrinksModal from '@/components/onboarding/AddDrinksModal'
import VenueBriefModal from '@/components/onboarding/VenueBriefModal'
import { VenueCtx, VenueTab, INK, SECONDARY, MUTED } from '@/components/onboarding/shared'
import { getRollouts, updateRolloutLogged, deleteRollout } from '@/lib/firestore/rollouts'
import { getVenueMenu, updateMenuDrinkLogged } from '@/lib/firestore/menu'
import { getAccounts } from '@/lib/firestore/accounts'
import { getProducts, createProduct } from '@/lib/firestore/catalog'
import { getRecipes } from '@/lib/firestore/recipes'
import { getIngredients } from '@/lib/firestore/ingredients'
import { getAllOrders } from '@/lib/firestore/orders'
import { getTastings } from '@/lib/firestore/tastings'
import { getStaffUsers, StaffUser } from '@/lib/firestore/staffUsers'
import { venueOrders, effectiveStage, needsAttention } from '@/lib/rollout'
import { drinkState, readiness, classicProduct, specAsBriefDrink, serveOf, DrinkState } from '@/lib/onboarding'
import { toRecipeLines } from '@/lib/briefImport'
import { nextCode } from '@/lib/coreRange'
import {
  Account, Ingredient, MenuDrink, Order, Product, Recipe, RolloutVenue, TastingSession,
} from '@/types'
import toast from 'react-hot-toast'

const TABS: VenueTab[] = ['overview', 'menu', 'gp', 'recipes', 'tastings', 'orders', 'timeline']

export default function VenuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [venue, setVenue] = useState<RolloutVenue | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [drinks, setDrinks] = useState<MenuDrink[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [tastings, setTastings] = useState<TastingSession[]>([])
  const [staff, setStaff] = useState<StaffUser[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<VenueTab>('overview')
  const [openDrinkId, setOpenDrinkId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [booking, setBooking] = useState(false)
  const [editor, setEditor] = useState<{ productId: string; draft?: RecipeDraft; products: Product[] } | null>(null)
  const [recipeQueue, setRecipeQueue] = useState<MenuDrink[]>([])
  const venueRef = useRef<RolloutVenue | null>(null)
  const drinksRef = useRef<MenuDrink[]>([])
  const justSaved = useRef(false)
  const firstLoad = useRef(true)

  useEffect(() => { venueRef.current = venue }, [venue])
  useEffect(() => { drinksRef.current = drinks }, [drinks])

  async function load() {
    const [vs, a, m, p, r, i, o, t, s] = await Promise.all([
      getRollouts(), getAccounts(), getVenueMenu(id), getProducts(), getRecipes(), getIngredients(),
      getAllOrders(), getTastings(), getStaffUsers(),
    ])
    setVenue(vs.find((x) => x.id === id) ?? null)
    setAccounts(a); setDrinks(m); setProducts(p); setRecipes(r); setIngredients(i); setOrders(o); setTastings(t); setStaff(s)
    if (firstLoad.current) {
      firstLoad.current = false
      // Links in from the board and the Activity log can name a tab or a drink.
      const q = new URLSearchParams(window.location.search)
      const wantTab = q.get('tab') as VenueTab | null
      if (wantTab && TABS.includes(wantTab)) setTab(wantTab)
      const wantDrink = q.get('drink')
      if (wantDrink && m.some((d) => d.id === wantDrink)) { setTab('menu'); setOpenDrinkId(wantDrink) }
    }
    setLoading(false)
  }

  useEffect(() => {
    ;(async () => { await load() })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function patchVenue(data: Partial<RolloutVenue>, note?: string, auto?: string) {
    const cur = venueRef.current
    if (!cur) return
    const optimistic = { ...cur, ...data, updatedAt: new Date() }
    venueRef.current = optimistic
    setVenue(optimistic)
    try {
      const updates = await updateRolloutLogged(cur, data, note, auto)
      const merged = { ...(venueRef.current ?? optimistic), updates }
      venueRef.current = merged
      setVenue(merged)
    } catch (e) {
      console.error(e)
      toast.error('Did not save — try again')
      await load()
    }
  }

  async function patchDrink(d: MenuDrink, data: Partial<MenuDrink>, note?: string, auto?: string) {
    const cur = drinksRef.current.find((x) => x.id === d.id) ?? d
    const optimistic = { ...cur, ...data, updatedAt: new Date() }
    drinksRef.current = drinksRef.current.map((x) => (x.id === d.id ? optimistic : x))
    setDrinks(drinksRef.current)
    try {
      const updates = await updateMenuDrinkLogged(cur, data, note, auto)
      drinksRef.current = drinksRef.current.map((x) => (x.id === d.id ? { ...x, updates } : x))
      setDrinks(drinksRef.current)
    } catch (e) {
      console.error(e)
      toast.error('Did not save — try again')
      await load()
    }
  }

  // ── recipes: open the editor ready to write, one drink after another ─────
  async function openRecipeFor(d: MenuDrink): Promise<boolean> {
    const v = venueRef.current
    if (!v) return false
    let prods = products
    const classic = classicProduct(d.classicName, prods)
    if (d.overlap === 'same') {
      if (!classic) { toast.error(`Pick which of our classics ${d.name} is first`); return false }
      setEditor({ productId: classic.id, products: prods })
      return true
    }
    // A drink we make for them needs its own product for its recipe to hang on.
    // It stays out of the catalog until the drink is signed off.
    let productId = d.productId && d.productId !== classic?.id ? d.productId : undefined
    if (!productId) {
      prods = await getProducts()
      const code = `FL-${nextCode(prods)}`
      productId = await createProduct({
        productCode: code, baseCode: code, name: d.name,
        description: d.overlap === 'twist' ? `Twist on our ${d.classicName} for ${v.name}` : `Bespoke for ${v.name}`,
        category: 'Bespoke', recommendedServingG: serveOf(d) ?? 100, volumeLitres: 5,
        costToMake: 0, costMissing: true, isNonAlcoholic: false, isCoreRange: false, isClassic: false, isActive: false,
      })
      await patchDrink(d, { productId }, undefined, `Product ${code} made for its recipe — it goes live when the drink is signed off`)
      prods = await getProducts()
      setProducts(prods)
    }
    const bd = specAsBriefDrink(d)
    const classicRecipe = classic ? recipes.find((r) => r.productId === classic.id) : undefined
    let draft: RecipeDraft = { name: d.name, variation: v.name, productId, ingredients: [], analyticalValues: [], cookingInstructions: '' }
    if (bd) {
      const { lines, unconverted } = toRecipeLines(bd)
      draft = {
        ...draft,
        ingredients: lines,
        cookingInstructions: [
          bd.method, bd.glass && `Glass: ${bd.glass}`, bd.garnish && `Garnish: ${bd.garnish}`, bd.notes, '',
          `DRAFT — converted from ${v.name}'s spec, per serve to per litre. Dilution not included.`,
          unconverted.length ? `Check by hand: ${unconverted.join(', ')}.` : null,
        ].filter((x): x is string => typeof x === 'string').join('\n'),
      }
    } else if (d.overlap === 'twist' && classicRecipe) {
      draft = {
        ...draft,
        ingredients: classicRecipe.ingredients,
        analyticalValues: classicRecipe.analyticalValues ?? [],
        cookingInstructions: `Twist on our ${d.classicName} for ${v.name} — started from our recipe; change it.\n\n${classicRecipe.cookingInstructions ?? ''}`,
      }
    }
    setEditor({ productId, draft, products: prods })
    return true
  }

  async function writeRecipes(list: MenuDrink[]) {
    if (!list.length) return
    const [first, ...rest] = list
    setRecipeQueue(rest)
    if (!(await openRecipeFor(first))) setRecipeQueue([])
  }

  // The editor calls onSaved and then onClose; a close that follows a save is
  // the queue moving on, not the user stopping.
  async function recipeSaved() {
    justSaved.current = true
    setRecipes(await getRecipes())
    setEditor(null)
    const [nextDrink, ...rest] = recipeQueue
    if (nextDrink) {
      setRecipeQueue(rest)
      toast.success(`Saved — next: ${nextDrink.name}`)
      await openRecipeFor(drinksRef.current.find((x) => x.id === nextDrink.id) ?? nextDrink)
    } else {
      toast.success('Recipe saved')
    }
    justSaved.current = false
  }

  function recipeClosed() {
    if (justSaved.current) return
    setEditor(null)
    setRecipeQueue([])
  }

  if (loading) return <p style={{ fontSize: '13px', color: MUTED }}>Loading…</p>
  if (!venue) return (
    <div>
      <Header title="Venue not found" subtitle="It may have been removed from onboarding." />
      <Link href="/onboarding"><Button size="sm" variant="secondary">← All venues</Button></Link>
    </div>
  )

  // Derived on every render — a menu is tens of drinks, nothing worth caching.
  const states = new Map<string, DrinkState>()
  for (const d of drinks) states.set(d.id, drinkState(d, venue, products, recipes, ingredients))
  const menuProductIds = new Set<string>(products.filter((p) => p.isClassic && p.isActive !== false).map((p) => p.id))
  for (const st of states.values()) if (st.own) menuProductIds.add(st.own.id)
  const orderInfo = venueOrders(venue, orders, menuProductIds)
  const stage = effectiveStage(venue, orderInfo)
  const rd = readiness(venue, drinks, states)
  const account = accounts.find((a) => a.id === venue.accountId)
  const menuProducts = [...new Map([...states.values()].filter((s) => s.own).map((s) => [s.own!.id, s.own!])).values()]

  const ctx: VenueCtx = {
    venue, account, accounts, drinks, states, readiness: rd, stage, attention: needsAttention(venue, stage, orderInfo),
    orderInfo, menuProductIds, products, recipes, ingredients, orders, tastings, staff,
    patchVenue, patchDrink, reload: load, openDrink: setOpenDrinkId, writeRecipes, goTo: setTab,
  }

  const openDrink = drinks.find((d) => d.id === openDrinkId)
  const venueTastings = tastings.filter((t) => t.accountId === venue.accountId)

  const tabs: { key: VenueTab; label: string; badge?: string; warn?: boolean }[] = [
    { key: 'overview', label: 'Overview', badge: rd.allGood ? '✓' : undefined },
    { key: 'menu', label: 'Menu', badge: String(rd.active) },
    { key: 'gp', label: `${venue.gpTarget ?? 80}% GP`, badge: `${rd.gpPass}/${rd.active}`, warn: rd.active > 0 && rd.gpPass < rd.active },
    { key: 'recipes', label: 'Recipes', badge: rd.recipesMissing ? `${rd.recipesMissing} missing` : rd.active ? '✓' : undefined, warn: rd.recipesMissing > 0 },
    { key: 'tastings', label: 'Tastings', badge: venueTastings.length ? String(venueTastings.length) : undefined },
    { key: 'orders', label: 'Orders', badge: orderInfo.since.length ? String(orderInfo.since.length) : undefined },
    { key: 'timeline', label: 'Timeline' },
  ]

  const timeline = [
    ...(venue.updates ?? []).map((u) => ({ at: new Date(u.at), who: venue.name, text: u.text, by: u.by, note: u.kind === 'note', drinkId: undefined as string | undefined })),
    ...drinks.flatMap((d) => (d.updates ?? []).map((u) => ({ at: new Date(u.at), who: d.name, text: u.text, by: u.by, note: u.kind === 'note', drinkId: d.id as string | undefined }))),
    ...venueTastings.map((t) => ({ at: t.scheduledAt ?? t.createdAt, who: 'Tasting', text: `${t.items.length} drinks · ${t.stage}`, by: t.owner, note: false, drinkId: undefined })),
    ...orderInfo.since.map((o) => ({ at: o.createdAt, who: 'Order', text: `${o.orderNumber} · £${o.subtotal.toFixed(2)}`, by: undefined, note: false, drinkId: undefined })),
  ].filter((x) => !Number.isNaN(x.at.getTime())).sort((a, b) => b.at.getTime() - a.at.getTime())

  return (
    <div>
      {editor && (
        <RecipeEditor key={editor.productId} presetProductId={editor.productId} draft={editor.draft} products={editor.products}
          onSaved={recipeSaved} onClose={recipeClosed} />
      )}
      {adding && <AddDrinksModal ctx={ctx} onClose={() => setAdding(false)} />}
      {dropping && <VenueBriefModal ctx={ctx} onClose={() => setDropping(false)} />}
      {booking && (
        <NewTastingModal
          accounts={accounts} products={products} recipes={recipes} ingredients={ingredients} staff={staff}
          presetAccountId={venue.accountId} menuProducts={menuProducts}
          onClose={() => setBooking(false)}
          onSaved={async () => {
            if (stage === 'contact' || stage === 'not_started') await patchVenue({ stage: 'tasting_booked' }, undefined, 'Tasting booked')
            await load()
          }}
        />
      )}
      {openDrink && (
        <div onClick={() => setOpenDrinkId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 20px', overflowY: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#f9fafb', borderRadius: '14px', width: '100%', maxWidth: '1100px', padding: '22px 24px 26px' }}>
            <MenuDrinkPanel key={openDrink.id} ctx={ctx} drink={openDrink} onClose={() => setOpenDrinkId(null)} />
          </div>
        </div>
      )}

      <Header
        title={venue.name}
        subtitle={[venue.group, account?.legalName, `onboarding since ${format(venue.startedAt, 'd MMM yyyy')}`].filter(Boolean).join(' · ')}
        action={<Link href="/onboarding"><Button size="sm" variant="ghost">← All venues</Button></Link>}
      />

      <div style={{ display: 'flex', gap: '4px', background: '#f3f4f6', padding: '4px', borderRadius: '10px', width: 'fit-content', maxWidth: '100%', overflowX: 'auto', marginBottom: '16px' }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 14px', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: 'none', whiteSpace: 'nowrap',
            background: tab === t.key ? '#fff' : 'transparent', color: tab === t.key ? INK : SECONDARY,
            boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}>
            {t.label}
            {t.badge && <span style={{ marginLeft: '6px', fontSize: '11.5px', fontWeight: 700, color: t.warn ? '#b45309' : t.badge === '✓' ? '#166534' : MUTED }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewSection ctx={ctx} onDropBrief={() => setDropping(true)} onBookTasting={() => setBooking(true)}
          onRemove={async () => { await deleteRollout(venue.id); toast.success(`${venue.name} removed from onboarding`); router.push('/onboarding') }} />
      )}
      {tab === 'menu' && <MenuSection ctx={ctx} onAdd={() => setAdding(true)} onDropBrief={() => setDropping(true)} />}
      {tab === 'gp' && <GpSection ctx={ctx} />}
      {tab === 'recipes' && <RecipesSection ctx={ctx} />}
      {tab === 'tastings' && <TastingsSection ctx={ctx} onBook={() => setBooking(true)} />}
      {tab === 'orders' && <OrdersSection ctx={ctx} />}
      {tab === 'timeline' && (
        <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '14px 18px' }}>
          {timeline.length === 0 && <p style={{ margin: 0, fontSize: '13px', color: MUTED }}>Nothing yet.</p>}
          {timeline.map((u, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', padding: '8px 0', borderTop: i ? '1px solid #fafafa' : 'none' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', marginTop: '6px', flex: 'none', background: u.note ? INK : '#d1d5db' }} />
              <div>
                <p style={{ margin: 0, fontSize: '13px', color: INK }}>
                  {u.drinkId
                    ? <button onClick={() => setOpenDrinkId(u.drinkId!)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontWeight: 700, color: INK }}>{u.who}</button>
                    : <strong>{u.who}</strong>}
                  <span style={{ color: u.note ? INK : SECONDARY }}> — {u.note && <strong>Note: </strong>}{u.text}</span>
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: MUTED }}>{format(u.at, 'EEE d MMM yyyy, HH:mm')}{u.by ? ` · ${u.by}` : ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
