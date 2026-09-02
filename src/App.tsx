import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import BottomNav from './components/BottomNav'

import { ToastProvider } from './components/Toast'
import Home from './pages/Home'
import ItemDetail from './pages/ItemDetail'
import Settings from './pages/Settings'
import Stats from './pages/Stats'
import { DataProvider } from './state/DataContext'


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
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          <BottomNav />
        </DataProvider>
      </ToastProvider>
    </HashRouter>
  )
}
