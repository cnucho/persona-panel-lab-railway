# Railway 배포 절차

## 1. GitHub 저장소 준비

이 프로젝트를 GitHub에 올립니다.

```bash
git remote add origin https://github.com/<계정명>/persona-panel-lab-railway.git
git push -u origin main
```

## 2. Railway에서 배포

1. Railway에서 New Project
2. Deploy from GitHub repo
3. 이 저장소 선택
4. 환경변수 설정
5. Deploy

## 3. 필수 환경변수

```bash
OPENAI_API_KEY=sk-...
AI_MODEL=gpt-5.5
MAX_CREDITS_PER_USER=30000
CREDIT_WEIGHTED_TOKENS_PER_CREDIT=10
OUTPUT_TOKEN_WEIGHT=6
ALLOW_OPEN_ACCESS=false
ACCESS_CODES=class01-s01,class01-s02,class01-s03
DATA_DIR=/data
```

## 4. 사용량 통제

Railway 자체의 프로젝트 Usage Limit도 설정합니다. 앱 내부 크레딧은 API 비용을 제어하고, Railway Usage Limit은 서버 비용을 제어합니다.

## 5. 저장소 영속성

사용자별 크레딧 기록은 `usage-store.json`에 저장됩니다. Railway에서 Volume을 `/data`에 연결해야 안정적으로 유지됩니다.

Volume 없이도 동작하지만 재배포/재시작 때 사용량 기록이 초기화될 수 있습니다.
