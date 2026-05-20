import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'usage-store.json');

const CONFIG = {
  model: process.env.AI_MODEL || 'gpt-5.4-mini',
  maxCreditsPerUser: Number(process.env.MAX_CREDITS_PER_USER || 30000),
  weightedTokensPerCredit: Number(process.env.CREDIT_WEIGHTED_TOKENS_PER_CREDIT || 10),
  outputTokenWeight: Number(process.env.OUTPUT_TOKEN_WEIGHT || 6),
  maxOutputTokensDefault: Number(process.env.MAX_OUTPUT_TOKENS || 700),
  maxOutputTokensHard: Number(process.env.MAX_OUTPUT_TOKENS_HARD || 1200),
  openAccess: String(process.env.ALLOW_OPEN_ACCESS || 'true').toLowerCase() === 'true',
  accessCodes: (process.env.ACCESS_CODES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  mockMode: String(process.env.MOCK_MODE || '').toLowerCase() === 'true' || !process.env.OPENAI_API_KEY,
};

fs.mkdirSync(DATA_DIR, { recursive: true });

function nowIso() {
  return new Date().toISOString();
}

function safeCode(code) {
  return String(code || '').trim().replace(/[^a-zA-Z0-9가-힣._@-]/g, '').slice(0, 80);
}

function codeHash(code) {
  return crypto.createHash('sha256').update(code).digest('hex').slice(0, 16);
}

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return { version: 1, sessions: {} };
  }
}

