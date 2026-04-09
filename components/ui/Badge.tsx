type BadgeVariant =
  | 'gray'
  | 'blue'
  | 'green'
  | 'amber'
  | 'red'
  | 'purple'

const styles: Record<BadgeVariant, string> = {
  gray: 'bg-gray-100 text-gray-600',
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  purple: 'bg-purple-50 text-purple-700',
}

interface BadgeProps {
  label: string
  variant?: BadgeVariant
}

export default function Badge({ label, variant = 'gray' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[variant]}`}
    >
      {label}
    </span>
  )
}

export function orderStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    received: { label: 'Received', variant: 'blue' },
    picking: { label: 'Picking', variant: 'purple' },
    dispatched: { label: 'Dispatched', variant: 'amber' },
    delivered: { label: 'Delivered', variant: 'green' },
    cancelled: { label: 'Cancelled', variant: 'gray' },
  }
  return map[status] ?? { label: status, variant: 'gray' }
}

export function paymentStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    pending: { label: 'Pending', variant: 'amber' },
    paid: { label: 'Paid', variant: 'green' },
    overdue: { label: 'Overdue', variant: 'red' },
    disputed: { label: 'Disputed', variant: 'purple' },
  }
  return map[status] ?? { label: status, variant: 'gray' }
}