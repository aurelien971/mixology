import { redirect } from 'next/navigation'

// Rollout is Onboarding now. Old links keep landing on the right venue.
export default async function RolloutRedirect({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const venue = (await searchParams).venue
  redirect(typeof venue === 'string' ? `/onboarding/${encodeURIComponent(venue)}` : '/onboarding')
}
