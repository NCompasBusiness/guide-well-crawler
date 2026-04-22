'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatDate } from '@/lib/utils'

const COLOR_MAP: Record<string, string> = {
  ACTIVE: '#16a34a',
  EXPIRED: '#ca8a04',
  TERMINATED: '#dc2626',
  NOT_FOUND: '#ea580c',
  ERROR: '#7c3aed',
  MANUAL_REQUIRED: '#9333ea',
  PENDING: '#6b7280',
}

const LABEL_MAP: Record<string, string> = {
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  TERMINATED: 'Terminated',
  NOT_FOUND: 'Not Found',
  ERROR: 'Error',
  MANUAL_REQUIRED: 'Manual',
  PENDING: 'Pending',
}

interface Props {
  data: { status: string; count: number }[]
  runDate: Date | null
}

export function RunStatusChart({ data, runDate }: Props) {
  const chartData = data.map((d) => ({
    name: LABEL_MAP[d.status] ?? d.status,
    value: d.count,
    color: COLOR_MAP[d.status] ?? '#6b7280',
  }))

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Latest Run Results</h2>
          {runDate && (
            <p className="text-xs text-gray-500">Completed {formatDate(runDate)}</p>
          )}
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-gray-400">
          No verification runs yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [value.toLocaleString(), name]}
            />
            <Legend
              formatter={(value) => <span className="text-sm text-gray-600">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
