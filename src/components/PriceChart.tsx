import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { unitPrice } from '../lib/calc'
import { compactWon, formatKRW, formatShortDate, formatUnitValue, niceTicks } from '../lib/format'
import type { Purchase } from '../types'

const BAR_COLOR = '#4f46e5' // indigo-600 — 단일 계열이므로 한 가지 색만 쓴다
const AXIS_INK = '#737373' // neutral-500 — 텍스트는 데이터 색을 입지 않는다
const GRID = '#e5e5e5' // neutral-200

interface Datum {
  id: string
  date: string
  brand: string
  price: number
  unitLabel: string
  volumeLabel: string
}

function build(purchases: Purchase[]): Datum[] {
  return [...purchases]
    .sort((a, b) =>
      a.purchaseDate === b.purchaseDate ? 0 : a.purchaseDate < b.purchaseDate ? 1 : -1,
    )
    .slice(0, 3)
    .reverse() // x축은 오래된 → 최신 (A17)
    .map((p) => {
      const unit = unitPrice(p)
      return {
        id: p.id,
        date: formatShortDate(p.purchaseDate),
        brand: p.brand ?? '',
        price: p.price,
        unitLabel: unit ? `${formatKRW(unit.value)}/${unit.unit}` : '',
        volumeLabel:
          p.volume != null && p.unit ? `${formatUnitValue(p.volume, p.unit)} × ${p.quantity}` : '',
      }
    })
}

export default function PriceChart({ purchases }: { purchases: Purchase[] }) {
  const data = build(purchases)

  // SPEC 3-3 — 0건이면 영역 자체를 숨긴다
  if (data.length === 0) return null

  // 막대 하나짜리 막대그래프는 비교할 대상이 없어 형태가 잘못된 것이다.
  // 값은 그대로 보여주되 스탯 타일로 낸다.
  if (data.length === 1) {
    const only = data[0]
    return (
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-900">가격</h2>
        <p className="mt-2 text-2xl font-semibold">{formatKRW(only.price)}</p>
        <p className="mt-1 text-sm text-neutral-500">
          {only.date}
          {only.brand && ` · ${only.brand}`}
          {only.unitLabel && ` · ${only.unitLabel}`}
        </p>
        <p className="mt-2 text-xs text-neutral-400">이력이 2건 이상 쌓이면 추이를 보여줘요.</p>
      </section>
    )
  }

  const ticks = niceTicks(Math.max(...data.map((d) => d.price)))

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">
        가격 추이 <span className="font-normal text-neutral-400">· 최근 {data.length}건</span>
      </h2>

      {/* 컨테이너 높이는 x축 라벨 두 줄까지 포함한다 */}
      <div className="mt-3 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 4, bottom: 0, left: 0 }}>
            {/* 그리드와 축은 한 톤 낮은 실선 하이라인. 점선은 쓰지 않는다 */}
            <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
            <XAxis
              dataKey="date"
              interval={0}
              height={38}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              tick={<DateBrandTick data={data} />}
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
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
              content={<PriceTooltip />}
              wrapperStyle={{ outline: 'none' }}
            />
            <Bar
              dataKey="price"
              fill={BAR_COLOR}
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            >
              {/* SPEC — 막대 위 라벨은 단위당 단가 */}
              <LabelList
                dataKey="unitLabel"
                position="top"
                offset={8}
                fill={AXIS_INK}
                fontSize={11}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-1 text-xs text-neutral-400">
        막대는 총액, 막대 위 숫자는 단위당 단가예요. 정확한 값은 아래 이력에 있어요.
      </p>
    </section>
  )
}

/** MM/DD와 브랜드명을 두 줄로 나눈다. 375px에서 한 줄이면 서로 겹친다 */
function DateBrandTick(props: {
  x?: number
  y?: number
  index?: number
  payload?: { value: string }
  data?: Datum[]
}) {
  const { x = 0, y = 0, index = 0, payload, data = [] } = props
  const brand = data[index]?.brand ?? ''
  const short = brand.length > 6 ? `${brand.slice(0, 5)}…` : brand

  return (
    <g transform={`translate(${x},${y})`}>
      <text y={14} textAnchor="middle" fill={AXIS_INK} fontSize={11}>
        {payload?.value}
      </text>
      {short && (
        <text y={28} textAnchor="middle" fill={AXIS_INK} fontSize={11}>
          {short}
        </text>
      )}
    </g>
  )
}

function PriceTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: Datum }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload

  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-neutral-900">
        {d.date}
        {d.brand && ` · ${d.brand}`}
      </p>
      <p className="tabular mt-1 text-neutral-600">총액 {formatKRW(d.price)}</p>
      {d.volumeLabel && <p className="tabular text-neutral-600">{d.volumeLabel}</p>}
      {d.unitLabel && <p className="tabular text-neutral-600">단위당 {d.unitLabel}</p>}
    </div>
  )
}
