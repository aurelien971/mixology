/**
 * Run once to seed Firestore with accounts and catalog data.
 * Usage: npx ts-node --project tsconfig.json scripts/seed.ts
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS or Firebase emulator.
 * Alternatively, paste the data arrays into the Firebase console.
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

initializeApp({
  credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS as string),
})

const db = getFirestore()

const accounts = [
  {
    legalName: 'Pyro Restaurant Group Ltd',
    tradingName: 'Pyro',
    type: 'internal',
    email: 'orders@pyrorestaurant.com',
    paymentTermsDays: 30,
    address: { line1: '', city: 'London', postcode: '' },
  },
  {
    legalName: 'Heard Restaurants Limited',
    tradingName: 'Heard Soho',
    type: 'internal',
    email: 'orders@heardsoho.com',
    paymentTermsDays: 30,
    address: { line1: '', city: 'London', postcode: '' },
  },
  {
    legalName: 'Island Cafe Borough Limited',
    tradingName: 'Heard Borough',
    type: 'internal',
    email: 'orders@heardborough.com',
    paymentTermsDays: 30,
    address: { line1: '', city: 'London', postcode: '' },
  },
  {
    legalName: 'Spring Street Pizza Limited',
    tradingName: 'Spring Street Pizza',
    type: 'internal',
    email: 'orders@springstreetpizza.com',
    paymentTermsDays: 30,
    address: { line1: '', city: 'London', postcode: '' },
  },
]

const products = [
  { name: 'Apple Bun', costPerUnit: 4.00, recommendedServingG: 130, isNonAlcoholic: false },
  { name: 'Hay', costPerUnit: 4.00, recommendedServingG: 80, isNonAlcoholic: false },
  { name: 'Pear Garden', costPerUnit: 4.00, recommendedServingG: 110, isNonAlcoholic: false },
  { name: 'Buckwheat Milk Punch', costPerUnit: 4.00, recommendedServingG: 90, isNonAlcoholic: false },
  { name: 'Barberry', costPerUnit: 4.00, recommendedServingG: 90, isNonAlcoholic: false },
  { name: 'Plum Martini', costPerUnit: 4.00, recommendedServingG: 85, isNonAlcoholic: false },
  { name: 'GlassHouse', costPerUnit: 2.67, recommendedServingG: 90, isNonAlcoholic: false },
  { name: 'Courtyard', costPerUnit: 2.47, recommendedServingG: 100, isNonAlcoholic: false },
  { name: 'Aegeas G+T', costPerUnit: 2.75, recommendedServingG: 130, isNonAlcoholic: false },
  { name: 'Peach & Scotch Soda', costPerUnit: 3.00, recommendedServingG: 130, isNonAlcoholic: false },
  { name: 'Pyro Aperol Spritz', costPerUnit: 3.00, recommendedServingG: 130, isNonAlcoholic: false },
  { name: 'Thyme & Pomegranate', costPerUnit: 2.87, recommendedServingG: 130, isNonAlcoholic: false },
  { name: 'Melon & Lemon Verbena', costPerUnit: 2.75, recommendedServingG: 130, isNonAlcoholic: false },
  { name: 'Mountain Ice Tea', costPerUnit: 2.81, recommendedServingG: 130, isNonAlcoholic: false },
  { name: 'Daphne', costPerUnit: 3.48, recommendedServingG: 80, isNonAlcoholic: false },
  { name: 'Aegeas', costPerUnit: 3.18, recommendedServingG: 90, isNonAlcoholic: false },
  { name: 'Tzatziki', costPerUnit: 2.70, recommendedServingG: 90, isNonAlcoholic: false },
  { name: 'Aegina', costPerUnit: 3.00, recommendedServingG: 100, isNonAlcoholic: false },
  { name: 'Chloris', costPerUnit: 2.59, recommendedServingG: 100, isNonAlcoholic: false },
  { name: 'Midas', costPerUnit: 3.00, recommendedServingG: 100, isNonAlcoholic: false },
  { name: 'Chloris N/A', costPerUnit: 2.16, recommendedServingG: 100, isNonAlcoholic: true },
  { name: 'Garden N/A', costPerUnit: 1.66, recommendedServingG: 100, isNonAlcoholic: true },
  { name: 'Old Fashioned TMS', costPerUnit: 3.00, recommendedServingG: 80, isNonAlcoholic: false },
  { name: 'Negroni TMS', costPerUnit: 3.00, recommendedServingG: 90, isNonAlcoholic: false },
  { name: 'Smoked Artichoke Spicy Margarita', costPerUnit: 2.66, recommendedServingG: 100, isNonAlcoholic: false },
  { name: 'Lychee Martini TMS', costPerUnit: 3.00, recommendedServingG: 100, isNonAlcoholic: false },
  { name: 'Clear Bloody Mary', costPerUnit: 2.60, recommendedServingG: 100, isNonAlcoholic: false },
  { name: 'Pina Colada TMS', costPerUnit: 3.00, recommendedServingG: 100, isNonAlcoholic: false },
  { name: 'Espresso Martini TMS', costPerUnit: 2.05, recommendedServingG: 100, isNonAlcoholic: false },
  { name: 'Pyro Coffee', costPerUnit: 3.00, recommendedServingG: 100, isNonAlcoholic: false },
  { name: 'Spicy Margarita TMS', costPerUnit: 2.03, recommendedServingG: 90, isNonAlcoholic: false },
  { name: 'Mezcal Negroni', costPerUnit: 2.26, recommendedServingG: 110, isNonAlcoholic: false },
  { name: 'Mezcal Spicy Margarita', costPerUnit: 2.26, recommendedServingG: 110, isNonAlcoholic: false },
  { name: 'Espresso Martini', costPerUnit: 1.24, recommendedServingG: 60, isNonAlcoholic: false },
  { name: 'Spicy Margarita', costPerUnit: 3.00, recommendedServingG: 100, isNonAlcoholic: false },
  { name: 'Olive Oil Negroni', costPerUnit: 3.00, recommendedServingG: 100, isNonAlcoholic: false },
  { name: 'Peach Ice Tea', costPerUnit: 2.40, recommendedServingG: 130, isNonAlcoholic: false },
  { name: 'Sharma Chai', costPerUnit: 2.69, recommendedServingG: 100, isNonAlcoholic: false },
  { name: 'Sweet Tonkri Chaat', costPerUnit: 2.24, recommendedServingG: 70, servingNotes: 'With foam on top', isNonAlcoholic: false },
  { name: 'Mango Chutney Margarita', costPerUnit: 2.98, recommendedServingG: 100, isNonAlcoholic: false },
  { name: 'Kewra Wino', costPerUnit: 3.33, recommendedServingG: 120, isNonAlcoholic: false },
  { name: 'Itr-e-Aam', costPerUnit: 2.52, recommendedServingG: 80, isNonAlcoholic: false },
  { name: 'Kasuri Martini', costPerUnit: 2.52, recommendedServingG: 70, isNonAlcoholic: false },
  { name: 'Lucknow Coffee', costPerUnit: 3.11, recommendedServingG: 140, servingNotes: 'Saffron cream on top', isNonAlcoholic: false },
  { name: 'Mehfil No. 1722', costPerUnit: 2.64, recommendedServingG: 80, isNonAlcoholic: false },
]

async function seed() {
  console.log('Seeding accounts...')
  for (const account of accounts) {
    await db.collection('accounts').add({
      ...account,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
    console.log(`  + ${account.legalName}`)
  }

  console.log('\nSeeding products...')
  for (const product of products) {
    await db.collection('products').add({
      ...product,
      isActive: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
    console.log(`  + ${product.name}`)
  }

  console.log('\nDone.')
}

seed().catch(console.error)