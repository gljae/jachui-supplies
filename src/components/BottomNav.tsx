import { BarChart3, Home, Settings } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/', label: '홈', Icon: Home },
  { to: '/stats', label: '통계', Icon: BarChart3 },
  { to: '/settings', label: '설정', Icon: Settings },
]

/** A4 — SPEC에 라우트는 있으나 화면 간 이동 수단이 없어 추가했다. */
export default function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-md">
        {TABS.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${
                  isActive ? 'text-indigo-600' : 'text-neutral-500'
                }`
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
