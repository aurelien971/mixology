'use client'

import Link from 'next/link'
import Button from '@/components/ui/Button'
import { RECIPE_NEED, RecipeNeed, OVERLAP_LABEL } from '@/lib/onboarding'
import { MenuDrink } from '@/types'
import { VenueCtx, INK, SECONDARY, MUTED, card, Pill, money } from './shared'

const GROUPS: { need: RecipeNeed; title: string; hint: string; action: string }[] = [
  { need: 'write', title: 'New cocktails — write from their spec', hint: 'Opens the recipe already filled from their spec, converted from per serve to per litre.', action: 'Write' },
  { need: 'adapt', title: 'Twists — adapt our recipe', hint: 'Opens with our classic recipe to change, or their spec if they sent one.', action: 'Adapt' },
  { need: 'classic_missing', title: 'Ours — our own recipe is missing', hint: 'One of our classics with no recipe yet. Written once, it serves every venue.', action: 'Write ours' },
]

export default function RecipesSection({ ctx }: { ctx: VenueCtx }) {
  const active = ctx.drinks.filter((d) => d.stage !== 'dropped')
  const needOf = (d: MenuDrink) => ctx.states.get(d.id)?.recipeNeed ?? 'write'
  const missing = active.filter((d) => needOf(d) !== 'ready')
  const ready = active.filter((d) => needOf(d) === 'ready')

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
        border: `1.5px solid ${missing.length ? '#fecaca' : '#bbf7d0'}`, background: missing.length ? '#fef2f2' : '#f0fdf4' }}>
        <div>
          <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: missing.length ? '#991b1b' : '#166534' }}>
            {missing.length ? `${missing.length} of ${active.length} drinks have no recipe` : `Every drink has a recipe ✓`}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: SECONDARY }}>No recipe means no cost, and no cost means no price we can stand behind.</p>
        </div>
        {missing.length > 0 && <Button onClick={() => ctx.writeRecipes(missing)}>Write them one by one →</Button>}
      </div>

      {GROUPS.map((g) => {
        const list = missing.filter((d) => needOf(d) === g.need)
        if (!list.length) return null
        return (
          <div key={g.need} style={card}>
            <p style={{ margin: '0 0 2px', fontSize: '15px', fontWeight: 700, color: INK }}>
              {g.title} <Pill bg={RECIPE_NEED[g.need].bg} fg={RECIPE_NEED[g.need].fg}>{list.length}</Pill>
            </p>
            <p style={{ margin: '0 0 10px', fontSize: '12px', color: MUTED }}>{g.hint}</p>
            {list.map((d) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderTop: '1px solid #f9fafb' }}>
                <button onClick={() => ctx.openDrink(d.id)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left', flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: INK }}>{d.name}</span>
                  <span style={{ marginLeft: '8px', fontSize: '12px', color: MUTED }}>
                    {d.classicName ? `${OVERLAP_LABEL[d.overlap].short} · ${d.classicName}` : 'bespoke'}{d.spec ? ' · spec on file' : ' · no spec'}
                  </span>
                </button>
                <Button size="sm" onClick={() => ctx.writeRecipes([d])}>{g.action}</Button>
              </div>
            ))}
          </div>
        )
      })}

      {ready.length > 0 && (
        <div style={card}>
          <p style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 700, color: INK }}>Recipes done <Pill bg="#dcfce7" fg="#166534">{ready.length}</Pill></p>
          {ready.map((d) => {
            const st = ctx.states.get(d.id)!
            return (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderTop: '1px solid #f9fafb', fontSize: '13px' }}>
                <span style={{ flex: 1, fontWeight: 600, color: INK }}>{d.name}</span>
                <span style={{ color: SECONDARY }}>{st.costPerLitre !== null ? `${money(st.costPerLitre)}/L` : 'some ingredients unpriced'}</span>
                {st.recipe && <Link href={`/recipes/${st.recipe.id}`} style={{ color: '#1d4ed8', fontSize: '12.5px' }}>Open →</Link>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
