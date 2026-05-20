# Railway 배포 메모

## 배포 방식

가장 단순한 방식은 GitHub 저장소를 Railway에 연결하는 것입니다.

1. GitHub에 저장소 생성
2. Railway → New Project → Deploy from GitHub repo
3. 저장소 선택
4. Add PostgreSQL
5. 환경변수 입력
6. 배포

또는 CLI로는 다음 흐름을 쓸 수 있습니다.

```bash
railway init
railway add
railway up
railway domain
```

## 환경변수

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.4-mini
MODEL_INPUT_USD_PER_1M=0.75
MODEL_OUTPUT_USD_PER_1M=4.50
DEFAULT_STUDENT_CREDIT_LIMIT=30000
CREDIT_KRW_VALUE=0.1
USD_KRW=1500
MAX_OUTPUT_TOKENS=800
MAX_ESTIMATED_INPUT_TOKENS=12000
ALLOW_DEMO_WITHOUT_OPENAI=false
```

Railway Postgres를 붙이면 보통 `DATABASE_URL`이 자동으로 제공됩니다.

## Railway 설정 파일

`railway.toml`에서 다음을 지정합니다.

```toml
[deploy]
startCommand = "npm start"
healthcheckPath = "/api/health"
```

## 보안

- `OPENAI_API_KEY`는 프론트엔드에 넣지 않습니다.
- 모든 API 호출은 Express 서버를 거칩니다.
- 학생 식별자는 실명이 아니라 수업용 코드로 둡니다.
- 실제 학생의 성적, 상담 기록, 건강 정보, 가족 사정은 입력하지 않도록 안내합니다.

## 운영 팁

- 수업 전 `USD_KRW`와 모델 단가를 확인합니다.
- 학생 1인당 30,000 credits를 넘지 않게 합니다.
- 학급 전체 비용은 Railway 비용과 OpenAI 비용을 나누어 봅니다.
- Railway 자체 usage limit도 별도로 설정합니다.
