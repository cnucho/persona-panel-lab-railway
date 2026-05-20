# 비용 정책

## 기본 예산

- 사용자별 예산: `30,000 credits`
- 기본 환산: `1 credit = 0.1 KRW`
- 기본 예산의 원화 추정: 약 `3,000 KRW`

```env
CREDIT_BUDGET_PER_USER=30000
KRW_PER_CREDIT=0.1
USD_TO_KRW=1400
```

## 차감 공식

```text
usdCost = inputTokens / 1,000,000 * inputPrice
        + outputTokens / 1,000,000 * outputPrice
krwCost = usdCost * USD_TO_KRW
creditsCharged = ceil(krwCost / KRW_PER_CREDIT)
```

앱은 요청 전에 예상 출력 토큰 기준으로 차단 여부를 판단하고, 응답 후 실제 사용량 기준으로 차감합니다.

## 비용을 줄이는 운영 방식

- 기본은 `균형형` 또는 `경제형`으로 운영합니다.
- `심화형`은 꼭 필요한 라운드에서만 사용합니다.
- 퍼소나는 3~4명으로 시작합니다.
- 공동 대화장은 한 번의 호출로 여러 관점을 얻을 수 있어 비용 효율이 좋습니다.
- 개별 대화창은 특정 퍼소나의 관점을 깊게 파야 할 때만 사용합니다.
- 요약은 매 라운드가 아니라 회의 후반 또는 제출 직전에 생성합니다.
- 긴 회의록을 계속 보내지 않도록 요약본과 최근 메시지만 맥락으로 사용합니다.

## 모델 가격표 관리

`src/server.js`의 `MODEL_PRICES`는 앱 내부 추정용입니다. OpenAI 모델 가격은 바뀔 수 있으므로 실제 배포 전 사용하는 모델 가격에 맞게 수정하세요.
