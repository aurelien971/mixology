interface StatCardProps {
  label: string
  value: string
  sub?: string
  highlight?: boolean
  hidden?: boolean
}

export default function StatCard({ label, value, sub, highlight, hidden }: StatCardProps) {
  return (
    <div
      className={`rounded-xl p-5 ${
        highlight
          ? 'bg-red-50 border border-red-100'
          : 'bg-gray-50 border border-gray-100'
      }`}
    >
      <p className={`text-xs font-medium uppercase tracking-wide mb-2 ${highlight ? 'text-red-500' : 'text-gray-400'}`}>
        {label}
      </p>
      <p
        className={`text-2xl font-semibold transition-all duration-200 ${highlight ? 'text-red-700' : 'text-gray-900'}`}
        style={hidden ? { filter: 'blur(8px)', userSelect: 'none', pointerEvents: 'none' } : {}}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-xs text-gray-400">{sub}</p>
      )}
    </div>
  )
}