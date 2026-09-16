import { redirect } from 'next/navigation'

// Rollout lives under Objectives now. Old links — bookmarks, the Activity log's
// ?venue= links — land in the same place with the venue still selected.
export default async function RolloutRedirect({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const venue = (await searchParams).venue
  redirect(typeof venue === 'string' ? `/objectives/rollout?venue=${encodeURIComponent(venue)}` : '/objectives/rollout')
}
