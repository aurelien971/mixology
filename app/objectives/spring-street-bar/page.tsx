import { redirect } from 'next/navigation'
import { SSB_ACCOUNT_ID } from '@/lib/ssbMenu'

// Spring Street Bar is a venue in Onboarding now; ?drink= still opens the drink.
export default async function SpringStreetBarRedirect({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const drink = (await searchParams).drink
  redirect(typeof drink === 'string'
    ? `/onboarding/${SSB_ACCOUNT_ID}?drink=${encodeURIComponent(`${SSB_ACCOUNT_ID}__${drink}`)}`
    : `/onboarding/${SSB_ACCOUNT_ID}`)
}
