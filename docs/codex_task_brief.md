# Codex 작업지시서

## 목표

현재 정적+Node MVP를 수업 운영 가능한 Railway 앱으로 안정화한다.

## 현재 구현

- `server.js`: 무의존성 Node HTTP 서버
- `public/index.html`: 학생용 단일 SPA
- `/api/session`: 접속 코드별 세션/크레딧 조회
- `/api/respond`: OpenAI Responses API 호출, 크레딧 차감
- `data/usage-store.json`: 사용자별 사용량 기록

## 다음 개선 과제

1. 사용량 저장소를 JSON 파일에서 Postgres로 교체
2. 접속 코드 발급 CSV import 기능 추가
3. 회의록 길이 자동 요약/압축 기능 강화
4. 퍼소나 일관성 검사 기능 추가
5. 수업 제출용 PDF/Markdown export 개선
6. 관리자 화면 없이도 코드별 사용량을 CSV로 다운로드하는 엔드포인트 추가
7. 보안: rate limit, request size limit, 개인정보 금지 안내 강화

## 유지해야 할 원칙

- 학생용 단일 앱을 유지한다.
- 교사용 대시보드는 만들지 않는다. 필요 시 CSV export만 둔다.
- 퍼소나는 실제 전문가가 아니라 전문적 관점 시뮬레이션임을 명시한다.
- 실제 학생 개인정보 입력을 막는 안내를 유지한다.
- 크레딧 한도는 서버에서 강제한다.
