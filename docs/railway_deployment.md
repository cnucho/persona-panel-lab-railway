# Railway 배포 메모

## 왜 Railway인가

- Node/Express 앱 배포가 간단합니다.
- 환경변수로 `OPENAI_API_KEY`를 숨길 수 있습니다.
- Postgres를 추가하면 회의록과 크레딧 사용량을 영구 저장할 수 있습니다.
- Workspace Usage에서 hard limit을 설정할 수 있습니다.

## 필요한 환경변수

```env
OPENAI_API_KEY=sk-...
DEFAULT_MODEL=gpt-5.4-mini
SUMMARY_MODEL=gpt-5.4-nano
CREDIT_BUDGET_PER_USER=30000
KRW_PER_CREDIT=0.1
USD_TO_KRW=1400
MAX_PERSONAS=5
MAX_ROUNDS_PER_SESSION=6
MAX_MESSAGES_PER_SESSION=80
MAX_OUTPUT_TOKENS=700
REQUIRE_ACCESS_CODE=false
ACCESS_CODES=student01,student02
CLASSROOM_SHARED_SECRET=replace-this-secret
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

## 접근 코드 운영

공개 URL을 학생에게 줄 경우, 다른 사람이 접속해 크레딧을 쓸 수 있습니다. 실제 수업에서는 다음 설정을 권장합니다.

```env
REQUIRE_ACCESS_CODE=true
ACCESS_CODES=s01,s02,s03,s04,s05
```

교사는 학생마다 코드를 나눠 주면 됩니다. 앱은 코드별로 크레딧을 따로 추적합니다.

## 비용 통제

앱 내부 한도:

- 학생별 `30,000 credits`
- 세션당 퍼소나 최대 5명
- 세션당 라운드 최대 6회
- 세션당 메시지 최대 80개
- 응답 길이 최대 700 토큰

Railway 한도:

- Workspace Usage에서 Compute hard limit 설정
- Postgres와 앱 서비스 replica/resource limit 설정

OpenAI 한도:

- OpenAI Platform Usage limit 설정
- 가능하면 수업 전용 프로젝트/API key 사용

## 데이터 보존

`DATABASE_URL`이 없으면 메모리 저장소를 사용하므로 재시작 시 데이터가 사라집니다. 수업 제출물을 안정적으로 저장하려면 Postgres를 붙여야 합니다.
