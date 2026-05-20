# 가상 퍼소나 좌담회 실험실 — Railway/API 버전

학생이 퍼소나를 만들고, 공동 대화장 또는 퍼소나별 대화창에서 전문가 좌담회·면접·델파이 라이트·포커스 그룹을 실행하는 최소 웹앱입니다.

## 핵심 설계

- 학생용 단일 앱입니다. 교사용 대시보드는 없습니다.
- 모든 참가자가 듣는 **공동 대화장**이 기본입니다.
- 퍼소나별 **개별 대화창**도 가능합니다.
- 회의 제목, 주제, 시간, 장소가 기록됩니다.
- 회의록이 저장되고 요약본을 생성할 수 있습니다.
- 학생별 내부 크레딧 한도를 둡니다. 기본값은 `30,000 credits`입니다.
- 기본 모델은 `gpt-5.4-mini`, 요약 모델은 `gpt-5.4-nano`입니다.

## 크레딧 구조

기본 설정은 다음입니다.

```env
CREDIT_BUDGET_PER_USER=30000
KRW_PER_CREDIT=0.1
USD_TO_KRW=1400
```

즉 `30,000 credits = 약 3,000원`으로 계산합니다. 실제 API 과금은 모델 가격과 입력/출력 토큰 수에 따라 달라집니다. 앱은 모델별 토큰 가격표를 기준으로 사용량을 추정해 차감합니다.

## 로컬 실행

```bash
npm install
cp .env.example .env
# .env에 OPENAI_API_KEY 입력
npm start
```

브라우저에서 `http://localhost:3000`을 엽니다.

`OPENAI_API_KEY`가 없으면 데모 응답으로 실행됩니다.

## Railway 배포

1. GitHub에 이 저장소를 올립니다.
2. Railway에서 New Project → Deploy from GitHub repo를 선택합니다.
3. Variables에 아래 값을 넣습니다.

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
CLASSROOM_SHARED_SECRET=change-this
```

4. 장기간 기록을 유지하려면 Railway Postgres를 붙이고 `DATABASE_URL`을 서비스 변수로 연결합니다.
5. Railway Workspace Usage에서 Compute hard limit을 설정합니다.

## 수업 운영 권장값

- 퍼소나 수: 3~4명
- 라운드 수: 4~6회
- 발언 길이: 짧게
- 공동 대화장 중심
- 요약본은 마지막 1회만 생성
- 비싼 모델은 전체 학생용 기본 모델로 쓰지 않기

## 회의 종류

- 전문가 좌담회
- 전문가 면접
- 델파이 라이트
- 포커스 집단 인터뷰
- 이해관계자 반응 테스트
- 광고·소비자 반응 테스트
- 분류 타당성 감사

## 교육적 주의

이 앱은 실제 전문가 조사, 실제 델파이 조사, 실제 소비자 테스트를 대체하지 않습니다. 학생들이 관점·지식·가치·분류 기준이 판단을 어떻게 바꾸는지 실험하기 위한 시뮬레이터입니다.
