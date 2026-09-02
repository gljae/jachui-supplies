import { useEffect, useState } from 'react'

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * 날짜가 바뀔 때만 새 Date를 돌려준다.
 *
 * 화면마다 `new Date()`를 useMemo 안에서 부르면, 데이터가 바뀌지 않는 한 다시 계산되지
 * 않는다. 앱을 켜둔 채 자정을 넘기면 "약 3일 후 소진"이 계속 3일로 남고 이번 달 지출도
 * 지난달 것을 보여준다.
 *
 * 참조가 매 렌더 바뀌면 useMemo가 무의미해지므로, 같은 날이면 이전 값을 그대로 유지한다.
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date())

  useEffect(() => {
    let timer: number

    const refreshIfChanged = () => {
      setToday((prev) => (isSameDay(prev, new Date()) ? prev : new Date()))
    }

    const scheduleMidnight = () => {
      const now = new Date()
      // 자정 정각에 걸치면 경계에서 흔들릴 수 있어 몇 초 뒤로 잡는다
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5)
      timer = window.setTimeout(() => {
        refreshIfChanged()
        scheduleMidnight()
      }, nextMidnight.getTime() - now.getTime())
    }

    scheduleMidnight()

    // 탭이 백그라운드에 있으면 타이머가 밀린다. 돌아왔을 때 한 번 더 확인한다
    const onVisible = () => {
      if (!document.hidden) refreshIfChanged()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return today
}
