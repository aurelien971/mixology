import { redirect } from 'next/navigation'

// The old core classics page is retired: its "Clear selection" cleared the flag
// on the whole range at once, and its eleven-drink setup would drop nine of the
// twenty. The range is set up and tracked on Product development.
export default function RangeRedirect() {
  redirect('/development')
}