function saveStore(store) {
  const temp = `${STORE_PATH}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2));
  fs.renameSync(temp, STORE_PATH);
}

function getSession(accessCode) {
  const code = safeCode(accessCode);
  if (!code) throw new ApiError(400, '접속 코드를 입력하세요.');
  if (!CONFIG.openAccess && !CONFIG.accessCodes.includes(code)) {
    throw new ApiError(403, '허용된 접속 코드가 아닙니다.');
  }
  const store = loadStore();
  const id = codeHash(code);
  if (!store.sessions[id]) {
    store.sessions[id] = {
      id,
      label: code.slice(0, 4) + '…',
      createdAt: nowIso(),
      lastSeenAt: nowIso(),
      creditsUsed: 0,
      callCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      logs: [],
    };
  } else {
    store.sessions[id].lastSeenAt = nowIso();
  }
  saveStore(store);
  return { store, id, session: store.sessions[id] };
}

function publicSession(session) {
  return {
    id: session.id,
    label: session.label,
    creditsUsed: session.creditsUsed || 0,
    creditsRemaining: Math.max(0, CONFIG.maxCreditsPerUser - (session.creditsUsed || 0)),
    maxCredits: CONFIG.maxCreditsPerUser,
    callCount: session.callCount || 0,
    inputTokens: session.inputTokens || 0,
    outputTokens: session.outputTokens || 0,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
  };
}

function estimateTokens(text) {
  const s = String(text || '');
  // Korean text often tokenizes close to character-level. This is conservative enough for quota preflight.
  return Math.max(1, Math.ceil(s.length / 1.4));
}

function creditsFromUsage(inputTokens, outputTokens) {
  const weighted = inputTokens + CONFIG.outputTokenWeight * outputTokens;
  return Math.max(1, Math.ceil(weighted / CONFIG.weightedTokensPerCredit));
}

function extractUsage(raw) {
  const u = raw?.usage || {};
  const input = Number(u.input_tokens || u.prompt_tokens || 0);
  const output = Number(u.output_tokens || u.completion_tokens || 0);
  return { input_tokens: input, output_tokens: output, total_tokens: input + output };
}

function trimText(text, maxChars) {
  const s = String(text || '');
  if (s.length <= maxChars) return s;
  return '…앞부분 생략…\n' + s.slice(-maxChars);
}

function personaBlock(personas = []) {
  return personas.map((p, i) => {
    return `퍼소나 ${i + 1}
- 이름: ${p.name || `퍼소나 ${i + 1}`}
- 사회적 위치/역할: ${p.role || '미지정'}
- 대표 경험/지식: ${p.knowledge || '미지정'}
- 핵심 가치: ${p.values || '미지정'}
- 판단 규칙: ${p.rules || '미지정'}
- 말하기 규칙/한계: ${p.limits || '확실하지 않은 것은 추정 또는 검증 필요로 표시한다.'}`;
  }).join('\n\n');
}

function meetingRules(type) {
  const rules = {
    panel: '전문가 좌담회: 각 퍼소나가 자기 지식·가치·판단 규칙에 따라 발언하고, 서로의 관점 차이를 드러낸다.',
    interview: '전문가 면접: 선택된 퍼소나가 질문에 깊게 답하고, 근거·추정·가치판단을 구분한다.',
    delphi: '델파이 라이트: 1차 의견, 차이점 확인, 수정 의견, 잠정 합의/불합의를 정리한다.',
    focus: '포커스 집단 인터뷰: 각 퍼소나가 사용자·소비자·이해관계자처럼 반응하고, 불편·매력·오해 지점을 말한다.',
    stakeholder: '이해관계자 반응 테스트: 정책/홍보/제도 변화에 대한 집단별 기대·우려·반발 가능성을 말한다.',
    consumer: '광고·소비자 반응 테스트: 메시지 이해도, 신뢰도, 거부감, 행동 유도 가능성을 검토한다.',
    audit: '분류 타당성 감사: 정확도, 신뢰도, 진실성, 타당도, 사회적 정합성을 구분해 평가한다.',
  };
  return rules[type] || rules.panel;
}

function buildPrompt(body) {
  const kind = body.kind || 'panel';
  const meeting = body.meeting || {};
  const personas = Array.isArray(body.personas) ? body.personas.slice(0, 6) : [];
  const transcript = trimText(body.transcript || '', 12000);
  const contextSummary = trimText(body.contextSummary || '', 4000);
  const message = trimText(body.message || '', 4000);
  const targetPersona = personas.find((p) => p.id === body.personaId) || personas[0] || {};

  const common = `너는 수업용 가상 퍼소나 좌담회 앱의 응답 엔진이다.
목표는 정답을 대신 내는 것이 아니라, 퍼소나별 대표 경험·관점·지식·가치관이 특정 주제 판단을 어떻게 다르게 만드는지 보여주는 것이다.

안전 규칙:
- 실제 학생 개인정보, 건강정보, 성적, 가족 사정이 나오면 구체 판단을 피하고 익명화·가상화하라고 안내한다.
- 퍼소나는 실제 전문가가 아니며, 특정 전문적 관점의 시뮬레이션임을 전제로 말한다.
- 없는 사실을 지어내지 않는다. 자료가 부족하면 "검증 필요"라고 표시한다.
- 사실, 추정, 가치 판단을 구분한다.
- 결론은 단정하지 말고 인간 최종 판단 지점을 남긴다.

회의 정보:
- 제목: ${meeting.title || '미지정'}
- 주제: ${meeting.topic || '미지정'}
- 회의 종류: ${meeting.typeLabel || meeting.type || '전문가 좌담회'}
- 일시: ${meeting.datetime || nowIso()}
- 장소: ${meeting.place || '온라인'}
- 운영 포맷: ${meetingRules(meeting.type)}

퍼소나 목록:
${personaBlock(personas) || '퍼소나가 아직 없다.'}

현재 요약본:
${contextSummary || '아직 요약본 없음'}

최근 회의록:
${transcript || '아직 회의록 없음'}

사용자/진행자 입력:
${message || '다음 라운드를 진행하라.'}`;

  if (kind === 'persona') {
    return `${common}

이번 응답자는 다음 퍼소나 한 명이다.
- 이름: ${targetPersona.name || '선택 퍼소나'}
- 역할: ${targetPersona.role || '미지정'}
- 대표 경험/지식: ${targetPersona.knowledge || '미지정'}
- 핵심 가치: ${targetPersona.values || '미지정'}
- 판단 규칙: ${targetPersona.rules || '미지정'}

출력 형식:
[${targetPersona.name || '선택 퍼소나'}]
1. 핵심 답변: 4~6문장
2. 근거/사용한 지식: 2~4개
3. 검증 필요 주장: 1~3개
4. 다른 퍼소나에게 묻고 싶은 질문: 1개`;
  }

  if (kind === 'summary') {
    return `${common}

회의록을 바탕으로 요약본을 만들어라.
출력 형식:
1. 회의 개요
2. 퍼소나별 핵심 입장
3. 합의된 내용
4. 불일치/쟁점
5. 검증 필요 주장
6. 다음 질문
7. 인간이 최종 판단해야 할 부분`;
  }

  if (kind === 'report') {
    return `${common}

학생 제출용 보고서 초안을 만들어라. 단, 학생이 직접 채워야 하는 성찰 항목은 [학생 작성]으로 남겨라.
출력 형식:
1. 회의 정보
2. 내가 만든 퍼소나와 지식 카드
3. 회의 결과 요약
4. 가장 영향력 있었던 지식/가치
5. 분류 또는 판단의 타당성 검토
6. 의미 있게 살아남은 지식 형태
7. 사라지거나 약해진 지식
8. 최종 성찰: [학생 작성]`;
  }

  return `${common}

공동 대화장 라운드를 진행하라. 모든 퍼소나는 같은 회의장을 듣고 있다고 가정한다.
각 퍼소나는 자기 역할·지식·가치·판단 규칙을 유지하되, 앞선 회의록에 반응하라.

출력 형식:
[라운드 응답]
- 각 퍼소나 이름을 대괄호로 표시하고 3~5문장씩 발언한다.
- 마지막에 [진행자 정리]를 붙여 쟁점, 합의, 불일치, 검증 필요를 짧게 정리한다.`;
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'JSON 형식이 올바르지 않습니다.');
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
  }[ext] || 'application/octet-stream';
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType(filePath) });
      res.end(data);
    }
  });
}

async function callOpenAI(prompt, maxOutputTokens) {
  if (CONFIG.mockMode) {
    const usage = {
      input_tokens: estimateTokens(prompt),
      output_tokens: Math.min(220, maxOutputTokens || 220),
      total_tokens: estimateTokens(prompt) + Math.min(220, maxOutputTokens || 220),
    };
    return {
      text: `[모의 응답]\n이 배포판은 OPENAI_API_KEY가 없어서 모의 응답을 반환했습니다. 실제 Railway 배포에서는 환경변수 OPENAI_API_KEY를 설정하세요.\n\n[퍼소나 응답]\n- 설정된 지식과 가치에 따라 쟁점을 분리합니다.\n- 사실, 추정, 가치판단을 구분해야 합니다.\n- 최종 판단은 인간 검토가 필요합니다.`,
      usage,
      raw: null,
    };
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CONFIG.model,
      input: prompt,
      max_output_tokens: maxOutputTokens,
      store: false,
    }),
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = raw?.error?.message || `OpenAI API 오류: ${response.status}`;
    throw new ApiError(502, msg);
  }

  let text = raw.output_text;
  if (!text && Array.isArray(raw.output)) {
    text = raw.output
      .flatMap((item) => item.content || [])
      .map((c) => c.text || '')
      .filter(Boolean)
      .join('\n');
  }

  return { text: text || '(응답 텍스트 없음)', usage: extractUsage(raw), raw };
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, time: nowIso(), model: CONFIG.model, mockMode: CONFIG.mockMode });
  }

  if (req.method === 'GET' && url.pathname === '/api/config') {
    return sendJson(res, 200, {
      model: CONFIG.model,
      maxCreditsPerUser: CONFIG.maxCreditsPerUser,
      weightedTokensPerCredit: CONFIG.weightedTokensPerCredit,
      outputTokenWeight: CONFIG.outputTokenWeight,
      openAccess: CONFIG.openAccess,
      mockMode: CONFIG.mockMode,
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/session') {
    const body = await readJson(req);
    const { session } = getSession(body.accessCode);
    return sendJson(res, 200, { ok: true, session: publicSession(session) });
  }

  if (req.method === 'POST' && url.pathname === '/api/respond') {
    const body = await readJson(req);
    const { session } = getSession(body.accessCode);
    const remaining = CONFIG.maxCreditsPerUser - (session.creditsUsed || 0);
    if (remaining <= 0) throw new ApiError(402, '이 접속 코드의 크레딧을 모두 사용했습니다.');

    const prompt = buildPrompt(body);
    const estimatedInput = estimateTokens(prompt);
    const requestedMax = Math.min(
      CONFIG.maxOutputTokensHard,
      Math.max(120, Number(body.maxOutputTokens || CONFIG.maxOutputTokensDefault))
    );

    const remainingWeighted = remaining * CONFIG.weightedTokensPerCredit;
    const maxByQuota = Math.floor((remainingWeighted - estimatedInput) / CONFIG.outputTokenWeight);
    if (maxByQuota < 80) {
      throw new ApiError(402, '남은 크레딧으로는 이 요청을 처리하기 어렵습니다. 회의록을 요약하거나 발언 길이를 줄이세요.');
    }
    const maxOutputTokens = Math.max(80, Math.min(requestedMax, maxByQuota));

    const result = await callOpenAI(prompt, maxOutputTokens);
    const usage = result.usage || { input_tokens: estimatedInput, output_tokens: estimateTokens(result.text) };
    const charged = CONFIG.mockMode ? 0 : creditsFromUsage(usage.input_tokens, usage.output_tokens);

    const store = loadStore();
    const id = session.id;
    const live = store.sessions[id] || session;
    live.creditsUsed = Math.min(CONFIG.maxCreditsPerUser, (live.creditsUsed || 0) + charged);
    live.callCount = (live.callCount || 0) + 1;
    live.inputTokens = (live.inputTokens || 0) + usage.input_tokens;
    live.outputTokens = (live.outputTokens || 0) + usage.output_tokens;
    live.lastSeenAt = nowIso();
    live.logs = Array.isArray(live.logs) ? live.logs.slice(-100) : [];
    live.logs.push({
      at: nowIso(),
      kind: body.kind || 'panel',
      model: CONFIG.model,
      usage,
      creditsCharged: charged,
      meetingTitle: body.meeting?.title || '',
    });
    store.sessions[id] = live;
    saveStore(store);

    return sendJson(res, 200, {
      ok: true,
      text: result.text,
      usage,
      creditsCharged: charged,
      maxOutputTokens,
      session: publicSession(live),
      mockMode: CONFIG.mockMode,
    });
  }

  throw new ApiError(404, 'API 경로를 찾을 수 없습니다.');
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      await handleApi(req, res);
    } else {
      serveStatic(req, res);
    }
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    sendJson(res, status, { ok: false, error: err.message || '서버 오류' });
  }
});

server.listen(PORT, () => {
  console.log(`Persona Panel Lab listening on http://localhost:${PORT}`);
  console.log(`Model: ${CONFIG.model}; mockMode=${CONFIG.mockMode}; maxCredits=${CONFIG.maxCreditsPerUser}`);
});
