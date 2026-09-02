# 자취 생활용품 구매 기록 앱 — 개발 사양서

> Claude Code에서 이 파일을 프로젝트 루트에 두고 `SPEC.md 읽고 Phase 1부터 순서대로 구현해줘` 라고 지시하세요.

---

## 0. 기술 스택 및 실행 환경

```
Vite + React 18 + TypeScript
Tailwind CSS (스타일)
recharts (그래프)
idb (IndexedDB 래퍼)
date-fns (날짜 계산)
lucide-react (아이콘)
```

**초기 세팅 명령**

```bash
npm create vite@latest . -- --template react-ts
npm install
npm install recharts idb date-fns lucide-react
npm install -D tailwindcss @tailwindcss/vite
npm run dev
```

**저장소는 IndexedDB를 사용한다.** localStorage는 5MB 제한이 있어 영수증 이미지를 감당하지 못한다. IndexedDB는 Blob을 그대로 저장할 수 있으므로 base64 변환 없이 저장한다.

**DB 스키마 (idb)**

```
DB명: jachui-supplies, 버전: 1
스토어:
  - items      (keyPath: 'id')  index: 'category', 'type'
  - purchases  (keyPath: 'id')  index: 'itemId', 'purchaseDate'
  - receipts   (keyPath: 'purchaseId')   // Blob 별도 보관, 상세보기 진입 시에만 lazy load
```

영수증을 별도 스토어로 분리하는 이유: 목록 조회 시 이미지 Blob을 읽지 않아 초기 로딩이 빨라진다.

---

## 1. 타입 정의

```ts
type UnitGroup = 'volume' | 'weight' | 'count';

type Unit = 'ml' | 'L' | 'g' | 'kg' | '개' | '롤' | '장' | '팩';

interface Item {
  id: string;
  name: string;              // "세탁세제"
  category: string;          // "생활용품"
  type: 'oneTime' | 'consumable';
  createdAt: string;         // ISO
}

interface Purchase {
  id: string;
  itemId: string;
  brand?: string;            // 일회성은 없음
  volume?: number;           // 1개당 용량. 일회성은 없음
  unit?: Unit;
  quantity: number;          // 구매 개수
  remaining: number;         // 남은 개수
  price: number;             // 총액
  purchaseDate: string;      // ISO (날짜만)
  depletionDates: string[];  // "1개 다 썼음" 누른 날짜들
  hasReceipt: boolean;       // 영수증 존재 여부 플래그
}

interface Receipt {
  purchaseId: string;
  blob: Blob;
  mimeType: string;
  size: number;
}
```

**단위 그룹 매핑**

```ts
const UNIT_GROUP: Record<Unit, UnitGroup> = {
  ml: 'volume', L: 'volume',
  g: 'weight', kg: 'weight',
  개: 'count', 롤: 'count', 장: 'count', 팩: 'count',
};
// 환산: 1L = 1000ml, 1kg = 1000g
// 표준 단위: volume → L, weight → kg, count → 개
```

---

## 2. 핵심 계산 로직 (`src/lib/calc.ts`)

이 파일은 **순수 함수만** 포함하고, 유닛 테스트 대상이다.

### 2-1. 1개당 실사용 일수

```
각 Purchase에 대해:
  - depletionDates가 비어있으면 → 데이터 없음
  - 첫 소진: purchaseDate ~ depletionDates[0] 간격
  - 이후: depletionDates[i-1] ~ depletionDates[i] 간격
  → 이 간격들의 배열이 해당 이력의 "1개당 실사용 일수" 표본
품목 전체의 표본을 합쳐 평균 → avgDaysPerUnit
```

### 2-2. 주기 표시 단위 변환

기준값은 항상 `avgDaysPerUnit`. 표시할 때만 환산한다.

| 모드 | 계산식 | 출력 예 |
|---|---|---|
| `perUnit` | avgDaysPerUnit | "1개당 평균 24일" |
| `perVolume` | 이력별 (실사용일수 ÷ volume) 평균 × 대표 volume | "3L당 평균 24일" |
| `perStandard` | 이력별 (실사용일수 ÷ 표준단위환산volume) 평균 | "1L당 평균 8일" |

- 용량이 다른 이력이 섞이면 반드시 이력별로 (일수 ÷ 용량)을 먼저 구한 뒤 평균 낸다. 총합끼리 나누면 왜곡된다.
- 단위 그룹이 섞인 품목은 `perVolume` / `perStandard` 모드를 비활성화하고 `perUnit`만 제공한다.

### 2-3. 단순 구매 주기

```
같은 품목의 purchaseDate들을 정렬 → 인접 간격 평균 (일)
30일 이상이면 "약 O개월"로도 병기
```

