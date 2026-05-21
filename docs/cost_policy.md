# 비용 정책

## 기본 원칙

- 내부 비용 계산 단위는 원가 USD입니다.
- 모델별 OpenAI 단가와 사용 토큰으로 `cost_usd`를 계산합니다.
- 크레딧 차감 공식은 고정입니다.

```text
credits_to_deduct = ceil(cost_usd * 14000)
```

즉 API 원가 1 USD가 발생하면 14,000 credits를 차감합니다.

## 학생 기본 한도

- 학생 1인당 기본 지급 크레딧: `30,000 credits`
- 구매가 기준: `1 credit = 1원`
- 기본 지급액의 구매가 기준 가치: `30,000원`
- API 원가 기준 허용량: `30000 / 14000 = 약 2.14 USD`

실제 환율이나 예전 원화 환산 방식은 크레딧 차감 공식에 사용하지 않습니다.

## 운영 방식

- 요청 전에는 예상 토큰 사용량으로 예상 차감 크레딧을 계산해 잔액 부족 여부를 판단합니다.
- 응답 후에는 실제 API usage의 input/output tokens로 `cost_usd`를 다시 계산하고 최종 차감합니다.
- 데모 모드에서는 실제 API 호출이 없으므로 `0 credits`를 차감합니다.
- 비용 효율을 위해 긴 회의는 rolling summary와 최근 회의록 일부만 모델에 보냅니다.

## 모델 단가

모델별 USD 단가는 [src/server.js](../src/server.js)의 `MODEL_PRICING_USD_PER_1M_TOKENS`에서 관리합니다. OpenAI 가격이 바뀌면 이 표만 최신 가격에 맞게 조정합니다.
