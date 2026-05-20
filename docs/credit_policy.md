# 크레딧 정책

## 기본 원칙

이 앱의 크레딧은 수업용 내부 단위입니다.

- 학생 1인 기본 한도: 30,000 credits
- 내부 환산: 1 credit = 0.1 KRW
- 30,000 credits ≈ 3,000 KRW

앱은 OpenAI API 응답의 실제 usage 값을 읽어 사용량을 차감합니다. 사전에는 예상 비용으로 차단하고, 사후에는 실제 사용량으로 기록합니다.

## 비용 계산식

```txt
usdCost = inputTokens/1,000,000 * inputPrice + outputTokens/1,000,000 * outputPrice
krwCost = usdCost * USD_KRW
creditsCharged = ceil(krwCost / CREDIT_KRW_VALUE)
```

## 기본 모델 예시

기본 모델은 `gpt-5.4-mini`로 두었습니다.

```env
OPENAI_MODEL=gpt-5.4-mini
MODEL_INPUT_USD_PER_1M=0.75
MODEL_OUTPUT_USD_PER_1M=4.50
USD_KRW=1500
CREDIT_KRW_VALUE=0.1
```

예상 호출 하나가 input 2,000 tokens, output 800 tokens라면:

```txt
USD = 2000/1M*0.75 + 800/1M*4.50 = 0.0051 USD
KRW = 0.0051 * 1500 = 7.65 KRW
credits = ceil(7.65 / 0.1) = 77 credits
```

30,000 credits면 이런 호출을 약 390회 정도 할 수 있습니다. 실제 수업에서는 회의당 10~30회 호출 수준으로 제한하는 것이 좋습니다.

## 상위 모델 사용 시

상위 모델을 모든 퍼소나 호출에 쓰면 비용이 빠르게 증가합니다. 권장 방식은 다음입니다.

- 퍼소나 발언: mini 모델
- 요약/검사: mini 또는 nano 모델
- 최종 보고서 품질 개선: 상위 모델 선택 사용

## 제한 장치

서버에는 다음 제한이 들어 있습니다.

- `DEFAULT_STUDENT_CREDIT_LIMIT`: 학생별 총 한도
- `MAX_OUTPUT_TOKENS`: 호출당 출력 토큰 제한
- `MAX_ESTIMATED_INPUT_TOKENS`: 너무 긴 회의록 재주입 방지

회의록이 길어지면 전체 원문을 계속 보내지 말고 요약본을 사용해야 합니다.
