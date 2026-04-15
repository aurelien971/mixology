import { NextResponse } from 'next/server'
import { collection, addDoc, getDocs, Timestamp, writeBatch, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ─────────────────────────────────────────────────────────────────────────────
// GROUPS
// ─────────────────────────────────────────────────────────────────────────────
const groups = [
  {
    name: 'Culinary Collective',
    type: 'managed',
    contactEmail: 'orders@culinarycollective.com',
    notes: 'Managed group — shared shareholders with Foodlab. Manages: Pyro, Heard Soho, Heard Borough, Spring Street Pizza, Flat Iron, Oudh 1722.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTS
// group: null → standalone (no groupId stored)
// ─────────────────────────────────────────────────────────────────────────────
const accountDefs = [
  {
    legalName: 'Pyro Restaurant Group Ltd', tradingName: 'Pyro',
    group: 'Culinary Collective', email: 'ruhit@pyrolondon.co.uk', paymentTerms: 'net_30',
    address: { line1: '53b Southwark St', city: 'London', postcode: 'SE1 1RU' },
  },
  {
    legalName: 'Heard Restaurants Limited', tradingName: 'Heard Soho',
    group: 'Culinary Collective', email: 'arturo@heardburger.co.uk', paymentTerms: 'net_30',
    address: { line1: "31 Foubert's Place", city: 'London', postcode: 'W1F 7QG' },
  },
  {
    legalName: 'Island Cafe Borough Limited', tradingName: 'Heard Borough',
    group: 'Culinary Collective', email: 'attila@heardburger.co.uk', paymentTerms: 'net_30',
    address: { line1: '1 Flat Iron Square', city: 'London', postcode: 'SE1 0AB' },
  },
  {
    legalName: 'Spring Street Pizza Limited', tradingName: 'Spring Street Pizza',
    group: 'Culinary Collective', email: 'alessia@springstpizza.com', paymentTerms: 'net_30',
    address: { line1: 'Arch 32, Southwark Quarter, Southwark St', city: 'London', postcode: 'SE1 1TE' },
  },
  {
    legalName: 'Flat Iron Borough Limited', tradingName: 'Flat Iron',
    group: 'Culinary Collective', email: 'orders@flatironburger.com', paymentTerms: 'net_30',
    address: { line1: '', city: 'London', postcode: '' },
  },
  {
    legalName: 'Lucknow Borough Limited', tradingName: 'Oudh 1722',
    group: 'Culinary Collective', email: 'ben.kussan@oudh1722.com', paymentTerms: 'net_30',
    address: { line1: '66 Union St', city: 'London', postcode: 'SE1 1TD' },
  },
  {
    legalName: 'Sino (Culinary Collective)', tradingName: 'Sino',
    group: null, email: 'orders@sino.com', paymentTerms: 'net_30',
    address: { line1: '', city: 'London', postcode: '' },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTS
//
// costToMake: calculated from PDF 3 as grossCostPerKg × (servingG / 1000)
// costMissing: true for core range products where we have no production cost yet
// isCoreRange: true if available to any external client (bespoke catalog PDF 1)
// defaultPricePerLitre: standard sell price/L for core range — from PDF 1
//
// Overlapping products (appear in both venue pricing AND core range):
//   FL-100032 Mezcal Negroni        — Spring Street at 110ml + core range at £25.40/L
//   FL-100033 Mezcal Spicy Margarita — Spring Street at 110ml + core range at £24.00/L
//   FL-100034 Espresso Martini      — Spring Street at 60ml  + core range at £24.00/L
//   FL-100035 Spicy Margarita       — Heard at 100ml        + core range at £23.20/L
// ─────────────────────────────────────────────────────────────────────────────
const products = [
  // ── Sino ──────────────────────────────────────────────────────────────────
  { productCode:'FL-100001', name:'Apple Bun',                       costToMake:0.86, costMissing:false, recommendedServingG:130, isNonAlcoholic:false, isCoreRange:false, category:'Sour' },
  { productCode:'FL-100002', name:'Hay',                              costToMake:1.67, costMissing:false, recommendedServingG:80,  isNonAlcoholic:false, isCoreRange:false, category:'Highball' },
  { productCode:'FL-100003', name:'Pear Garden',                      costToMake:2.05, costMissing:false, recommendedServingG:110, isNonAlcoholic:false, isCoreRange:false, category:'Spritz' },
  { productCode:'FL-100004', name:'Buckwheat Milk Punch',             costToMake:1.12, costMissing:false, recommendedServingG:90,  isNonAlcoholic:false, isCoreRange:false, category:'Milk Punch' },
  { productCode:'FL-100005', name:'Barberry',                         costToMake:0.98, costMissing:false, recommendedServingG:90,  isNonAlcoholic:false, isCoreRange:false, category:'Sour' },
  { productCode:'FL-100006', name:'Plum Martini',                     costToMake:1.25, costMissing:false, recommendedServingG:85,  isNonAlcoholic:false, isCoreRange:false, category:'Martini' },
  { productCode:'FL-100007', name:'GlassHouse',                       costToMake:0.89, costMissing:false, recommendedServingG:90,  isNonAlcoholic:false, isCoreRange:false, category:'Highball' },
  { productCode:'FL-100008', name:'Courtyard',                        costToMake:0.97, costMissing:false, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:false, category:'Highball' },
  // ── Pyro ──────────────────────────────────────────────────────────────────
  { productCode:'FL-100009', name:'Aegeas G+T',                       costToMake:0.93, costMissing:false, recommendedServingG:130, isNonAlcoholic:false, isCoreRange:false, category:'G&T' },
  { productCode:'FL-100010', name:'Peach & Scotch Soda',              costToMake:1.08, costMissing:false, recommendedServingG:130, isNonAlcoholic:false, isCoreRange:false, category:'Highball' },
  { productCode:'FL-100011', name:'Pyro Aperol Spritz',               costToMake:0.90, costMissing:false, recommendedServingG:130, isNonAlcoholic:false, isCoreRange:false, category:'Spritz' },
  { productCode:'FL-100012', name:'Thyme & Pomegranate',              costToMake:0.61, costMissing:false, recommendedServingG:130, isNonAlcoholic:false, isCoreRange:false, category:'Highball' },
  { productCode:'FL-100013', name:'Melon & Lemon Verbena',            costToMake:0.82, costMissing:false, recommendedServingG:130, isNonAlcoholic:false, isCoreRange:false, category:'Highball' },
  { productCode:'FL-100014', name:'Mountain Ice Tea',                 costToMake:0.80, costMissing:false, recommendedServingG:130, isNonAlcoholic:false, isCoreRange:false, category:'Highball' },
  { productCode:'FL-100015', name:'Daphne',                           costToMake:1.57, costMissing:false, recommendedServingG:80,  isNonAlcoholic:false, isCoreRange:false, category:'Martini' },
  { productCode:'FL-100016', name:'Aegeas',                           costToMake:1.56, costMissing:false, recommendedServingG:90,  isNonAlcoholic:false, isCoreRange:false, category:'Sour' },
  { productCode:'FL-100017', name:'Tzatziki',                         costToMake:0.86, costMissing:false, recommendedServingG:90,  isNonAlcoholic:false, isCoreRange:false, category:'Savoury' },
  { productCode:'FL-100018', name:'Aegina',                           costToMake:1.47, costMissing:false, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:false, category:'Sour' },
  { productCode:'FL-100019', name:'Chloris',                          costToMake:1.03, costMissing:false, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:false, category:'Highball' },
  { productCode:'FL-100020', name:'Midas',                            costToMake:1.39, costMissing:false, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:false, category:'Old Fashioned' },
  { productCode:'FL-100021', name:'Chloris N/A',                      costToMake:0.76, costMissing:false, recommendedServingG:100, isNonAlcoholic:true,  isCoreRange:false, category:'Non-Alcoholic' },
  { productCode:'FL-100022', name:'Garden N/A',                       costToMake:0.42, costMissing:false, recommendedServingG:100, isNonAlcoholic:true,  isCoreRange:false, category:'Non-Alcoholic' },
  { productCode:'FL-100023', name:'Old Fashioned TMS',                costToMake:1.28, costMissing:false, recommendedServingG:80,  isNonAlcoholic:false, isCoreRange:false, category:'Old Fashioned' },
  { productCode:'FL-100024', name:'Negroni TMS',                      costToMake:1.24, costMissing:false, recommendedServingG:90,  isNonAlcoholic:false, isCoreRange:false, category:'Negroni' },
  { productCode:'FL-100025', name:'Smoked Artichoke Spicy Margarita', costToMake:0.73, costMissing:false, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:false, category:'Margarita' },
  { productCode:'FL-100026', name:'Lychee Martini TMS',               costToMake:1.10, costMissing:false, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:false, category:'Martini' },
  { productCode:'FL-100027', name:'Clear Bloody Mary',                costToMake:0.64, costMissing:false, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:false, category:'Savoury' },
  { productCode:'FL-100028', name:'Pina Colada TMS',                  costToMake:0.90, costMissing:false, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:false, category:'Tropical' },
  { productCode:'FL-100029', name:'Espresso Martini TMS',             costToMake:0.92, costMissing:false, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:false, category:'Martini' },
  { productCode:'FL-100030', name:'Pyro Coffee',                      costToMake:0.96, costMissing:false, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:false, category:'Coffee' },
  { productCode:'FL-100031', name:'Spicy Margarita TMS',              costToMake:0.99, costMissing:false, recommendedServingG:90,  isNonAlcoholic:false, isCoreRange:false, category:'Margarita' },
  // ── Spring Street + Core Range (overlapping) ──────────────────────────────
  { productCode:'FL-100032', name:'Mezcal Negroni',         costToMake:1.12, costMissing:false, recommendedServingG:110, isNonAlcoholic:false, isCoreRange:true,  defaultPricePerLitre:25.40, category:'Negroni' },
  { productCode:'FL-100033', name:'Mezcal Spicy Margarita', costToMake:1.07, costMissing:false, recommendedServingG:110, isNonAlcoholic:false, isCoreRange:true,  defaultPricePerLitre:24.00, category:'Margarita' },
  { productCode:'FL-100034', name:'Espresso Martini',       costToMake:0.51, costMissing:false, recommendedServingG:60,  isNonAlcoholic:false, isCoreRange:true,  defaultPricePerLitre:24.00, category:'Martini' },
  // ── Heard + Core Range (overlapping) ──────────────────────────────────────
  { productCode:'FL-100035', name:'Spicy Margarita',        costToMake:1.36, costMissing:false, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:true,  defaultPricePerLitre:23.20, category:'Margarita' },
  // ── Heard only ────────────────────────────────────────────────────────────
  { productCode:'FL-100036', name:'Olive Oil Negroni',               costToMake:1.38, costMissing:false, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:false, category:'Negroni' },
  { productCode:'FL-100037', name:'Peach Ice Tea',                   costToMake:0.77, costMissing:false, recommendedServingG:130, isNonAlcoholic:false, isCoreRange:false, category:'Highball' },
  // ── Oudh 1722 ─────────────────────────────────────────────────────────────
  { productCode:'FL-100038', name:'Sharma Chai',                     costToMake:0.67, costMissing:false, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:false, category:'Coffee' },
  { productCode:'FL-100039', name:'Sweet Tonkri Chaat',              costToMake:0.90, costMissing:false, recommendedServingG:70,  isNonAlcoholic:false, isCoreRange:false, category:'Sour',        servingNotes:'With foam on top' },
  { productCode:'FL-100040', name:'Mango Chutney Margarita',         costToMake:0.91, costMissing:false, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:false, category:'Margarita' },
  { productCode:'FL-100041', name:'Kewra Wino',                      costToMake:1.33, costMissing:false, recommendedServingG:120, isNonAlcoholic:false, isCoreRange:false, category:'Highball' },
  { productCode:'FL-100042', name:'Itr-e-Aam',                       costToMake:1.01, costMissing:false, recommendedServingG:80,  isNonAlcoholic:false, isCoreRange:false, category:'Sour' },
  { productCode:'FL-100043', name:'Kasuri Martini',                   costToMake:0.99, costMissing:false, recommendedServingG:70,  isNonAlcoholic:false, isCoreRange:false, category:'Martini' },
  { productCode:'FL-100044', name:'Lucknow Coffee',                   costToMake:1.09, costMissing:false, recommendedServingG:140, isNonAlcoholic:false, isCoreRange:false, category:'Coffee',      servingNotes:'Saffron cream on top' },
  { productCode:'FL-100045', name:'Mehfil No. 1722',                  costToMake:1.01, costMissing:false, recommendedServingG:80,  isNonAlcoholic:false, isCoreRange:false, category:'Highball' },
  // ── Core range only (PDF 1) — no costToMake data yet ──────────────────────
  { productCode:'FL-100046', name:'Nutella Negroni',      costToMake:0, costMissing:true, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:true, defaultPricePerLitre:24.60, category:'Negroni' },
  { productCode:'FL-100047', name:'Lychee Martini',       costToMake:0, costMissing:true, recommendedServingG:110, isNonAlcoholic:false, isCoreRange:true, defaultPricePerLitre:26.50, category:'Martini' },
  { productCode:'FL-100048', name:'Pina Colada',          costToMake:0, costMissing:true, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:true, defaultPricePerLitre:26.90, category:'Tropical' },
  { productCode:'FL-100049', name:'Picante',              costToMake:0, costMissing:true, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:true, defaultPricePerLitre:27.50, category:'Margarita' },
  { productCode:'FL-100050', name:'Golden Fizz',          costToMake:0, costMissing:true, recommendedServingG:130, isNonAlcoholic:false, isCoreRange:true, defaultPricePerLitre:22.00, category:'Highball' },
  { productCode:'FL-100051', name:'Mango Iced Tea',       costToMake:0, costMissing:true, recommendedServingG:130, isNonAlcoholic:false, isCoreRange:true, defaultPricePerLitre:20.30, category:'Highball' },
  { productCode:'FL-100052', name:'Cucumber G+T',         costToMake:0, costMissing:true, recommendedServingG:130, isNonAlcoholic:false, isCoreRange:true, defaultPricePerLitre:21.00, category:'G&T' },
  { productCode:'FL-100053', name:'Melonism',             costToMake:0, costMissing:true, recommendedServingG:130, isNonAlcoholic:false, isCoreRange:true, defaultPricePerLitre:21.50, category:'Highball' },
  { productCode:'FL-100054', name:'Apricot Cream',        costToMake:0, costMissing:true, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:true, defaultPricePerLitre:26.10, category:'Other' },
  { productCode:'FL-100055', name:'Passionfruit Martini', costToMake:0, costMissing:true, recommendedServingG:120, isNonAlcoholic:false, isCoreRange:true, defaultPricePerLitre:23.80, category:'Martini' },
  { productCode:'FL-100056', name:'French 75',            costToMake:0, costMissing:true, recommendedServingG:120, isNonAlcoholic:false, isCoreRange:true, defaultPricePerLitre:24.70, category:'Spritz' },
  { productCode:'FL-100057', name:'Paloma',               costToMake:0, costMissing:true, recommendedServingG:130, isNonAlcoholic:false, isCoreRange:true, defaultPricePerLitre:22.90, category:'Other' },
  { productCode:'FL-100058', name:'Mezcal Gimlet',        costToMake:0, costMissing:true, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:true, defaultPricePerLitre:28.20, category:'Sour' },
  { productCode:'FL-100059', name:'Manhattan',            costToMake:0, costMissing:true, recommendedServingG:90,  isNonAlcoholic:false, isCoreRange:true, defaultPricePerLitre:28.90, category:'Old Fashioned' },
  { productCode:'FL-100060', name:'Cosmopolitan',         costToMake:0, costMissing:true, recommendedServingG:100, isNonAlcoholic:false, isCoreRange:true, defaultPricePerLitre:24.75, category:'Other' },
]

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT PRICING
// [productName, pricePerUnit, rrp, servingG, pricePerLitreOverride?]
// When pricePerLitreOverride is provided, it takes precedence over the
// calculated value. Use source PDF values to avoid rounding mismatches.
// Heard pricing applies to BOTH Heard Soho and Heard Borough
// ─────────────────────────────────────────────────────────────────────────────
const pricingDefs: Record<string, [string, number, number, number, number?][]> = {
  'Sino': [
    ['Apple Bun',            4.00, 15.00, 130, 30.77],
    ['Hay',                  4.00, 16.00, 80,  50.00],
    ['Pear Garden',          4.00, 15.00, 110, 36.36],
    ['Buckwheat Milk Punch', 4.00, 15.00, 90,  44.44],
    ['Barberry',             4.00, 15.00, 90,  44.44],
    ['Plum Martini',         4.00, 16.00, 85,  47.06],
    ['GlassHouse',           2.67, 15.00, 90,  29.64],
    ['Courtyard',            2.47, 15.00, 100, 24.74],
  ],
  'Pyro': [
    ['Aegeas G+T',                       2.75, 12.00, 130, 21.12],
    ['Peach & Scotch Soda',              3.00, 12.00, 130, 23.08],
    ['Pyro Aperol Spritz',               3.00, 12.00, 130, 23.08],
    ['Thyme & Pomegranate',              2.87, 12.00, 130, 22.04],
    ['Melon & Lemon Verbena',            2.75, 12.00, 130, 21.18],
    ['Mountain Ice Tea',                 2.81, 12.00, 130, 21.58],
    ['Daphne',                           3.48, 12.00, 80,  43.56],
    ['Aegeas',                           3.18, 12.00, 90,  35.30],
    ['Tzatziki',                         2.70, 14.00, 90,  30.00],
    ['Aegina',                           3.00, 14.00, 100, 30.00],
    ['Chloris',                          2.59, 14.00, 100, 25.88],
    ['Midas',                            3.00, 14.00, 100, 30.00],
    ['Chloris N/A',                      2.16,  8.00, 100, 21.60],
    ['Garden N/A',                       1.66,  8.00, 100, 16.60],
    ['Old Fashioned TMS',                3.00, 12.00, 80,  37.50],
    ['Negroni TMS',                      3.00, 12.00, 90,  33.30],
    ['Smoked Artichoke Spicy Margarita', 2.66, 14.00, 100, 26.62],
    ['Lychee Martini TMS',               3.00, 12.00, 100, 30.00],
    ['Clear Bloody Mary',                2.60, 14.00, 100, 26.00],
    ['Pina Colada TMS',                  3.00, 12.00, 100, 30.00],
    ['Espresso Martini TMS',             2.05, 12.00, 100, 20.50],
    ['Pyro Coffee',                      3.00, 12.00, 100, 30.00],
    ['Spicy Margarita TMS',              2.03, 12.00, 90,  22.50],
  ],
  'Spring Street Pizza': [
    ['Mezcal Negroni',         2.26, 11.00, 110, 20.50],
    ['Mezcal Spicy Margarita', 2.26, 11.00, 110, 20.50],
    ['Espresso Martini',       1.24,  6.00, 60,  20.67],
  ],
  'Heard Soho': [
    ['Spicy Margarita',  3.00, 12.00, 100, 30.00],
    ['Olive Oil Negroni',3.00, 12.00, 100, 30.00],
    ['Peach Ice Tea',    2.40, 12.00, 130, 18.46],
  ],
  'Heard Borough': [
    ['Spicy Margarita',  3.00, 12.00, 100, 30.00],
    ['Olive Oil Negroni',3.00, 12.00, 100, 30.00],
    ['Peach Ice Tea',    2.40, 12.00, 130, 18.46],
  ],
  'Oudh 1722': [
    ['Sharma Chai',            2.69, 14.00, 100, 26.90],
    ['Sweet Tonkri Chaat',     2.24, 14.00, 70,  32.00],
    ['Mango Chutney Margarita',2.98, 14.00, 100, 29.80],
    ['Kewra Wino',             3.33, 14.00, 120, 27.75],
    ['Itr-e-Aam',              2.52, 14.00, 80,  31.50],
    ['Kasuri Martini',         2.52, 14.00, 70,  36.00],
    ['Lucknow Coffee',         3.11, 14.00, 140, 22.21],
    ['Mehfil No. 1722',        2.64, 14.00, 80,  33.00],
  ],
  // Flat Iron: no pricing yet
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function r2(n: number) { return Math.round(n * 100) / 100 }

// GP uses ex-VAT RRP — venue's real margin after handing over 20% VAT to HMRC
function venueGp(rrp: number, sell: number) {
  if (!rrp) return 0
  const rrpExVat = rrp / 1.2
  return r2(((rrpExVat - sell) / rrpExVat) * 100)
}

function foodlabGp(sell: number, cost: number) {
  if (!sell || cost === 0) return 0
  return r2(((sell - cost) / sell) * 100)
}

function pricePerLitre(pricePerUnit: number, servingG: number) {
  if (!servingG) return 0
  return r2((pricePerUnit / servingG) * 1000)
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED ROUTE
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const existingAccounts = await getDocs(collection(db, 'accounts'))
    if (!existingAccounts.empty) {
      return NextResponse.json({
        success: false,
        message: `Already seeded — ${existingAccounts.size} accounts exist. Delete accounts, products, accountPricing, and groups collections in Firebase console first.`,
      })
    }

    // 1. Groups
    const groupIdMap: Record<string, string> = {}
    for (const g of groups) {
      const ref = await addDoc(collection(db, 'groups'), {
        ...g,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      })
      groupIdMap[g.name] = ref.id
    }

    // 2. Accounts
    const accountMap: Record<string, { id: string; groupId?: string; groupName?: string }> = {}
    for (const a of accountDefs) {
      const groupId   = a.group ? groupIdMap[a.group] : undefined
      const groupName = a.group ?? undefined
      const data: Record<string, any> = {
        legalName:    a.legalName,
        tradingName:  a.tradingName,
        type:         'internal',
        email:        a.email,
        paymentTerms: a.paymentTerms,
        address: a.address ?? { line1: '', city: 'London', postcode: '' },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }
      if (groupId)   data.groupId   = groupId
      if (groupName) data.groupName = groupName
      const ref = await addDoc(collection(db, 'accounts'), data)
      accountMap[a.tradingName] = { id: ref.id, groupId, groupName }
    }

    // 3. Products
    const productMap: Record<string, {
      id: string; code: string; costToMake: number; servingG: number
    }> = {}
    for (const p of products) {
      const data: Record<string, any> = {
        productCode:          p.productCode,
        name:                 p.name,
        category:             p.category ?? null,
        costToMake:           p.costToMake,
        costMissing:          p.costMissing,
        recommendedServingG:  p.recommendedServingG,
        isNonAlcoholic:       p.isNonAlcoholic,
        isCoreRange:          p.isCoreRange,
        isActive:             true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }
      if ((p as any).servingNotes)        data.servingNotes        = (p as any).servingNotes
      if ((p as any).defaultPricePerLitre !== undefined)
        data.defaultPricePerLitre = (p as any).defaultPricePerLitre

      const ref = await addDoc(collection(db, 'products'), data)
      productMap[p.name] = {
        id:          ref.id,
        code:        p.productCode,
        costToMake:  p.costToMake,
        servingG:    p.recommendedServingG,
      }
    }

    // 4. Account pricing
    const batch = writeBatch(db)
    let pricingCount = 0

    for (const [accountName, lines] of Object.entries(pricingDefs)) {
      const account = accountMap[accountName]
      if (!account) continue

      for (const [productName, priceUnit, rrp, servingG, explicitPpl] of lines) {
        const product = productMap[productName]
        if (!product) {
          console.warn(`Product not found in seed: "${productName}"`)
          continue
        }

        const ppl = explicitPpl !== undefined ? explicitPpl : pricePerLitre(priceUnit, servingG)
        const row: Record<string, any> = {
          accountId:          account.id,
          accountName,
          productId:          product.id,
          productCode:        product.code,
          productName,
          recommendedServingG: servingG,
          pricePerUnit:       priceUnit,
          pricePerLitre:      ppl,
          rrp,
          venueGpPercent:     venueGp(rrp, priceUnit),
          foodlabGpPercent:   foodlabGp(priceUnit, product.costToMake),
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        }
        if (account.groupId)   row.groupId   = account.groupId
        if (account.groupName) row.groupName = account.groupName

        batch.set(doc(collection(db, 'accountPricing')), row)
        pricingCount++
      }
    }
    await batch.commit()

    return NextResponse.json({
      success: true,
      counts: {
        groups:       Object.keys(groupIdMap).length,
        accounts:     Object.keys(accountMap).length,
        products:     Object.keys(productMap).length,
        pricingLines: pricingCount,
      },
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}