### 2-4. 예상 소진일

```
현재 개봉품 사용 시작 시점 = 마지막 depletionDate ?? 가장 최근 purchaseDate
예상 소진일 = 위 시점 + avgDaysPerUnit
남은 일수 = 예상 소진일 - 오늘
```

- `avgDaysPerUnit`이 없으면 → 상태 `'collecting'` ("데이터 수집 중")
- 남은 개수 합계가 0 → 상태 `'outOfStock'` ("재고 없음")
- 남은 일수 ≤ 7 → 상태 `'soon'` ("약 O일 후 소진 예상")
- 그 외 → 상태 `'ok'`

### 2-5. 단위당 단가

```
단가 = price ÷ (volume × quantity)
표준 단위로 환산해 표시 (예: "1L당 4,500원")
volume이 없으면(일회성) 단가 표시 생략
```

---

## 3. 화면 구성

### 3-1. 메인 (`/`)

- 상단: 검색창 + 필터 칩(타입 / 카테고리 / 소진 임박) + 정렬 드롭다운(소진임박순 / 최근구매순 / 이름순 / 누적지출순)
- 품목 카드 리스트. 카드에 표시할 것:
  - 품목명, 카테고리 뱃지
  - 남은 개수 (단위 그룹 섞이면 그룹별로 나눠 표기: "3개 / 2롤")
  - 평균 주기
  - 예상 소진일 상태 배지 — `soon`은 경고색, `outOfStock`은 강조색
  - 최근 구매가
- **영수증과 그래프는 메인에 노출하지 않는다.**
- 우하단 FAB(+) → 항목 추가 시트
- 빈 상태: "아직 기록한 물품이 없어요. + 버튼으로 첫 물품을 등록해보세요."

### 3-2. 항목 추가 / 재구매 시트

타입 선택에 따라 필드가 달라진다.

**소모품**: 품목명(자동완성) / 카테고리(자동완성) / 브랜드 / 용량+단위 / 구매개수 / 가격 / 구매일 / 영수증(선택)
**일회성**: 품목명 / 카테고리 / 가격 / 구매일 / 영수증(선택)

- 품목명 자동완성에서 기존 품목을 고르면 그 품목의 이력으로 추가된다 (브랜드·용량이 달라도 동일 품목으로 묶임)
- 유효성: 미래 날짜 차단 / 가격 음수 차단 / 수량·용량 0 이하 차단. 위반 시 해당 필드 하단에 인라인 에러 표시
- 저장 실패 시 입력값을 유지한 채 에러 표시

### 3-3. 상세보기 (`/item/:id`)

1. **헤더**: 품목명, 카테고리, 남은 개수
2. **주기 요약**: 단순 구매 주기 / 실사용 주기 + 표시 단위 토글(`개당` `3L당` `1L당`) / 예상 소진일
3. **가격 추이 그래프**: recharts BarChart, 최근 구매 **3건**
   - 막대 값 = 총액, 막대 위 라벨 = 단위당 단가
   - x축 라벨 = `MM/DD 브랜드명`
   - 3건 미만이면 있는 만큼만, 0건이면 그래프 영역 자체를 숨김
4. **구매 이력 타임라인**: 최신순
   - 각 항목: 브랜드 / 용량×구매개수 / 남은개수 / 가격 / 구매일
   - **"1개 다 썼음"** 버튼 → `remaining -= 1`, `depletionDates.push(오늘)`. remaining 0이면 버튼 비활성 + "소진 완료" 표시
   - 소진일 목록을 접기/펼치기로 표시
   - 영수증 썸네일 (있을 때만, 이 시점에 lazy load) → 탭하면 전체화면 뷰어. 없으면 "영수증 없음" 회색 텍스트
   - 이력 개별 삭제 (확인 모달 → 연결된 receipt도 함께 삭제)
5. 하단: 품목 수정 / 품목 삭제 (모든 이력·영수증 함께 삭제, 확인 모달 필수)

### 3-4. 통계 (`/stats`)

- 이번 달 총 지출 (구매일 기준)
- 일회성 vs 소모품 지출 비율 (PieChart)
- 카테고리별 지출 합계 (BarChart, 전체 이력 합산)
- 월별 지출 추이 (최근 6개월, LineChart)

### 3-5. 설정 (`/settings`)

- **내보내기**: 전체 데이터를 JSON 다운로드. "영수증 포함 / 제외" 선택 (기본 제외). 포함 시 영수증은 base64로 인코딩해 넣는다
- **가져오기**: JSON 파일 선택 → "덮어쓰기 / 기존 데이터에 합치기" 선택 후 복원. 합치기는 id 충돌 시 새 id 발급
- **전체 초기화**: 확인 모달에서 "초기화"를 직접 입력해야 실행

