import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import { CardSkeleton } from './components/Skeleton'
import { ToastProvider } from './components/Toast'
import Home from './pages/Home'
import { DataProvider } from './state/DataContext'

/**
 * recharts가 번들의 큰 몫을 차지한다. 목록만 보는 사람에게까지 들려 보낼 이유가 없다.
 * 차트가 있는 화면에 들어갈 때 받는다.
 */
const ItemDetail = lazy(() => import('./pages/ItemDetail'))
const Stats = lazy(() => import('./pages/Stats'))
const Settings = lazy(() => import('./pages/Settings'))

function RouteFallback() {
  return (
    <main className="space-y-3 p-4">
      <CardSkeleton />
      <CardSkeleton />
    </main>
  )
}

export default function App() {
  return (
    // A2 — 정적 배포와 향후 PWA에서 새로고침이 깨지지 않도록 HashRouter를 쓴다
    <HashRouter>
      <ToastProvider>
        <DataProvider>
          <div className="mx-auto max-w-md pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/item/:id" element={<ItemDetail />} />
                <Route path="/stats" element={<Stats />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </div>
          <BottomNav />
        </DataProvider>
      </ToastProvider>
    </HashRouter>
  )
}
