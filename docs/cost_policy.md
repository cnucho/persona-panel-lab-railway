# 비용·크레딧 정책

## 기본 설계

- 학생 1인당 한도: 30,000 credits
- 기본 환산: 1 credit = 10 weighted tokens
- weighted tokens = input tokens + 6 × output tokens

이렇게 하면 30,000 credits는 약 300,000 weighted tokens입니다.

## 모델별 대략 비용

공식 가격은 수시로 바뀔 수 있습니다. 배포 전에 OpenAI 가격표를 다시 확인하세요.

예시로 gpt-5.5가 input $5/1M, output $30/1M라면 출력 가중치 6은 단가 비율과 맞습니다.
이 경우 300,000 weighted tokens는 약 $1.50입니다. 환율, 예비 버퍼, Railway 비용, 실패 호출 등을 고려하면 학생 1인당 약 2천~3천원 예산으로 잡을 수 있습니다.

mini 모델을 쓰면 훨씬 저렴하고, pro 모델을 쓰면 이보다 훨씬 비쌉니다.

## 왜 output weight 6인가

텍스트 생성 비용은 출력 토큰이 입력 토큰보다 비싼 경우가 많습니다. 주요 모델에서 출력 단가가 입력 단가의 약 6배인 구조를 반영해 output weight를 6으로 잡았습니다.

## 과금 폭주 방지

- 퍼소나 수 기본 4명
- 라운드 수 제한
- 출력 토큰 제한
- 회의록 전체 대신 요약본 사용 권장
- 사용자별 크레딧 초과 시 API 호출 차단
- Railway 자체 Usage Limit 병행
