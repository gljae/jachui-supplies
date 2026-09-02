# 구현 계획 (PLAN.md)

`SPEC.md`를 실행 가능한 수준으로 구체화한 문서. SPEC이 "무엇을"이라면 이 문서는 "어떻게, 어떤 순서로, 무엇이 끝나면 다음으로"를 정한다.
SPEC과 충돌하면 **SPEC이 우선**이며, 이 문서는 SPEC이 비워둔 부분만 채운다.

---

## A. SPEC의 빈틈과 결정 사항

구현 전에 확정해야 하는 항목들. 각 항목의 **결정**은 기본값이며, 다르게 가고 싶으면 여기만 고치면 된다.

| # | 빈틈 | 결정 |
|---|---|---|
| A1 | **Node.js 미설치** (현재 머신에 `node`/`npm` 없음) | Phase 0에서 Node LTS 설치 후 시작 |
| A2 | 라우트(`/item/:id`, `/stats`, `/settings`)는 있는데 **라우터 의존성이 없음** | `react-router-dom` 추가. `HashRouter` 사용 (정적 배포·file:// 열람·향후 PWA에서 안전) |
| A3 | Phase 2가 "테스트 케이스로 검증"인데 **테스트 러너가 없음** | `vitest` 추가. `calc.ts` / `units.ts`만 대상, DOM 테스트 없음 |
| A4 | Home·Stats·Settings **간 이동 수단이 없음** | 하단 탭바 `BottomNav.tsx` 추가 (홈 / 통계 / 설정, 높이 56px + safe-area) |
| A5 | 에러를 "조용히 실패하지 않는다"고 했으나 **알림 UI가 없음** | `Toast.tsx` + `useToast` 추가. 모든 DB 실패는 토스트로 노출 |
| A6 | 데이터 상태 관리 방식 미정 | `state/DataContext.tsx` — items/purchases 전량을 메모리에 로드, 변경 후 해당 스토어만 재조회. 영수증은 제외(lazy) |
| A7 | 상태 배지 **우선순위**가 모호 | `outOfStock` > `collecting` > `soon` > `ok`. 재고가 0이면 예측이 무의미하므로 재고 없음이 최우선 |
| A8 | `perVolume`의 **"대표 volume"** 정의 없음 | 용량이 있는 이력 중 **가장 최근 구매**의 `volume`+`unit`. 라벨은 원래 단위로 표기("3L당", "500ml당") |
| A9 | 남은 개수 표기 규칙(`"3개 / 2롤"`)이 "그룹별"이라는데 개·롤은 같은 count 그룹 | **표기 단위 = unit이 count 그룹이면 그 unit, volume/weight 그룹이면 `개`.** 이 키로 remaining을 합산해 ` / `로 연결 → SPEC 예시와 일치 |
| A10 | **일회성(oneTime)** 품목의 재고·주기·소진일 처리 미정 | oneTime은 `quantity=1, remaining=1, depletionDates=[]`로 저장하고, 남은개수·주기·소진일·"1개 다 썼음"·단가를 **전부 미표시**. 카드에는 최근 구매일 + 누적 지출만 |
| A11 | 날짜 저장 포맷("ISO"만 명시) | 날짜 전용 필드는 **`yyyy-MM-dd` 로컬 날짜 문자열**로 통일(`purchaseDate`, `depletionDates`). 타임존 밀림 방지를 위해 계산은 `differenceInCalendarDays` |
| A12 | `depletionDates` 정렬 보장 없음 | push 후 항상 오름차순 정렬. 계산 함수도 방어적으로 정렬 |
| A13 | 예상 소진일이 **이미 지난 경우** | `soon`으로 두되 문구를 "N일 지남"으로 분기 |
| A14 | 백업 JSON 스키마 미정 | `{ schema, version, exportedAt, includeReceipts, items, purchases, receipts }` (C절 참조) |
| A15 | id 생성 방식 | `crypto.randomUUID()` |
| A16 | "약 O개월" 반올림 | `days / 30.44`, 소수 1자리 |
| A17 | 가격 추이 3건의 **정렬 방향** | 최근 3건을 고른 뒤 x축은 **오래된 → 최신** |
| A18 | 통화·숫자 포맷 위치 | `lib/format.ts` 신설 (`formatKRW`, `formatDate`, `formatUnitValue`) |
| A19 | 가져오기 "합치기"의 id 재발급 순서 | items → purchases(`itemId` 재매핑) → receipts(`purchaseId` 재매핑) 순서로 매핑 테이블을 만들며 진행 |

### 추가 의존성 (SPEC 목록 외)

```
react-router-dom     # A2
vitest (dev)         # A3
```

그 외에는 SPEC의 스택을 그대로 따른다.

---

## B. 최종 파일 구조

SPEC 5절 + 위 결정으로 추가되는 파일(★).

```
src/
  main.tsx
  App.tsx                     // HashRouter + 라우트 + BottomNav + ToastProvider
  types.ts
  lib/
    db.ts
    calc.ts
    units.ts
    receipt.ts
    backup.ts
    format.ts               ★ 통화·날짜·용량 포맷
  state/
    DataContext.tsx         ★ items/purchases 메모리 캐시 + mutation 래퍼
  components/
    ItemCard.tsx
    ItemForm.tsx
    PurchaseTimeline.tsx
    PriceChart.tsx
    ReceiptViewer.tsx
    ConfirmModal.tsx
    EmptyState.tsx
    BottomNav.tsx           ★
    Toast.tsx               ★
    Sheet.tsx               ★ 바텀시트 공통(추가 폼·모달 베이스)
    FormField.tsx           ★ 라벨 + 인라인 에러 공통
    StatusBadge.tsx         ★ ok/soon/outOfStock/collecting 배지
    Skeleton.tsx            ★ 로딩 표시
  pages/
    Home.tsx
    ItemDetail.tsx
    Stats.tsx
    Settings.tsx
  lib/calc.test.ts          ★
  lib/units.test.ts         ★
```

---

## C. 모듈별 공개 API (구현 전 합의용 시그니처)

### `lib/units.ts`

```ts
export const UNIT_GROUP: Record<Unit, UnitGroup>;
export const STANDARD_UNIT: Record<UnitGroup, Unit>;      // volume:'L', weight:'kg', count:'개'
export function groupOf(unit: Unit): UnitGroup;
export function toStandard(value: number, unit: Unit): number;   // (500,'ml') -> 0.5
export function fromStandard(value: number, unit: Unit): number;
export function unitGroupsOf(ps: Purchase[]): UnitGroup[];       // 중복 제거
export function isMixedUnitGroup(ps: Purchase[]): boolean;       // 길이 > 1
```

### `lib/calc.ts`

순수 함수만. **이 파일 안에서 `new Date()` 호출·DOM 접근 금지** — 오늘 날짜는 인자로 받는다.

```ts
export interface UsageSample { days: number; volumeStd: number | null }

export function usageGaps(p: Purchase): number[];                 // 2-1, 한 이력의 간격 배열
export function usageSamples(ps: Purchase[]): UsageSample[];       // 품목 전체 표본
export function avgDaysPerUnit(ps: Purchase[]): number | null;     // mean(days)
export function avgDaysPerStandardVolume(ps: Purchase[]): number | null; // mean(days / volumeStd)

export type CycleMode = 'perUnit' | 'perVolume' | 'perStandard';
export interface CycleOption { mode: CycleMode; enabled: boolean; days: number | null; label: string }
export function representativePurchase(ps: Purchase[]): Purchase | null;  // A8
export function cycleOptions(ps: Purchase[]): CycleOption[];       // 토글 3개를 그대로 렌더

export function avgPurchaseIntervalDays(ps: Purchase[]): number | null;   // 2-3

export type StockStatus = 'outOfStock' | 'collecting' | 'soon' | 'ok';
export interface DepletionResult {
  status: StockStatus;
  expectedDate: string | null;   // yyyy-MM-dd
  daysLeft: number | null;       // 음수면 지남
}
// G0 — 개봉 시점을 재고 곡선 재생으로 판정 (SPEC 2-4의 `??` 를 대체)
export interface StockEvent { date: string; delta: number }        // 구매 +quantity, 소진 -1
export function stockEvents(ps: Purchase[]): StockEvent[];          // 날짜 오름차순, 같은 날이면 구매 먼저
export function currentUnitOpenedAt(ps: Purchase[]): string | null;

export function predictDepletion(ps: Purchase[], today: Date): DepletionResult;

export function totalRemaining(ps: Purchase[]): { label: string; count: number }[]; // A9
export function unitPrice(p: Purchase): { value: number; unit: Unit } | null;       // 2-5
export function totalSpent(ps: Purchase[]): number;
```

**계산상 반드시 지킬 것**

- `perStandard` = `mean(days_i / volumeStd_i)` — **표본별로 먼저 나눈 뒤 평균**. 총합끼리 나누지 않는다.
- `perVolume` = `perStandard × 대표 volume(표준 환산)`, 라벨은 대표 이력의 원래 단위로.
- 단위 그룹이 섞이거나(`isMixedUnitGroup`) 용량 있는 표본이 없으면 `perVolume`/`perStandard`는 `enabled: false`.
- 소진일 기준 시점은 **SPEC 2-4의 `??` 를 쓰지 않는다.** `currentUnitOpenedAt`으로 구한다 (G0 참조):

```
1) 이벤트 생성: 각 purchase → (purchaseDate, +quantity), 각 depletionDate → (date, -1)
2) 날짜 오름차순 정렬. 같은 날이면 구매를 먼저 적용 (재고가 음수로 내려가지 않게)
3) 누적 재고를 계산하며, 재고가 0(또는 시작)에서 양수로 바뀐 마지막 이벤트 날짜 = lastRefill
4) lastDepletion = max(모든 depletionDates)
5) openedAt = max(lastRefill, lastDepletion)   // 한쪽이 null이면 나머지
6) 예상 소진일 = openedAt + avgDaysPerUnit
```

### `lib/db.ts`

```ts
export function getDB(): Promise<IDBPDatabase<Schema>>;   // 싱글턴, upgrade에서 스토어·인덱스 생성
export const itemsRepo:    { all(): Promise<Item[]>;     get(id): ...; put(i): ...; remove(id): ... };
export const purchaseRepo: { all(): Promise<Purchase[]>; byItem(itemId): ...; put(p): ...; remove(id): ... };
export const receiptRepo:  { get(purchaseId): Promise<Receipt|undefined>; put(r): ...; remove(purchaseId): ... };
export function deleteItemCascade(itemId: string): Promise<void>;      // item + purchases + receipts, 1 트랜잭션
export function deletePurchaseCascade(purchaseId: string): Promise<void>;
export function clearAll(): Promise<void>;
```

모든 함수는 실패 시 원인 문구를 담은 `DBError`를 throw하고, 호출부에서 토스트로 노출한다.

### `lib/receipt.ts`

```ts
export const MAX_INPUT_BYTES  = 10 * 1024 * 1024;
export const MAX_STORED_BYTES = 1.5 * 1024 * 1024;
export type ReceiptResult =
  | { ok: true; blob: Blob; mimeType: string; size: number }
  | { ok: false; reason: 'tooLarge'|'unsupported'|'decodeFailed'|'stillTooLarge'; message: string };
export function processReceipt(file: File): Promise<ReceiptResult>;
```

파이프라인(SPEC 4절 순서 그대로, 실패 시 즉시 중단):

1. `file.size > MAX_INPUT_BYTES` → `tooLarge`. **첨부만 취소하고 폼 입력값은 유지**
2. MIME 화이트리스트(`image/jpeg|png|webp|heic|heif`, 확장자 fallback) 아니면 `unsupported`
3. 디코딩: `createImageBitmap(file, { imageOrientation: 'from-image' })` → **EXIF orientation 보정 확보**. 실패 시 `<img>` fallback, 그것도 실패하면 `decodeFailed`("이 형식은 지원하지 않아요")
4. 리사이즈: 가로 최대 1200px, 비율 유지, **원본이 더 작으면 확대 금지**
5. `toBlob('image/jpeg', 0.7)` → 1.5MB 초과 시 `0.5`로 1회 재시도 → 그래도 초과면 `stillTooLarge`
6. `stillTooLarge`여도 **품목·가격 등 나머지 데이터는 정상 저장**하고 안내만 띄운다

### `lib/backup.ts`

```ts
export interface BackupFile {
  schema: 'jachui-supplies-backup';
  version: 1;
  exportedAt: string;
  includeReceipts: boolean;
  items: Item[];
  purchases: Purchase[];
  receipts: { purchaseId: string; mimeType: string; size: number; data: string /* base64 */ }[];
}
export function exportBackup(opts: { includeReceipts: boolean }): Promise<Blob>;
export function importBackup(
  file: File, mode: 'overwrite' | 'merge'
): Promise<{ items: number; purchases: number; receipts: number }>;
```

가져오기는 파싱 → `schema`/`version` 검증 → 실패 시 **아무것도 쓰지 않고** 에러. `merge`는 A19 순서로 id를 재발급한다.

---

## D. Phase별 실행 계획

각 Phase는 **완료 조건**을 모두 만족해야 다음으로 넘어간다. Phase 종료 시마다 `npm run dev`로 육안 확인.

### Phase 0 — 개발 환경 (SPEC에 없음, 필수)

- Node.js LTS 설치: `winget install OpenJS.NodeJS.LTS` → **새 터미널**에서 `node -v`, `npm -v` 확인
- `git init` + `.gitignore` (SPEC은 언급 없으나 Phase 단위 커밋용으로 권장)
- **완료 조건**: `node -v`가 20 이상 출력

### Phase 1 — 세팅 · 타입 · DB · 단위

- `npm create vite@latest . -- --template react-ts`, 의존성 설치(+ `react-router-dom`, `-D vitest`)
- Tailwind v4: `vite.config.ts`에 `@tailwindcss/vite` 플러그인, `index.css`에 `@import "tailwindcss";`
- `types.ts` — SPEC 1절 그대로
- `db.ts` — DB `jachui-supplies` v1, 스토어 3개 + 인덱스(`items.category`, `items.type`, `purchases.itemId`, `purchases.purchaseDate`), C절 API, cascade 삭제 트랜잭션
- `units.ts`, `format.ts`
- **저장소 영속화**(G2) — 앱 시작 시 `navigator.storage.persist()` 호출, 결과를 컨텍스트에 보관해 설정 화면 배너에 사용
- **완료 조건**: 앱이 뜨고, item/purchase를 넣고 읽는 왕복이 성공. DevTools → Application → IndexedDB에 스토어 3개 확인. `navigator.storage.estimate()`가 값을 반환

### Phase 2 — 계산 로직 + 테스트 ★가장 중요

`calc.ts` 구현 후 아래 케이스가 전부 통과해야 한다.

| 케이스 | 입력 | 기대값 |
|---|---|---|
| 간격 추출 | `purchaseDate 2025-01-01`, `depletion [01-25, 02-20]` | `[24, 26]` |
| 데이터 없음 | `depletion []` | `[]`, `avgDaysPerUnit → null` |
| 여러 이력 평균 | 표본 `[24,26]` + `[20]` | `avgDaysPerUnit ≈ 23.33` |
| **왜곡 방지** | 3L짜리 30일, 1L짜리 15일 | `perStandard = mean(10,15) = 12.5` (❌ 45/4=11.25 아님) |
| perVolume | 위 + 대표=최신 1L | `12.5일`, 라벨 `"1L당"` |
| 단위 혼재 | `L` 이력 + `롤` 이력 | `perVolume`/`perStandard`의 `enabled === false` |
| 구매 주기 | `01-01, 02-01, 03-03` | `≈ 30.5일` |
| 구매 주기 부족 | 이력 1건 | `null` |
| 월 병기 | `avgInterval 62일` | `"약 2.0개월"` 병기 |
| 소진 예측 ok | 마지막 소진 오늘-5, 평균 30일 | `status 'ok'`, `daysLeft 25` |
| 소진 예측 soon | `daysLeft 7` | `'soon'` (경계 포함) |
| ok 경계 | `daysLeft 8` | `'ok'` |
| 지남 | `daysLeft -3` | `'soon'` + "3일 지남" |
| 재고 없음 우선 | `remaining 합 0`, 표본 있음 | `'outOfStock'` |
| 데이터 수집 중 | 표본 없음, `remaining > 0` | `'collecting'` |
| 남은개수 표기 | `L 이력 3` + `롤 이력 2` | `"3개 / 2롤"` |
| 단가 | `9,000원 / 3L×2` | `1,500원 / L` |
| 단가 환산 | `6,000원 / 500ml×4` | `3,000원 / L` |
| 단가 없음 | `volume` 없음 | `null` |

- **완료 조건**: `npm test` 전부 통과. `calc.ts` 안에 `new Date()`·DOM 접근 없음

### Phase 3 — 메인 + 항목 추가 폼 (영수증 제외)

- `DataContext` 초기 로드(+스켈레톤), `Home.tsx` 카드 리스트, `EmptyState`
- 카드: 품목명 / 카테고리 뱃지 / 남은개수 / 평균 주기 / 상태 배지 / 최근 구매가 — **영수증·그래프는 절대 노출 금지**
- oneTime 카드는 A10대로 축약형
- FAB(+) → `Sheet` 안에 `ItemForm`. 타입 선택에 따라 필드 분기, 품목명·카테고리 자동완성(기존 값 datalist)
- 유효성: 미래 날짜 / 가격 음수 / 수량·용량 ≤ 0 → **필드 하단 인라인 에러**, 저장 실패 시 입력값 유지
- **완료 조건**: 375px 폭에서 소모품·일회성 각 1건 등록 → 새로고침 후에도 카드 유지. 유효성 3종 모두 인라인 에러 확인

### Phase 4 — 상세보기

- 라우트 `/item/:id`, 헤더 / 주기 요약(단순 주기 + 실사용 주기 + 토글 3종 + 예상 소진일) / 타임라인(최신순)
- "1개 다 썼음" → `remaining -= 1`, `depletionDates.push(오늘)` + 정렬 → 즉시 재계산. `remaining === 0`이면 버튼 비활성 + "소진 완료"
- 소진일 목록 접기/펼치기, 이력 개별 삭제(확인 모달 → receipt 동반 삭제), 하단 품목 수정 / 품목 삭제(cascade + 모달)
- **완료 조건**: 소진 버튼을 여러 번 눌러 평균 주기·예상 소진일이 갱신되고, 토글 3종의 값이 Phase 2 테스트와 일치

### Phase 5 — 가격 추이 그래프

- `PriceChart` — recharts `BarChart`, 최근 3건(x축 오래된→최신), 막대=총액, 막대 위 라벨=단위당 단가, x축 `MM/DD 브랜드명`
- 0건이면 **영역 자체를 숨김**, 3건 미만이면 있는 만큼
- **완료 조건**: 이력 0/1/3/5건에서 각각 정상. 375px에서 x축 라벨이 겹치지 않음

### Phase 6 — 영수증

- `receipt.ts` 파이프라인 + `ReceiptViewer`(전체화면), 타임라인에 썸네일 **lazy load**(상세 진입 시에만), 없으면 "영수증 없음" 회색 텍스트
- 실패 경로 4종의 안내 문구 확인
- **완료 조건**: 10MB 초과 / 미지원 형식 / 정상 / 세로 사진(EXIF) 케이스 확인. 목록 화면 조회에 Blob 읽기가 없음

### Phase 7 — 검색 · 필터 · 정렬

- 검색(품목명·브랜드·카테고리), 필터 칩(타입 / 카테고리 / 소진 임박), 정렬(소진임박순 / 최근구매순 / 이름순 / 누적지출순)
- 정렬은 파생값 계산 결과를 `useMemo`로 캐시
- **완료 조건**: 검색+필터+정렬 동시 적용이 올바르고, 결과 0건일 때 "조건에 맞는 물품이 없어요" 표시

### Phase 8 — 통계

- 이번 달 총 지출 / 일회성 vs 소모품 PieChart / 카테고리별 BarChart / 최근 6개월 LineChart(데이터 없는 달은 0)
- **완료 조건**: 데이터 0건일 때도 깨지지 않고 빈 상태 노출

### Phase 9 — 백업

- 내보내기(영수증 포함 / 제외, 기본 제외) / 가져오기(덮어쓰기 · 합치기) / 전체 초기화("초기화" 직접 입력)
- **완료 조건**: 내보내기 → 초기화 → 가져오기 왕복 후 데이터가 동일. 합치기에서 id 충돌 시 참조가 깨지지 않음

### Phase 10 — 마감

- 375px 점검, 터치 타겟 44px, 로딩 스켈레톤, 모든 DB 실패의 토스트 노출, 문구 톤 점검(사과·모호 금지)
- **완료 조건**: 아래 E절 체크리스트 전부 통과

---

## E. 최종 체크리스트

- [ ] 375px에서 가로 스크롤 없음, 모든 버튼 44px 이상
- [ ] 모든 IndexedDB 호출이 try-catch로 감싸이고 실패가 화면에 뜬다
- [ ] 삭제는 전부 확인 모달을 거친다 (이력 / 품목 / 초기화)
- [ ] 메인 화면에 영수증·그래프가 없다
- [ ] 통화 `₩` + 천 단위 구분, 날짜 `YYYY.MM.DD`
- [ ] 단위 그룹 혼재 품목에서 용량 토글이 비활성이다
- [ ] `npm test` 통과, `npm run build` 경고 없이 성공
- [ ] 크림색+세리프+테라코타류 템플릿 기본값을 쓰지 않았다

---

## F. 시각 톤 (SPEC 7절 구체화)

- 배경 `neutral-50`, 카드 흰색 + `border-neutral-200` + 미세 그림자, 라운드 12px
- 폰트: 시스템 산세리프 스택(Pretendard 있으면 우선), 숫자는 `tabular-nums`
- 액센트 인디고(`indigo-600`), 경고 앰버(`amber-500` = soon), 강조 레드(`red-600` = outOfStock), 회색(collecting)
- 레이아웃: `max-w-md mx-auto`, 하단 탭바 고정 + `env(safe-area-inset-bottom)`

---

## G. 버그 지뢰밭 (구현 중 반드시 확인)

심각도 순. **G0은 SPEC의 계산식 자체를 고쳐야 하는 항목**이다.

### G0. 예상 소진일 기준 시점 — SPEC 2-4의 논리 오류 ★

SPEC: `사용 시작 시점 = 마지막 depletionDate ?? 가장 최근 purchaseDate`
`??`는 depletionDate가 하나라도 있으면 purchaseDate를 무시한다. 재구매 시 항상 틀린다.

```
01-01 구매(1개) → 02-01 소진(remaining 0) → 08-01 재구매
SPEC대로: 기준 02-01 + 평균31일 = 03-04 → 오늘 09-02 기준 "181일 지남"  ❌
실제:     8월에 산 새 제품, 이제 한 달 됨
```

**→ 결정: 정확한 수정(재고 곡선 재생)을 채택.** C절 `currentUnitOpenedAt` 참조.
`개봉 시점 = max(마지막 소진일, 재고가 0→양수로 바뀐 마지막 날)`. 순수 함수라 테스트하기 쉽고,
SPEC 8절 "동시 개봉 여러 개" 확장에서 재고 곡선을 그대로 재사용할 수 있다.

남는 한계(기록만): 한 품목을 두 곳에서 동시에 개봉해 쓰는 경우는 여전히 반영되지 않는다.

### G1. 날짜 · 타임존 (KST에서 매일 새벽 재현)

- `new Date().toISOString().slice(0,10)` → **UTC 날짜**. KST 00:00~09:00에 "1개 다 썼음"을 누르면 **어제**로 기록된다
- `new Date('2025-01-01')` → UTC 자정 파싱. 음수 오프셋 지역에서 하루 밀린다
- **규칙**: 오늘 문자열은 `format(new Date(),'yyyy-MM-dd')`, 파싱은 `parseISO`, 일수 차이는 `differenceInCalendarDays`. **`new Date(문자열)` 사용 금지**
- 미래 날짜 검증은 `input[max]`만으로 부족(모바일 키보드·직접 입력) → JS로도 `startOfDay` 비교

### G2. 데이터 유실 경로

| 경로 | 문제 | 대응 |
|---|---|---|
| 가져오기 "덮어쓰기" | `clearAll()` 후 파싱 실패 시 **기존·신규 모두 소실** | 파싱 + 스키마 검증 + 정합성 검증을 **전부 끝낸 뒤** 지운다. 가능하면 단일 트랜잭션 |
| 시크릿 모드 / 용량 부족 | 영수증 저장 시 `QuotaExceededError` | 잡아서 "저장 공간이 부족해요"로 안내, 나머지 데이터는 저장 |
| 다중 탭 | 한 탭에서 삭제 → 다른 탭의 메모리 캐시에 유령 데이터 | `BroadcastChannel`로 무효화하거나, 알려진 한계로 기록 |

#### 플랫폼별 저장소 유실 (iOS ≠ Android)

| 플랫폼 | 유실 조건 | 성격 |
|---|---|---|
| **iOS Safari (WebKit)** | 홈 화면 미추가 사이트는 **7일간 방문 없으면 자동 삭제** (ITP). iOS의 Chrome·Firefox도 WebKit이라 동일 | **시간 기반 — 가만히 둬도 사라진다.** 가장 위험 |
| **Android Chrome / Samsung Internet** | 7일 타이머 **없음**. 기기 저장공간이 부족할 때 **최근 사용이 뜸한 origin부터 통째로 evict** (LRU, best-effort 저장소) | 저장공간 압박 기반. 흔치는 않지만 발생 시 전량 소실 |
| **Android 인앱 브라우저** (카카오톡·인스타 등 WebView) | 앱마다 저장소가 **분리**돼 있고 앱이 임의로 정리한다 | "카톡으로 열었더니 데이터가 없다" — 실사용에서 가장 자주 겪는 경로 |
| 공통 | 시크릿 모드, 브라우저 "사이트 데이터 삭제", Android 설정의 "저장공간 확보" | 사용자 조작 |

**대응(플랫폼 공통, Phase 1에서 함께 넣는다)**

```ts
// 자동 eviction 면제 요청. Chrome/Android는 프롬프트 없이 휴리스틱(홈 화면 추가·북마크·
// 사용 빈도)으로 조용히 승인/거부한다. 거부돼도 앱은 정상 동작해야 한다.
const persisted = await navigator.storage?.persist?.();
const { usage, quota } = await navigator.storage?.estimate?.() ?? {};
```

- 설정 화면에 **저장 상태 배너**: `persisted === false`면 "브라우저가 공간이 부족하면 이 데이터를 지울 수 있어요. 홈 화면에 추가하고 가끔 내보내기를 해두세요."
- 사용량 표시(`usage / quota`)로 영수증이 얼마나 차지하는지 보여준다
- **홈 화면 추가 유도** — iOS의 7일 삭제를 피하는 유일하게 확실한 방법이고, Android에서는 `persist()` 승인 휴리스틱을 만족시킨다. SPEC 8절 PWA 전환의 실질적 이유
- 인앱 브라우저 감지 시 "기본 브라우저로 열기" 안내 (UA에 `KAKAOTALK`, `Instagram`, `FBAN/FBAV`, `Line` 등)
- 결론적으로 **어느 플랫폼에서도 내보내기가 유일한 보험**이다 → Phase 9를 뒤로 미루지 말 것

### G3. 계산을 조용히 오염시키는 값

- **0 나누기** — `volume` 또는 `quantity`가 0이면 `Infinity`가 표본에 섞여 **평균 전체가 `Infinity`**. 폼은 막지만 **가져오기 데이터는 검증이 없다** → import 시 `volume>0, quantity>0, price>=0` 검증 필수
- **gap 0** — 같은 날 구매+소진이면 표본 0일 → 평균이 끌려 내려가 예상 소진일이 "오늘". **0일 표본을 버릴지 결정하고 테스트로 고정**
- **`Number('')` === 0** — 빈 입력이 0으로 통과. 빈 문자열을 별도 분기
- **부동소수** — `500ml → 0.5L`, 단가 표시 시 반올림 자리 고정
- **되돌리기 없음** — 소진 버튼 오조작이 평균에 영구히 남는다. SPEC에 없지만 **소진일 개별 삭제**를 Phase 4에 넣는다

### G4. 상태 변경 정합성

- **불변 업데이트 강제** — `purchase.depletionDates.push(...)`는 참조가 그대로라 리렌더가 안 되고 캐시·DB가 어긋난다. 항상 `{...p, depletionDates:[...p.depletionDates, today].sort()}`
- **중복 클릭** — 비동기 저장 중 재클릭으로 `remaining`이 음수. 저장 중 버튼 disable + `Math.max(0, remaining-1)`
- **이력 수정 시 quantity 변경** — `remaining`을 어떻게 할지 미정. 규칙: `remaining = clamp(remaining + (newQty - oldQty), 0, newQty)`, `depletionDates.length > newQty`면 저장 거부
- **mutation 후 재조회 누락** / `useMemo` 의존성 누락 → 화면 미갱신

### G5. IndexedDB 함정

- **트랜잭션은 `await` 사이에 자동 커밋된다.** cascade 삭제 트랜잭션 안에서 IDB 외 비동기 작업(canvas, fetch)을 하면 `TransactionInactiveError`. 트랜잭션 안에는 IDB 호출만
- 스토어 생성은 `upgrade` 콜백 안에서만. 향후 v2 대비해 `if (!db.objectStoreNames.contains(...))` 가드
- 실패를 조용히 넘기지 않기 — 모든 repo 함수는 원인 문구를 담아 throw, 호출부에서 토스트

### G6. 영수증 파이프라인

- `canvas.toBlob` 콜백은 **null을 줄 수 있다** → 미처리 시 크래시
- **HEIC는 데스크톱 Chrome/Firefox에서 디코딩 불가.** "지원 형식"에 넣되 실패가 정상 경로임을 전제로 안내 문구를 준비
- `createImageBitmap` 성공 경로와 `<img>` fallback 경로의 **EXIF 처리 결과가 다르다**(fallback은 브라우저 자동 보정 → 이중 회전 위험). 양쪽 경로를 실제 세로 사진으로 각각 확인
- `ImageBitmap.close()`, `URL.revokeObjectURL()` 누락 시 누수. 뷰어 열고 닫기 반복으로 확인
- 원본이 작은 PNG면 **JPEG 변환 후 더 커질 수 있다** → 원본이 이미 상한 이하이고 더 작으면 원본 유지
- iOS는 canvas 픽셀 상한이 있어 초대형 원본의 `drawImage`가 빈 캔버스가 될 수 있다

### G7. 차트 (recharts)

- `ResponsiveContainer`는 **부모 높이가 없으면 0px**. 높이 명시
- 이력 1건이면 막대가 폭 전체를 차지 → `barSize` 상한
- 막대 위 단가 라벨이 상단에서 잘림 → `margin.top` 확보
- x축 `MM/DD 브랜드명`이 375px에서 겹침 → `interval={0}` + 브랜드명 truncate
- PieChart에서 두 값이 모두 0이면 NaN → 0건 분기

### G8. 정렬 · 필터 · 라우팅

- **소진임박순에서 `daysLeft === null`(collecting)** 을 0으로 두면 최상단을 점유한다 → null은 항상 맨 뒤
- 이름순은 `localeCompare('ko')`. 기본 정렬은 한글이 어색해진다
- 검색은 `trim()` + 대소문자 무시
- **품목 삭제 후 상세 페이지에 남으면 크래시** → 삭제 성공 시 즉시 `navigate('/', {replace:true})`
- **"로딩 중"과 "없는 id"를 구분** — 초기 로드 전 items가 빈 배열이라 정상 품목이 "없음"으로 보인다
- 시트가 열린 채 뒤로가기 → 시트만 닫히도록 처리

### G9. 백업 인코딩

- `btoa(String.fromCharCode(...new Uint8Array(buf)))` 는 큰 배열에서 **스택 오버플로**. 청크(예: 8KB) 단위로 인코딩
- 영수증 포함 내보내기는 수십 MB가 될 수 있다 → 진행 표시, 완료 후 `revokeObjectURL`
- merge 시 `itemId` / `purchaseId` 재매핑 누락 → 고아 레코드. A19 순서 준수

### G10. 모바일

- `100vh`는 모바일 주소창 때문에 잘린다 → `100dvh`
- input `font-size < 16px`면 iOS에서 포커스 시 확대된다
- FAB와 하단 탭바 겹침, `env(safe-area-inset-bottom)` 미적용 시 홈 인디케이터에 가림

### Phase 2 테스트에 추가할 케이스

| 케이스 | 입력 | 기대값 |
|---|---|---|
| G0 재구매 | 01-01 구매 → 02-01 소진 → 08-01 재구매, 평균 31일 | 기준 시점 08-01, `daysLeft`가 큰 음수가 아님 |
| G0 재고 있는 재구매 | 소진 02-01(재고 2 남음), 02-15 재구매 | 기준 시점 02-01 (재고가 0이 아니었으므로 리셋 안 함) |
| G0 같은 날 구매+소진 | 재고 0인 날에 구매와 소진이 같은 날짜 | 구매를 먼저 적용해 재고가 음수로 내려가지 않음 |
| G0 소진 이력 없음 | 구매만 3건 | 기준 시점 = 재고 0에서 양수로 바뀐 마지막 구매일 |
| G3 0 나누기 | `volume: 0` 이력 포함 | 결과에 `Infinity`/`NaN` 없음 |
| G3 gap 0 | 같은 날 구매+소진 | 정해진 규칙대로(제외 또는 포함) 일관 |
| G8 null 정렬 | collecting 항목 + soon 항목 | collecting이 항상 뒤 |
