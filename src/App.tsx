import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import EmptyState from './components/EmptyState'
import { ToastProvider } from './components/Toast'
import Home from './pages/Home'
import ItemDetail from './pages/ItemDetail'
import Stats from './pages/Stats'
import { DataProvider } from './state/DataContext'

/** Phase 8·9에서 채운다. 탭이 눌리는 자리를 미리 잡아둔다. */
function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <main className="pt-8">
      <EmptyState title={title} description={`${phase}에서 만듭니다.`} />
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
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/item/:id" element={<ItemDetail />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/settings" element={<Placeholder title="설정" phase="Phase 9" />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          <BottomNav />
        </DataProvider>
      </ToastProvider>
    </HashRouter>
  )
}
