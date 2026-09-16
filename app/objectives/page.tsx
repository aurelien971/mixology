import { redirect } from 'next/navigation'

// Objectives folded into Onboarding: every establishment is one venue there.
export default function ObjectivesRedirect() {
  redirect('/onboarding')
}