---

## 4. 영수증 업로드 파이프라인 (`src/lib/receipt.ts`)

순서대로 실행하고, 각 단계에서 실패하면 즉시 중단한다.

1. **원본 크기 검사** — 파일 선택 즉시 `file.size` 확인. 10MB 초과 시 압축을 시도하지 않고 "파일 용량이 너무 커요 (10MB 이하만 가능)" 안내 후 첨부만 취소. **나머지 입력값은 유지한다.**
2. **리사이즈** — Canvas API로 가로 최대 1200px (비율 유지, 원본이 더 작으면 확대하지 않음)
3. **1차 압축** — `canvas.toBlob(type: 'image/jpeg', quality: 0.7)`
4. **재압축** — 결과가 1.5MB 초과면 quality 0.5로 1회 재시도
5. **최종 판정** — 그래도 1.5MB 초과면 영수증 저장을 포기하고 "이미지 용량이 너무 커서 저장할 수 없어요" 안내. **품목·가격 등 나머지 데이터는 정상 저장한다.**

> 아티팩트 버전(5MB 제한) 대비 상한을 올렸다. IndexedDB는 용량 제한이 훨씬 여유롭고 Blob을 그대로 저장하므로 base64 오버헤드(약 33%)도 없다.

- 지원 형식: jpeg, png, webp, heic. heic는 브라우저 디코딩 실패 가능성이 있으므로 실패 시 "이 형식은 지원하지 않아요" 안내
- EXIF orientation 보정 필요 (세로로 찍은 영수증이 눕는 문제)

---

## 5. 파일 구조

```
src/
  main.tsx
  App.tsx
  lib/
    db.ts          // idb 초기화, CRUD
    calc.ts        // 주기·소진일·단가 계산 (순수 함수)
    units.ts       // 단위 그룹, 환산
    receipt.ts     // 이미지 압축 파이프라인
    backup.ts      // 내보내기/가져오기
  components/
    ItemCard.tsx
    ItemForm.tsx
    PurchaseTimeline.tsx
    PriceChart.tsx
    ReceiptViewer.tsx
    ConfirmModal.tsx
    EmptyState.tsx
  pages/
    Home.tsx
    ItemDetail.tsx
    Stats.tsx
    Settings.tsx
  types.ts
```

---

## 6. 구현 순서 (Phase)

각 Phase가 끝날 때마다 `npm run dev`로 동작을 확인하고 다음으로 넘어간다.

| Phase | 내용 |
|---|---|
| **1** | 프로젝트 세팅, `types.ts`, `db.ts` (IndexedDB CRUD), `units.ts` |
| **2** | `calc.ts` 계산 로직 + 간단한 테스트 케이스로 검증 |
| **3** | 메인 화면 + 항목 추가 폼 + 유효성 검증 (영수증 제외) |
| **4** | 상세보기 — 이력 타임라인, "1개 다 썼음", 주기 표시 단위 토글 |
| **5** | 가격 추이 그래프 (recharts) |
| **6** | 영수증 업로드 파이프라인 + 뷰어 |
| **7** | 필터·정렬·검색 |
| **8** | 통계 페이지 |
| **9** | 내보내기 / 가져오기 / 초기화 |
| **10** | 모바일 UI 다듬기, 빈 상태·로딩·에러 처리 점검 |

---

## 7. 공통 요구사항

- **모바일 우선.** 기준 폭 375px에서 어색함이 없어야 한다. 터치 타겟 최소 44px
- 모든 IndexedDB 접근은 try-catch로 감싸고, 실패 시 사용자에게 무엇이 실패했는지 알린다. 조용히 실패하지 않는다
- 데이터 로딩 중에는 스켈레톤 또는 로딩 표시
- 삭제는 항상 확인 모달을 거친다
- 에러 메시지는 무엇이 잘못됐고 어떻게 고치는지 알려준다. 사과하지 않고, 모호하지 않게
- 통화 표기는 원(₩), 천 단위 구분자 사용
- 날짜 표기는 `YYYY.MM.DD`
- 톤: 실용적이고 정돈된 스타일. 템플릿처럼 보이는 기본값(크림색 배경 + 세리프 + 테라코타 조합 등)은 피한다

---

## 8. 나중에 검토할 것

- 여러 개를 동시에 개봉해 쓰는 경우 (화장실용 1개 + 주방용 1개) → 예상 소진일 계산식 수정 필요
- PWA 전환 (홈 화면 추가, 오프라인 동작)
- 소진 임박 항목을 모은 쇼핑 리스트
- 오래된 영수증 자동 정리
