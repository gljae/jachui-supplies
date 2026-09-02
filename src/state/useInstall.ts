import { useEffect, useState } from 'react'

/** 크롬이 설치 가능 시점에 던지는 이벤트. 표준 타입에 아직 없다 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallState =
  /** 이미 홈 화면에서 실행 중 */
  | { status: 'installed' }
  /** 버튼 한 번으로 설치할 수 있다 (주로 안드로이드 크롬) */
  | { status: 'ready'; install: () => Promise<boolean> }
  /** 브라우저가 자동 설치를 지원하지 않아 직접 안내해야 한다 (iOS 사파리) */
  | { status: 'manual'; platform: 'ios' | 'other' }

function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS 사파리는 display-mode 대신 이 비표준 속성을 쓴다
  return (navigator as { standalone?: boolean }).standalone === true
}

function isIOS(): boolean {
  const ua = navigator.userAgent
  // 아이패드OS 13+는 데스크톱 사파리로 위장하므로 터치 지원까지 함께 본다
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/**
 * 홈 화면 추가 상태.
 *
 * G2 — 이 앱의 데이터는 브라우저 저장소에만 있다. iOS는 홈 화면에 추가하지 않은
 * 사이트를 7일 뒤 통째로 지우고, 안드로이드도 공간이 부족하면 지운다.
 * 설치는 취향 문제가 아니라 데이터를 지키는 유일한 방법이다.
 */
export function useInstall(): InstallState {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => isStandalone())

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      // 막지 않으면 브라우저가 자체 배너를 띄우고 이벤트를 흘려보낸다
      event.preventDefault()
      setPrompt(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    // 설치된 창에서 열렸는지 나중에 바뀔 수도 있어 한 번 더 본다
    const media = window.matchMedia('(display-mode: standalone)')
    const onChange = () => setInstalled(isStandalone())
    media.addEventListener('change', onChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
      media.removeEventListener('change', onChange)
    }
  }, [])

  if (installed) return { status: 'installed' }

  if (prompt) {
    return {
      status: 'ready',
      install: async () => {
        await prompt.prompt()
        const { outcome } = await prompt.userChoice
        // 한 번 쓴 프롬프트는 재사용할 수 없다
        setPrompt(null)
        return outcome === 'accepted'
      },
    }
  }

  return { status: 'manual', platform: isIOS() ? 'ios' : 'other' }
}
