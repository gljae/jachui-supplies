import { BarChart3 } from 'lucide-react'
import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import EmptyState from '../components/EmptyState'
import Skeleton from '../components/Skeleton'
import { compactWon, formatKRW, niceTicks, todayStr } from '../lib/format'
import {
  countInMonth,
  lastMonths,
  monthlySeries,
  spendByCategory,
  spendByType,
  totalInMonth,
  type MonthSpend,
} from '../lib/stats'
import { useData } from '../state/DataContext'

// CVD 분리 ΔE 32.4로 검증한 조합. 상태색(앰버·레드)과는 겹치지 않게 골랐다
const CONSUMABLE = '#4f46e5' // indigo-600
const ONE_TIME = '#ea580c' // orange-600
const AXIS_INK = '#737373'
const GRID = '#e5e5e5'

export default function Stats() {
  const { items, purchases, loading } = useData()

  const data = useMemo(() => {
    const today = new Date()
    const thisMonth = todayStr(today).slice(0, 7)
    const months = lastMonths(today, 6)

    return {
      thisMonth,
      monthTotal: totalInMonth(purchases, thisMonth),
      monthCount: countInMonth(purchases, thisMonth),
      byType: spendByType(purchases, items),
      byCategory: spendByCategory(purchases, items),
      series: monthlySeries(purchases, months),
    }
  }, [items, purchases])

  if (loading) {
    return (
      <main className="space-y-4 p-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-48 w-full" />
      </main>
    )
  }

  if (purchases.length === 0) {
    return (
      <>
        <Header />
        <main className="pt-6">
          <EmptyState
            icon={<BarChart3 size={40} strokeWidth={1.5} />}
            title="아직 집계할 지출이 없어요."
            description="물품을 등록하면 이번 달 지출부터 보여줄게요."
          />
        </main>
      </>
    )
  }

  const typeTotal = data.byType.consumable + data.byType.oneTime

  return (
    <>
      <Header />
      <main className="space-y-4 px-4 py-4">
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="text-sm text-neutral-500">
            이번 달 지출 <span className="text-neutral-400">· {data.thisMonth.replace('-', '.')}</span>
          </h2>
          {/* 큰 숫자에는 tabular-nums를 쓰지 않는다 — 자간이 헐거워 보인다 */}
          <p className="mt-1 text-3xl font-semibold">{formatKRW(data.monthTotal)}</p>
          <p className="mt-1 text-sm text-neutral-500">구매 {data.monthCount}건</p>
        </section>

        <TypeSplit consumable={data.byType.consumable} oneTime={data.byType.oneTime} total={typeTotal} />

        <CategoryChart data={data.byCategory} />

        <MonthlyChart data={data.series} />
      </main>
    </>
  )
}

function Header() {
  return (
    <header className="border-b border-neutral-200 bg-neutral-50 px-4 py-3">
      <h1 className="text-lg font-semibold">통계</h1>
    </header>
  )
}

/**
 * 일회성 vs 소모품 지출 비율.
 *
 * 조각이 둘뿐인 원그래프는 숫자 두 개를 보여주려고 각도를 읽게 만드는 형태다.
 * 가로로 나눈 막대 하나가 같은 정보를 더 정확하게 전한다 — 비율은 길이로,
 * 금액은 바로 옆 라벨로 읽는다.
 */
function TypeSplit({
  consumable,
  oneTime,
  total,
}: {
  consumable: number
  oneTime: number
  total: number
}) {
  if (total === 0) return null

  const consumablePct = Math.round((consumable / total) * 100)
  const oneTimePct = 100 - consumablePct

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">타입별 지출</h2>

      {/* 조각 사이의 2px 틈은 표면색이 만든다. 테두리를 두르지 않는다 */}
      <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full">
        {consumable > 0 && (
          <div style={{ width: `${consumablePct}%`, background: CONSUMABLE }} className="rounded-full" />
        )}
        {oneTime > 0 && (
          <div style={{ width: `${oneTimePct}%`, background: ONE_TIME }} className="rounded-full" />
        )}
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        <LegendRow color={CONSUMABLE} label="소모품" value={consumable} percent={consumablePct} />
        <LegendRow color={ONE_TIME} label="일회성" value={oneTime} percent={oneTimePct} />
      </dl>
    </section>
  )
}

function LegendRow({
  color,
  label,
  value,
  percent,
}: {
  color: string
  label: string
  value: number
  percent: number
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex items-center gap-2">
        {/* 색은 이 점이 나른다. 글자에는 데이터 색을 입히지 않는다 */}
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="text-neutral-600">{label}</span>
      </dt>
      <dd className="tabular text-neutral-800">
        {formatKRW(value)} <span className="text-neutral-400">· {percent}%</span>
      </dd>
    </div>
  )
}

/** 카테고리 이름이 길어 가로 막대가 읽기 좋다. 값은 막대 끝에 붙인다 */
function CategoryChart({ data }: { data: { category: string; total: number }[] }) {
  if (data.length === 0) return null

  const max = Math.max(...data.map((d) => d.total))
  const height = data.length * 44 + 16

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">카테고리별 지출</h2>
      <p className="mt-0.5 text-xs text-neutral-400">전체 이력 합산</p>

      <div className="mt-3" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 0 }}>
            <XAxis type="number" domain={[0, max]} hide />
            <YAxis
              type="category"
              dataKey="category"
              width={72}
              tickLine={false}
              axisLine={false}
              tick={{ fill: AXIS_INK, fontSize: 12 }}
            />
            <Bar
              dataKey="total"
              fill={CONSUMABLE}
              maxBarSize={20}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="total"
                position="right"
                offset={8}
                fill={AXIS_INK}
                fontSize={11}
                formatter={(value: unknown) => formatKRW(Number(value))}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

/** 최근 6개월 지출 추이 */
function MonthlyChart({ data }: { data: MonthSpend[] }) {
  const max = Math.max(...data.map((d) => d.total))
  const ticks = niceTicks(max)
  const shown = data.map((d) => ({ ...d, label: `${Number(d.month.slice(5, 7))}월` }))

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">월별 지출 추이</h2>
      <p className="mt-0.5 text-xs text-neutral-400">최근 6개월</p>

      <div className="mt-3 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={shown} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
            <XAxis
              dataKey="label"
              interval={0}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              tick={{ fill: AXIS_INK, fontSize: 11 }}
            />
            <YAxis
              width={40}
              tickLine={false}
              axisLine={false}
              tick={{ fill: AXIS_INK, fontSize: 11 }}
              ticks={ticks}
              domain={[0, ticks[ticks.length - 1]]}
              tickFormatter={compactWon}
            />
            <Tooltip
              cursor={{ stroke: GRID }}
              content={<MonthTooltip />}
              wrapperStyle={{ outline: 'none' }}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke={CONSUMABLE}
              strokeWidth={2}
              dot={{ r: 4, fill: CONSUMABLE, stroke: '#fff', strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function MonthTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: MonthSpend & { label: string } }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload

  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-neutral-900">{d.month.replace('-', '.')}</p>
      <p className="tabular mt-1 text-neutral-600">{formatKRW(d.total)}</p>
    </div>
  )
}
