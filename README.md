# 가상 퍼소나 좌담회 실험실 — Railway 배포형

학생이 퍼소나를 만들고, 전문가 좌담회/면접/델파이/포커스 집단 인터뷰를 진행하며 회의록·요약본·보고서를 남기는 수업용 앱입니다.

## 핵심 기능

- 학생용 단일 앱
- 퍼소나 생성: 역할, 대표 경험/지식, 가치, 판단 규칙, 한계
- 공동 대화장: 모든 퍼소나가 같은 회의장을 듣는 라운드 생성
- 퍼소나별 대화창: 특정 퍼소나와 깊게 면접
- 회의 종류: 전문가 좌담회, 전문가 면접, 델파이 라이트, FGI, 이해관계자 반응 테스트, 광고/소비자 반응 테스트, 분류 타당성 감사
- 회의록 유지, 요약본 생성, 학생 보고서 틀 생성
- 사용자별 크레딧 한도: 기본 30,000 credits
- Railway 배포 가능

## 로컬 실행

```bash
npm start
```

브라우저에서 `http://localhost:3000`을 엽니다.

`OPENAI_API_KEY`가 없으면 모의 응답 모드로 동작합니다.

## Railway 환경변수

| 변수 | 기본값 | 설명 |
|---|---:|---|
| `OPENAI_API_KEY` | 없음 | OpenAI API 키. 없으면 mock mode |
| `AI_MODEL` | `gpt-5.4-mini` | 사용할 모델 |
| `MAX_CREDITS_PER_USER` | `30000` | 학생 1인당 내부 크레딧 한도 |
| `CREDIT_WEIGHTED_TOKENS_PER_CREDIT` | `10` | 1 credit이 나타내는 weighted token 수 |
| `OUTPUT_TOKEN_WEIGHT` | `6` | 출력 토큰 가중치. OpenAI 주요 모델의 출력 단가가 입력의 약 6배인 점 반영 |
| `MAX_OUTPUT_TOKENS` | `700` | 기본 출력 길이 제한 |
| `MAX_OUTPUT_TOKENS_HARD` | `1200` | 하드 출력 길이 제한 |
| `ACCESS_CODES` | 빈 값 | 쉼표로 구분한 허용 코드 목록 |
| `ALLOW_OPEN_ACCESS` | `true` | true면 임의 코드 사용 가능. 수업 운영 시 false 권장 |
| `DATA_DIR` | `./data` | 사용량 기록 저장 위치. Railway Volume 사용 시 `/data` 권장 |

## 권장 배포 설정

수업 운영 시 다음을 권합니다.

```bash
AI_MODEL=gpt-5.5
MAX_CREDITS_PER_USER=30000
CREDIT_WEIGHTED_TOKENS_PER_CREDIT=10
OUTPUT_TOKEN_WEIGHT=6
ALLOW_OPEN_ACCESS=false
ACCESS_CODES=class01-s01,class01-s02,class01-s03
DATA_DIR=/data
```

Railway Volume을 `/data`에 연결하면 사용량 기록이 재시작 후에도 유지됩니다. Volume이 없으면 재시작 시 `data/usage-store.json`이 사라질 수 있습니다.

## 크레딧 계산

앱 내부 크레딧은 실제 원화가 아니라 사용량 제어 단위입니다.

```text
weighted_tokens = input_tokens + OUTPUT_TOKEN_WEIGHT × output_tokens
credits = ceil(weighted_tokens / CREDIT_WEIGHTED_TOKENS_PER_CREDIT)
```

기본값에서는 `1 credit ≈ 10 weighted tokens`입니다. 30,000 credits는 약 300,000 weighted tokens입니다.

## 수업상 주의

이 앱은 실제 전문가 조사, 델파이 조사, FGI, 소비자 테스트를 대체하지 않습니다. 실제 사람을 만나기 전 관점과 질문의 빈틈을 찾는 예비 시뮬레이터입니다.

실제 학생의 이름, 성적, 건강정보, 가족 사정, 상담 내용 등은 입력하지 않도록 안내해야 합니다.
