# Railway 배포 메모

## 환경 변수

```env
OPENAI_API_KEY=sk-...
DEFAULT_MODEL=gpt-5.4-mini
SUMMARY_MODEL=gpt-5.4-nano
EDITOR_MODEL=gpt-5.4-nano
PREMIUM_MODEL=gpt-5.4-mini
# 학생 1인당 기본 제공 크레딧
CREDIT_BUDGET_PER_USER=30000
# API 원가 1 USD당 차감할 크레딧
CREDITS_PER_USD_COST=14000
# 구매 기준 1 credit = 1원
PURCHASE_KRW_PER_CREDIT=1
MAX_PERSONAS=5
MAX_ROUNDS_PER_SESSION=6
MAX_MESSAGES_PER_SESSION=80
MAX_OUTPUT_TOKENS=700
REQUIRE_ACCESS_CODE=false
ACCESS_CODES=student01,student02
CLASSROOM_SHARED_SECRET=replace-this-secret
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

예전 원화 환산용 변수는 사용하지 않으므로 Railway 변수에 넣지 않습니다.

## 크레딧 정책

- 내부 비용 단위: OpenAI API 원가 USD
- 차감 공식: `credits_to_deduct = ceil(cost_usd * 14000)`
- API 원가 1 USD: `14,000 credits`
- 구매가 기준: `1 credit = 1원`
- 학생 기본 한도: `30,000 credits`
- 학생 기본 한도의 API 원가 기준: 약 `2.14 USD`

실제 환율은 크레딧 차감 공식에 사용하지 않습니다.

## 접근 코드 운영

공개 URL을 학생에게 줄 경우 다른 사람이 접속해 credits를 사용할 수 있습니다. 실제 수업에서는 다음 설정을 권장합니다.

```env
REQUIRE_ACCESS_CODE=true
ACCESS_CODES=s01,s02,s03,s04,s05
```

교사가 학생마다 코드를 나누어 주면 됩니다. 앱은 같은 수업 코드를 쓰더라도 브라우저별 `clientId`와 학생 식별자로 크레딧을 분리합니다.

## 비용 통제

앱 내부 한도:

- 학생별 기본 `30,000 credits`
- 세션당 퍼소나 최대 5명
- 세션당 라운드 최대 6~8회 권장
- 세션당 메시지 최대 80~100개 권장
- 응답 길이 최대 700 토큰 권장

Railway 한도:

- Workspace Usage에서 Compute hard limit 설정
- Postgres resource limit 확인

OpenAI 한도:

- OpenAI Platform Usage limit 설정
- 가능하면 수업 전용 프로젝트/API key 사용

## 데이터 보존

`DATABASE_URL`이 없으면 메모리 저장소를 사용하므로 재시작 시 데이터가 사라집니다. 수업 제출물을 안정적으로 저장하려면 Railway Postgres를 연결합니다.
