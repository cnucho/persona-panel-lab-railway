# 크레딧 정책

크레딧은 학생별 사용량 제한 장치입니다. 이 앱은 실제 환율을 적용하지 않고, OpenAI API 원가 USD를 고정 비율로 크레딧에 변환합니다.

## 기본 원칙

- 학생 1인 기본 한도: `30,000 credits`
- 구매가 기준: `1 credit = 1원`
- API 원가 기준 변환: `1 USD = 14,000 credits`
- 차감 공식: `ceil(cost_usd * 14000)`
- 데모 모드: `0 credits`

따라서 학생 1인의 기본 한도는 구매가 기준 30,000원 상당이며, API 원가 기준으로 약 2.14 USD까지 허용합니다.

## 서버 제한

```env
CREDIT_BUDGET_PER_USER=30000
CREDITS_PER_USD_COST=14000
PURCHASE_KRW_PER_CREDIT=1
MAX_PERSONAS=5
MAX_ROUNDS_PER_SESSION=8
MAX_MESSAGES_PER_SESSION=100
MAX_OUTPUT_TOKENS=700
```

예전 원화 환산용 변수는 사용하지 않습니다.

## 깊이별 운영

- 경제형: 짧은 응답, 낮은 출력 토큰, 반복 질문에 적합
- 균형형: 일반 수업 활동에 적합
- 심화형: 전문 지식, 가치 충돌, 반론, 검증 필요 항목을 더 깊게 다룸

학생에게 심화형은 더 많은 credits를 사용할 수 있음을 안내하고, 모든 라운드를 심화형으로 진행하지 않도록 운영하는 것이 좋습니다.
