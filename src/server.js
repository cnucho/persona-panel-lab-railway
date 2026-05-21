import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import pg from 'pg';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cfg = {
  port: Number(process.env.PORT || 3000),
  defaultModel: process.env.DEFAULT_MODEL || 'gpt-5.4-mini',
  summaryModel: process.env.SUMMARY_MODEL || 'gpt-5.4-nano',
  editorModel: process.env.EDITOR_MODEL || process.env.SUMMARY_MODEL || 'gpt-5.4-nano',
  premiumModel: process.env.PREMIUM_MODEL || process.env.DEFAULT_MODEL || 'gpt-5.4-mini',
  creditBudget: Number(process.env.CREDIT_BUDGET_PER_USER || 30000),
  creditsPerUsdCost: Number(process.env.CREDITS_PER_USD_COST || 14000),
  purchaseKrwPerCredit: Number(process.env.PURCHASE_KRW_PER_CREDIT || 1),
  maxPersonas: Number(process.env.MAX_PERSONAS || 5),
  maxRounds: Number(process.env.MAX_ROUNDS_PER_SESSION || 8),
  maxMessages: Number(process.env.MAX_MESSAGES_PER_SESSION || 100),
  maxOutputTokens: Number(process.env.MAX_OUTPUT_TOKENS || 700),
  requireAccessCode: String(process.env.REQUIRE_ACCESS_CODE || 'false') === 'true',
  accessCodes: new Set(String(process.env.ACCESS_CODES || '').split(',').map((s) => s.trim()).filter(Boolean)),
  classroomSecret: process.env.CLASSROOM_SHARED_SECRET || 'persona-panel-lab-secret',
  databaseUrl: process.env.DATABASE_URL || '',
  openaiKey: process.env.OPENAI_API_KEY || '',
  centralAuthUrl: String(process.env.CENTRAL_AUTH_URL || '').trim().replace(/\/+$/, ''),
  centralAuthSecret: process.env.CENTRAL_AUTH_SECRET || process.env.AUTH_SERVICE_SECRET || '',
  sharedSessionCookie: process.env.SHARED_SESSION_COOKIE || 'shared_ai_session',
  appId: process.env.APP_ID || 'persona-panel-lab',
  appName: process.env.APP_NAME || 'Persona Panel Lab',
  appUrl: process.env.APP_URL || process.env.APP_PUBLIC_URL || '',
  appVisibility: process.env.APP_VISIBILITY || 'public',
  appUsageTier: process.env.APP_USAGE_TIER || process.env.APP_USAGE_CLASS || 'standard',
  appAllowedEmails: process.env.APP_ALLOWED_EMAILS || process.env.APP_PRIVATE_ALLOWED_EMAILS || '',
  adminEmails: new Set(String(process.env.ADMIN_EMAILS || 'skcho99@gmail.com').split(/[,;\s]+/).map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)),
  appCreditPolicies: process.env.APP_CREDIT_POLICIES || process.env.APP_CREDIT_POLICY || 'consumerinsight.kr=0,*=10',
  appCreditMarkup: Number(process.env.APP_CREDIT_MARKUP || 10),
  starterActualCostKrw: Number(process.env.STARTER_ACTUAL_COST_KRW || 3000)
};

// Estimated USD per 1M tokens. Override with env if your model pricing differs.
const MODEL_PRICING_USD_PER_1M_TOKENS = {
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-5': { input: 1.25, output: 10.0 },
  'gpt-5-mini': { input: 0.25, output: 2.0 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-5.4-mini': { input: 0.75, output: 4.50 },
  'gpt-5.4-nano': { input: 0.20, output: 1.25 }
};

const DEPTH_PRESETS = {
  economy: {
    label: '경제형',
    modelRole: 'default',
    maxOutputTokens: Math.min(420, cfg.maxOutputTokens),
    style: '짧고 선명하게 답한다. 핵심 주장, 근거, 검증 필요 항목만 남긴다.',
    maxContextMessages: 8
  },
  balanced: {
    label: '균형형',
    modelRole: 'default',
    maxOutputTokens: Math.min(700, cfg.maxOutputTokens),
    style: '전문가다운 판단 과정을 드러내되 장황하지 않게 답한다.',
    maxContextMessages: 14
  },
  deep: {
    label: '심화형',
    modelRole: 'premium',
    maxOutputTokens: Math.min(1100, Math.max(cfg.maxOutputTokens, 900)),
    style: '전문 지식, 이해관계, 가치 충돌, 반론, 불확실성을 충분히 분해한다.',
    maxContextMessages: 20
  }
};

const MEETING_TYPES = {
  expert_panel: {
    label: '전문가 좌담회',
    format: '각 퍼소나가 자신의 전문 영역과 가치 기준에 따라 발언하고, 서로의 관점 차이를 명시한다.'
  },
  expert_interview: {
    label: '전문가 심층면접',
    format: '선택된 퍼소나가 질문에 깊게 답하고, 근거와 추정, 가치 판단을 구분한다.'
  },
  delphi_lite: {
    label: '델파이 라이트',
    format: '1차 의견, 차이 확인, 수정 의견, 잠정 합의와 불합의 조건을 정리한다.'
  },
  focus_group: {
    label: '포커스 그룹',
    format: '참여자 반응, 불편, 매력, 오해, 사용 조건을 집단 토론처럼 드러낸다.'
  },
  stakeholder_test: {
    label: '이해관계자 반응 테스트',
    format: '정책, 제품, 메시지가 이해관계자별로 어떤 기대, 우려, 반발을 만들지 검토한다.'
  },
  ad_reaction: {
    label: '광고/서비스 반응 테스트',
    format: '메시지 이해, 신뢰, 매력, 거부감, 행동 의도 가능성을 점검한다.'
  },
  classification_audit: {
    label: '분류 타당성 감사',
    format: '분류 체계의 정확도, 설명 가능성, 배제 효과, 사회적 타당성, 이의제기 가능성을 검토한다.'
  }
};

const MEETING_TYPE_DETAILS = {
  expert_panel: {
    label: '전문가 좌담회',
    purpose: '여러 퍼소나가 같은 주제에 대해 각자의 지식과 관점으로 의견을 낸다.',
    outputs: ['퍼소나별 핵심 의견', '합의점', '불일치점', '검증 필요 주장', '회의록 기록용 결론']
  },
  expert_interview: {
    label: '전문가 면접',
    purpose: '한 퍼소나를 깊게 면접한다.',
    outputs: ['퍼소나의 핵심 답변', '사용한 지식', '판단 기준', '한계', '추가 질문']
  },
  delphi_lite: {
    label: '델파이 라이트',
    purpose: '여러 퍼소나가 독립 평가자처럼 의견을 내고 차이를 비교한다.',
    outputs: ['퍼소나별 판단', '점수 또는 등급', '불일치 이유', '합의 가능 조건', '최종 유보 사항'],
    caution: '실제 델파이 조사라고 표현하지 말고 반드시 “델파이 라이트 시뮬레이션”이라고 표시한다.'
  },
  focus_group: {
    label: '포커스 집단 인터뷰',
    purpose: '가상 이해관계자 또는 소비자 집단의 반응을 탐색한다.',
    outputs: ['첫인상', '공통 반응', '갈리는 반응', '불신 요인', '개선 제안'],
    caution: '실제 소비자 조사 결과처럼 표현하지 않는다.'
  },
  stakeholder_test: {
    label: '이해관계자 반응 테스트',
    purpose: '정책, 홍보안, 학교 규칙, AI 도입안이 각 이해관계자에게 어떻게 받아들여질지 탐색한다.',
    outputs: ['이해관계자별 반응', '이익', '우려', '갈등 지점', '수용 조건', '설명 방식 개선안']
  },
  ad_reaction: {
    label: '광고·소비자 반응 테스트',
    purpose: '광고 문구, 캠페인 메시지, 홍보 글이 어떤 반응을 만들지 탐색한다.',
    outputs: ['매력 요소', '거부감', '신뢰감', '기억에 남는 표현', '오해 가능성', '수정 제안'],
    caution: '실제 시장조사 결과처럼 표현하지 않는다.'
  },
  classification_audit: {
    label: '분류 타당성 감사',
    purpose: 'AI 또는 사람이 만든 분류안이 사회적으로 타당한지 검토한다.',
    outputs: ['정확도 검토', '신뢰도 검토', '진실성 검토', '타당도 검토', '사회적 정합성 검토', '이의제기 가능성 검토', '검증 가능한 주장', '검증 불가능한 추정', '가치 판단', '수정된 분류안']
  }
};

function meetingTypeDetails(key) {
  return MEETING_TYPE_DETAILS[key] || MEETING_TYPE_DETAILS.expert_panel;
}

function meetingTypePrompt(mt) {
  const lines = [
    `회의 종류: ${mt.label}`,
    `목적: ${mt.purpose}`,
    '출력 항목:',
    ...mt.outputs.map((item) => `- ${item}`)
  ];
  if (mt.caution) lines.push(`주의: ${mt.caution}`);
  return lines.join('\n');
}

const PERSONA_PROMPT_RULES = [
  '퍼소나는 단순 캐릭터가 아니라 특정 지식, 경험, 가치, 판단 규칙을 가진 가상 관점 모델이다.',
  '실제 인간 전문가를 대체한다고 말하지 않는다.',
  '실제 소비자 조사 결과처럼 말하지 않는다.',
  '자료 없이 사실을 만들지 않는다.',
  '사실, 추정, 가치 판단을 구분한다.',
  '특정 집단을 고정관념으로 단정하지 않는다.',
  '민감한 개인정보를 요구하지 않는다.',
  '퍼소나의 지식과 한계 안에서만 답한다.',
  '모르는 것은 모른다고 하거나 검증 필요로 표시한다.'
];

function personaRulesPrompt() {
  return PERSONA_PROMPT_RULES.map((rule, index) => `${index + 1}. ${rule}`).join('\n');
}

const PERSONA_THREAD_RULES = [
  '퍼소나별 개별 대화창에서는 특정 퍼소나 한 명만 응답한다.',
  '해당 퍼소나의 1인칭 또는 명확한 역할 관점으로만 답한다.',
  '다른 퍼소나 이름으로 발언하지 않는다.',
  '자신의 지식, 가치, 판단 규칙을 유지한다.',
  '사실, 추정, 가치 판단을 구분한다.',
  '검증 필요 주장을 표시한다.'
];

function personaThreadRulesPrompt() {
  return PERSONA_THREAD_RULES.map((rule, index) => `${index + 1}. ${rule}`).join('\n');
}

const SUMMARY_SECTIONS = [
  '핵심 논의 요약',
  '퍼소나별 주요 주장',
  '합의점',
  '불일치점',
  '검증 가능한 사실',
  '확인 불가능한 추정',
  '가치 판단',
  '검증 필요 주장',
  '인간이 최종 판단해야 할 부분',
  '학생 성찰 질문'
];

function summarySectionsPrompt() {
  return SUMMARY_SECTIONS.map((section, index) => `${index + 1}. ${section}`).join('\n');
}

const LANGUAGE_OPTIONS = {
  ko: { label: '한국어', instruction: '모든 전문가 발언과 요약을 자연스러운 한국어로 작성한다.' },
  en: { label: 'English', instruction: 'Write all expert responses and summaries in natural English.' },
  de: { label: 'Deutsch', instruction: 'Schreibe alle Expertenantworten und Zusammenfassungen in natürlichem Deutsch.' },
  kk: { label: 'Қазақша', instruction: 'Сарапшылардың барлық жауаптары мен түйіндемелерін табиғи қазақ тілінде жаз.' },
  am: { label: 'አማርኛ', instruction: 'የሙያተኞችን ምላሾች እና ማጠቃለያዎች በተፈጥሯዊ አማርኛ ጻፍ።' },
  ja: { label: '日本語', instruction: '専門家の発言と要約を自然な日本語で書く。' },
  zh: { label: '中文', instruction: '所有专家发言和摘要都使用自然的中文。' },
  es: { label: 'Español', instruction: 'Escribe todas las respuestas y resúmenes de expertos en español natural.' }
};

const EXPORT_LABELS = {
  ko: { meetingType: '회의 종류', topic: '주제', place: '장소/상황', startedAt: '시작 시각', student: '학생', usedCredits: '사용 크레딧', personas: '퍼소나', name: '이름', role: '역할 / 사회적 위치', expertise: '전문성 / 대표 경험', knowledge: '사용할 지식', values: '중시 가치', rules: '판단 규칙', style: '말하기 방식', limits: '한계', transcript: '회의록', summary: '요약본', time: '시각', channel: '채널', speaker: '발언자', content: '내용', model: '사용 모델', input: '입력 토큰', output: '출력 토큰', credits: '차감 크레딧' },
  en: { meetingType: 'Meeting type', topic: 'Topic', place: 'Place/context', startedAt: 'Started at', student: 'Student', usedCredits: 'Credits used', personas: 'Personas', name: 'Name', role: 'Role / social position', expertise: 'Expertise / representative experience', knowledge: 'Knowledge to use', values: 'Values', rules: 'Judgment rules', style: 'Speaking style', limits: 'Limits', transcript: 'Transcript', summary: 'Summary', time: 'Time', channel: 'Channel', speaker: 'Speaker', content: 'Content', model: 'Model used', input: 'Input tokens', output: 'Output tokens', credits: 'Credits charged' },
  de: { meetingType: 'Sitzungsart', topic: 'Thema', place: 'Ort/Kontext', startedAt: 'Beginn', personas: 'Personas', role: 'Rolle', expertise: 'Fachgebiet und Erfahrung', knowledge: 'Wissen', values: 'Werte', rules: 'Beurteilungsregeln', style: 'Sprechweise', limits: 'Grenzen', transcript: 'Protokoll', time: 'Zeit', model: 'Modell', input: 'Eingabe', output: 'Ausgabe', credits: 'Abgezogene Credits' },
  kk: { meetingType: 'Кездесу түрі', topic: 'Тақырып', place: 'Орын/жағдай', startedAt: 'Басталу уақыты', personas: 'Персоналар', role: 'Рөлі', expertise: 'Сараптама және тәжірибе', knowledge: 'Білім', values: 'Құндылықтар', rules: 'Бағалау ережелері', style: 'Сөйлеу мәнері', limits: 'Шектеулер', transcript: 'Хаттама', time: 'Уақыт', model: 'Модель', input: 'Кіріс', output: 'Шығыс', credits: 'Шегерілген кредиттер' },
  am: { meetingType: 'የስብሰባ ዓይነት', topic: 'ርዕስ', place: 'ቦታ/አውድ', startedAt: 'የተጀመረበት ጊዜ', personas: 'ፐርሶናዎች', role: 'ሚና', expertise: 'ሙያ እና ተሞክሮ', knowledge: 'እውቀት', values: 'እሴቶች', rules: 'የፍርድ መመሪያዎች', style: 'የንግግር ዘይቤ', limits: 'ገደቦች', transcript: 'የስብሰባ መዝገብ', time: 'ጊዜ', model: 'ሞዴል', input: 'ግቤት', output: 'ውጤት', credits: 'የተቀነሱ ክሬዲቶች' },
  ja: { meetingType: '会議種別', topic: 'テーマ', place: '場所/状況', startedAt: '開始時刻', personas: 'ペルソナ', role: '役割', expertise: '専門領域と経験', knowledge: '知識', values: '価値観', rules: '判断規則', style: '話し方', limits: '限界', transcript: '議事録', time: '時刻', model: 'モデル', input: '入力', output: '出力', credits: '差し引きクレジット' },
  zh: { meetingType: '会议类型', topic: '主题', place: '地点/情境', startedAt: '开始时间', personas: '画像', role: '角色', expertise: '专业领域与经验', knowledge: '知识', values: '价值观', rules: '判断规则', style: '表达方式', limits: '限制', transcript: '会议记录', time: '时间', model: '模型', input: '输入', output: '输出', credits: '扣除积分' },
  es: { meetingType: 'Tipo de reunión', topic: 'Tema', place: 'Lugar/contexto', startedAt: 'Inicio', personas: 'Personas', role: 'Rol', expertise: 'Experiencia y especialidad', knowledge: 'Conocimiento', values: 'Valores', rules: 'Reglas de juicio', style: 'Estilo de habla', limits: 'Límites', transcript: 'Transcripción', time: 'Hora', model: 'Modelo', input: 'Entrada', output: 'Salida', credits: 'Créditos descontados' }
};

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function hash(input) {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 24);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

function validEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function parseCookies(req) {
  return String(req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf('=');
      if (index > 0) cookies[decodeURIComponent(part.slice(0, index))] = decodeURIComponent(part.slice(index + 1));
      return cookies;
    }, {});
}

function sharedSessionIdFromRequest(req, body = {}) {
  const cookies = parseCookies(req);
  return String(
    body.sessionId ||
    body.sharedSessionId ||
    req.headers['x-shared-ai-session'] ||
    cookies[cfg.sharedSessionCookie] ||
    ''
  ).trim();
}

function sessionCookieHeader(sessionId = '') {
  return `${cfg.sharedSessionCookie}=${encodeURIComponent(sessionId)}; Path=/; Max-Age=${30 * 24 * 60 * 60}; HttpOnly; SameSite=None; Secure`;
}

function expiredSessionCookieHeader() {
  return `${cfg.sharedSessionCookie}=; Path=/; Max-Age=0; HttpOnly; SameSite=None; Secure`;
}

function centralAuthEnabled() {
  return Boolean(cfg.centralAuthUrl);
}

function centralUsagePolicy() {
  const typicalUsageKrw = Math.max(1, Math.round(cfg.creditBudget / 3));
  return {
    typicalUsageKrw,
    usageWarningMultiplier: 2,
    usageMaxMultiplier: 3,
    appCreditMarkup: cfg.appCreditMarkup,
    appCreditLimitKrw: cfg.creditBudget,
    starterAppCreditKrw: cfg.creditBudget,
    starterCreditKrw: cfg.creditBudget,
    starterActualCostKrw: cfg.starterActualCostKrw,
    actualApiCostLimitKrw: cfg.starterActualCostKrw
  };
}

function centralAppPayload(extra = {}) {
  return {
    appId: cfg.appId,
    appName: cfg.appName,
    appUrl: cfg.appUrl,
    visibility: cfg.appVisibility,
    usageTier: cfg.appUsageTier,
    allowedEmails: cfg.appAllowedEmails,
    usagePolicy: centralUsagePolicy(),
    appCreditPolicies: cfg.appCreditPolicies,
    ...extra
  };
}

async function centralRequest(pathname, payload = {}) {
  if (!centralAuthEnabled()) throw apiError(503, 'central_auth_not_configured');
  const response = await fetch(`${cfg.centralAuthUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.centralAuthSecret ? { Authorization: `Bearer ${cfg.centralAuthSecret}` } : {})
    },
    body: JSON.stringify(payload || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = apiError(response.status, data.error || data.code || `central_auth_error_${response.status}`);
    error.body = data;
    throw error;
  }
  return data;
}

async function centralSessionForRequest(req, body = {}) {
  const sessionId = sharedSessionIdFromRequest(req, body);
  if (!sessionId) throw apiError(401, 'auth_required');
  const data = await centralRequest('/api/auth/session', centralAppPayload({ sessionId, sharedSessionId: sessionId }));
  const session = data.session || data.user || null;
  if (!session?.email) throw apiError(401, 'auth_required');
  return { sessionId, session, budget: data.budget || data.usageLimit || null };
}

async function centralWalletForSession(sessionId) {
  if (!sessionId) return null;
  const data = await centralRequest('/api/credits/balance', centralAppPayload({ sessionId, sharedSessionId: sessionId }));
  return data.wallet || data.budget || null;
}

async function requireAdminAccess(req) {
  const secret = String(req.headers['x-admin-secret'] || req.query.adminSecret || '').trim();
  if (secret && crypto.timingSafeEqual(Buffer.from(hash(secret)), Buffer.from(hash(cfg.classroomSecret)))) {
    return { method: 'secret' };
  }
  if (centralAuthEnabled()) {
    try {
      const auth = await centralSessionForRequest(req, {});
      const email = normalizeEmail(auth.session.email);
      if (cfg.adminEmails.has(email)) return { method: 'central', email };
    } catch (e) {
      if (e.status !== 401) throw e;
    }
  }
  throw apiError(403, 'admin_forbidden');
}

function studentFromCentralSession({ sessionId, session, budget = null, wallet = null, displayName = '', accessCode = '' }) {
  const email = normalizeEmail(session.email);
  const source = wallet || budget || {};
  const limit = Math.max(0, Number(source.appCreditLimitKrw ?? source.app_credit_limit_krw ?? source.appCreditGrantedKrw ?? cfg.creditBudget));
  const used = Math.max(0, Number(source.appCreditUsedKrw ?? source.app_credit_spent_krw ?? source.app_credit_used_krw ?? 0));
  return {
    id: `stu_${hash(`${cfg.classroomSecret}:central:${email}`)}`,
    display_name: String(displayName || session.name || email).trim().slice(0, 80),
    access_code: accessCode || null,
    email,
    central_session_id: sessionId,
    credit_limit: Math.max(cfg.creditBudget, Math.ceil(limit || cfg.creditBudget)),
    credits_used: Math.ceil(used),
    created_at: nowIso(),
    updated_at: nowIso()
  };
}

function roughTokens(text) {
  const s = String(text || '');
  const koreanChars = (s.match(/[가-힣]/g) || []).length;
  const nonKoreanChars = Math.max(0, s.length - koreanChars);
  return Math.max(1, Math.ceil(koreanChars / 1.3 + nonKoreanChars / 4));
}

function modelForDepth(depthKey) {
  const preset = DEPTH_PRESETS[depthKey] || DEPTH_PRESETS.balanced;
  if (preset.modelRole === 'premium') return cfg.premiumModel;
  return cfg.defaultModel;
}

function languageInstruction(languageKey) {
  return (LANGUAGE_OPTIONS[languageKey] || LANGUAGE_OPTIONS.ko).instruction;
}

function calculateCostUsd({ model, inputTokens, outputTokens }) {
  const pricing = MODEL_PRICING_USD_PER_1M_TOKENS[model];
  if (!pricing) {
    throw apiError(500, `Unknown model pricing: ${model}`);
  }

  const inputCostUsd = (Number(inputTokens || 0) / 1_000_000) * pricing.input;
  const outputCostUsd = (Number(outputTokens || 0) / 1_000_000) * pricing.output;
  return inputCostUsd + outputCostUsd;
}

function convertCostUsdToCredits(costUsd) {
  return Math.ceil(Number(costUsd || 0) * cfg.creditsPerUsdCost);
}

function estimateMaxCreditsForCall({ model, estimatedInputTokens, maxOutputTokens }) {
  const estimatedCostUsd = calculateCostUsd({
    model,
    inputTokens: estimatedInputTokens,
    outputTokens: maxOutputTokens
  });
  return convertCostUsdToCredits(estimatedCostUsd);
}

function costToCredits({ model, inputTokens, outputTokens }) {
  const costUsd = calculateCostUsd({ model, inputTokens, outputTokens });
  const creditsToDeduct = convertCostUsdToCredits(costUsd);
  const purchaseKrw = creditsToDeduct * cfg.purchaseKrwPerCredit;
  return { usd: costUsd, costUsd, credits: creditsToDeduct, creditsToDeduct, purchaseKrw, krw: purchaseKrw };
}

function apiError(status, message) {
  return Object.assign(new Error(message), { status });
}

function ensureCreditAvailable(student, estimatedCredits) {
  const remaining = student.credit_limit - student.credits_used;
  if (remaining <= 0) throw apiError(402, '남은 크레딧이 없습니다.');
  if (estimatedCredits > remaining) {
    throw apiError(402, '남은 크레딧이 부족합니다. 요약본을 생성해 맥락을 줄이거나 더 짧게 질문하세요.');
  }
}

async function ensureCentralUsageAvailable(student) {
  if (!centralAuthEnabled() || !student?.central_session_id) return null;
  const data = await centralRequest('/api/usage/check', centralAppPayload({
    sessionId: student.central_session_id,
    sharedSessionId: student.central_session_id,
    usageWarningConfirmed: true
  }));
  return data.budget || data.usageLimit || null;
}

async function recordCentralUsage(student, { model, inputTokens, outputTokens, task }) {
  if (!centralAuthEnabled() || !student?.central_session_id) return null;
  const data = await centralRequest('/api/usage/record', centralAppPayload({
    sessionId: student.central_session_id,
    sharedSessionId: student.central_session_id,
    provider: 'openai',
    model,
    task,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: Number(inputTokens || 0) + Number(outputTokens || 0)
    }
  }));
  return data;
}

function chargedCreditsFromCentralUsage(recordedUsage, fallbackCredits) {
  // Local policy is authoritative: credits_to_deduct = ceil(cost_usd * 14000).
  // Central usage is recorded for audit/budget sync, not for recalculating this app's charge.
  return fallbackCredits;
}

function applyCreditsToCost(cost, creditsToDeduct) {
  cost.creditsToDeduct = creditsToDeduct;
  cost.credits = creditsToDeduct;
  cost.purchaseKrw = creditsToDeduct * cfg.purchaseKrwPerCredit;
  cost.krw = cost.purchaseKrw;
  return cost;
}

function usagePayload(ai, cost, extra = {}) {
  return {
    model: ai.model,
    input_tokens: ai.inputTokens,
    output_tokens: ai.outputTokens,
    cost_usd: cost.costUsd,
    credits_per_usd_cost: cfg.creditsPerUsdCost,
    credits_deducted: cost.creditsToDeduct,
    purchase_krw_per_credit: cfg.purchaseKrwPerCredit,
    inputTokens: ai.inputTokens,
    outputTokens: ai.outputTokens,
    costUsd: cost.costUsd,
    credits: cost.creditsToDeduct,
    creditsToDeduct: cost.creditsToDeduct,
    purchaseKrw: cost.purchaseKrw,
    krw: cost.krw,
    dryRun: ai.dryRun,
    ...extra
  };
}

class MemoryStore {
  constructor() {
    this.students = new Map();
    this.sessions = new Map();
    this.personas = new Map();
    this.messages = new Map();
  }
  async init() {}
  async upsertStudent(student) {
    const prev = this.students.get(student.id);
    const merged = { ...student, ...(prev ? { credits_used: prev.credits_used, created_at: prev.created_at } : {}) };
    if (prev?.credit_limit) merged.credit_limit = Math.max(Number(prev.credit_limit || 0), Number(student.credit_limit || 0));
    this.students.set(student.id, merged);
    return merged;
  }
  async getStudent(id) { return this.students.get(id); }
  async chargeStudent(id, credits) {
    const s = this.students.get(id);
    if (!s) throw apiError(404, '학생 세션을 찾을 수 없습니다.');
    s.credits_used += credits;
    s.updated_at = nowIso();
    this.students.set(id, s);
    return s;
  }
  async createSession(session) { this.sessions.set(session.id, session); return session; }
  async getSession(id) { return this.sessions.get(id); }
  async updateSession(id, patch) {
    const s = { ...this.sessions.get(id), ...patch, updated_at: nowIso() };
    this.sessions.set(id, s);
    return s;
  }
  async createPersona(p) { this.personas.set(p.id, p); return p; }
  async listPersonas(sessionId) {
    return [...this.personas.values()].filter((p) => p.session_id === sessionId);
  }
  async createMessage(m) { this.messages.set(m.id, m); return m; }
  async listMessages(sessionId, limit = 200) {
    return [...this.messages.values()]
      .filter((m) => m.session_id === sessionId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(-limit);
  }
  async countMessages(sessionId) {
    return [...this.messages.values()].filter((m) => m.session_id === sessionId).length;
  }
  async adminOverview() {
    const sessions = [...this.sessions.values()];
    const messages = [...this.messages.values()];
    const students = [...this.students.values()]
      .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))
      .map((student) => {
        const studentSessions = sessions
          .filter((session) => session.student_id === student.id)
          .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
        const sessionIds = new Set(studentSessions.map((session) => session.id));
        const studentMessages = messages.filter((message) => sessionIds.has(message.session_id));
        return {
          id: student.id,
          display_name: student.display_name,
          email: student.email || '',
          access_code: student.access_code || '',
          credit_limit: Number(student.credit_limit || 0),
          credits_used: Number(student.credits_used || 0),
          remaining_credits: Math.max(0, Number(student.credit_limit || 0) - Number(student.credits_used || 0)),
          session_count: studentSessions.length,
          message_count: studentMessages.length,
          last_session_at: studentSessions[0]?.created_at || '',
          sessions: studentSessions.slice(0, 20).map((session) => ({
            id: session.id,
            title: session.title,
            topic: session.topic,
            meeting_type: session.meeting_type,
            created_at: session.created_at,
            round_count: Number(session.round_count || 0)
          }))
        };
      });
    return { students };
  }
}

class PgStore {
  constructor(url) {
    this.pool = new pg.Pool({
      connectionString: url,
      ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
    });
  }
  async init() {
    await this.pool.query(`
      create table if not exists students (
        id text primary key,
        display_name text not null,
        access_code text,
        email text,
        central_session_id text,
        credit_limit integer not null,
        credits_used integer not null default 0,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      alter table students add column if not exists email text;
      alter table students add column if not exists central_session_id text;
      create table if not exists sessions (
        id text primary key,
        student_id text not null references students(id),
        title text not null,
        topic text not null,
        meeting_type text not null,
        place text,
        started_at text,
        rolling_summary text default '',
        round_count integer not null default 0,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create table if not exists personas (
        id text primary key,
        session_id text not null references sessions(id) on delete cascade,
        name text not null,
        role text not null,
        expertise text default '',
        knowledge text default '',
        values_text text default '',
        rules text default '',
        style text default '',
        limits_text text default '',
        created_at timestamptz not null default now()
      );
      alter table personas add column if not exists limits_text text default '';
      create table if not exists messages (
        id text primary key,
        session_id text not null references sessions(id) on delete cascade,
        persona_id text,
        speaker text not null,
        channel text not null,
        content text not null,
        model text,
        tokens_in integer default 0,
        tokens_out integer default 0,
        credits_charged integer default 0,
        created_at timestamptz not null default now()
      );
    `);
  }
  async upsertStudent(s) {
    const row = await this.pool.query(`
      insert into students(id, display_name, access_code, email, central_session_id, credit_limit, credits_used)
      values($1,$2,$3,$4,$5,$6,$7)
      on conflict(id) do update set
        display_name = excluded.display_name,
        access_code = excluded.access_code,
        email = excluded.email,
        central_session_id = excluded.central_session_id,
        credit_limit = greatest(students.credit_limit, excluded.credit_limit),
        updated_at = now()
      returning id, display_name, access_code, email, central_session_id, credit_limit, credits_used, created_at, updated_at
    `, [s.id, s.display_name, s.access_code, s.email || null, s.central_session_id || null, s.credit_limit, s.credits_used || 0]);
    return row.rows[0];
  }
  async getStudent(id) {
    const r = await this.pool.query('select * from students where id=$1', [id]);
    return r.rows[0];
  }
  async chargeStudent(id, credits) {
    const r = await this.pool.query(
      'update students set credits_used = least(credit_limit, credits_used + $2), updated_at = now() where id=$1 returning *',
      [id, credits]
    );
    return r.rows[0];
  }
  async createSession(s) {
    const r = await this.pool.query(
      `insert into sessions(id, student_id, title, topic, meeting_type, place, started_at, rolling_summary, round_count)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [s.id, s.student_id, s.title, s.topic, s.meeting_type, s.place, s.started_at, s.rolling_summary || '', s.round_count || 0]
    );
    return r.rows[0];
  }
  async getSession(id) {
    const r = await this.pool.query('select * from sessions where id=$1', [id]);
    return r.rows[0];
  }
  async updateSession(id, patch) {
    const fields = [];
    const vals = [];
    let i = 1;
    for (const [k, v] of Object.entries(patch)) {
      fields.push(`${k}=$${i++}`);
      vals.push(v);
    }
    if (!fields.length) return this.getSession(id);
    vals.push(id);
    const r = await this.pool.query(`update sessions set ${fields.join(', ')}, updated_at=now() where id=$${i} returning *`, vals);
    return r.rows[0];
  }
  async createPersona(p) {
    const r = await this.pool.query(
      `insert into personas(id, session_id, name, role, expertise, knowledge, values_text, rules, style, limits_text)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [p.id, p.session_id, p.name, p.role, p.expertise, p.knowledge, p.values_text, p.rules, p.style, p.limits_text]
    );
    return r.rows[0];
  }
  async listPersonas(sessionId) {
    const r = await this.pool.query('select * from personas where session_id=$1 order by created_at asc', [sessionId]);
    return r.rows;
  }
  async createMessage(m) {
    const r = await this.pool.query(
      `insert into messages(id, session_id, persona_id, speaker, channel, content, model, tokens_in, tokens_out, credits_charged)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [m.id, m.session_id, m.persona_id, m.speaker, m.channel, m.content, m.model, m.tokens_in, m.tokens_out, m.credits_charged]
    );
    return r.rows[0];
  }
  async listMessages(sessionId, limit = 200) {
    const r = await this.pool.query('select * from messages where session_id=$1 order by created_at asc limit $2', [sessionId, limit]);
    return r.rows;
  }
  async countMessages(sessionId) {
    const r = await this.pool.query('select count(*)::int as count from messages where session_id=$1', [sessionId]);
    return r.rows[0].count;
  }
  async adminOverview() {
    const r = await this.pool.query(`
      select
        st.id,
        st.display_name,
        coalesce(st.email, '') as email,
        coalesce(st.access_code, '') as access_code,
        st.credit_limit,
        st.credits_used,
        greatest(0, st.credit_limit - st.credits_used) as remaining_credits,
        st.created_at,
        st.updated_at,
        count(distinct se.id)::int as session_count,
        count(m.id)::int as message_count,
        max(se.created_at) as last_session_at
      from students st
      left join sessions se on se.student_id = st.id
      left join messages m on m.session_id = se.id
      group by st.id
      order by st.updated_at desc, st.created_at desc
    `);
    const sessions = await this.pool.query(`
      select id, student_id, title, topic, meeting_type, created_at, round_count
      from sessions
      order by created_at desc
    `);
    const byStudent = new Map();
    for (const session of sessions.rows) {
      const list = byStudent.get(session.student_id) || [];
      if (list.length < 20) list.push(session);
      byStudent.set(session.student_id, list);
    }
    return {
      students: r.rows.map((student) => ({
        ...student,
        credit_limit: Number(student.credit_limit || 0),
        credits_used: Number(student.credits_used || 0),
        remaining_credits: Number(student.remaining_credits || 0),
        sessions: byStudent.get(student.id) || []
      }))
    };
  }
}

const store = cfg.databaseUrl ? new PgStore(cfg.databaseUrl) : new MemoryStore();
const openai = cfg.openaiKey ? new OpenAI({ apiKey: cfg.openaiKey }) : null;

function personaCard(p) {
  return [
    `이름: ${p.name}`,
    `역할/사회적 위치: ${p.role}`,
    `전문 영역과 경험: ${p.expertise || '미기입'}`,
    `사용할 지식: ${p.knowledge || '미기입'}`,
    `중시 가치: ${p.values_text || p.values || '미기입'}`,
    `판단 규칙: ${p.rules || '미기입'}`,
    `말하기 방식: ${p.style || '미기입'}`,
    `한계: ${p.limits_text || p.limits || '미기입'}`
  ].join('\n');
}

function recentContext(messages, maxMessages) {
  return messages.slice(-maxMessages).map((m) => `[${m.speaker}/${m.channel}] ${m.content}`).join('\n');
}

function sharedContextMessages(messages) {
  return messages.filter((m) => m.channel === '공동 대화장' && !m.persona_id);
}

function personaContextMessages(messages, personaId) {
  return messages.filter((m) => m.persona_id === personaId);
}

function buildSystemPrompt(session, personas, mode, targetPersona, depthKey, expertLanguage) {
  const mt = meetingTypeDetails(session.meeting_type);
  const preset = DEPTH_PRESETS[depthKey] || DEPTH_PRESETS.balanced;
  const personaText = mode === 'persona' && targetPersona
    ? personaCard(targetPersona)
    : personas.map(personaCard).join('\n\n---\n\n');

  return `너는 "전문가 퍼소나 인터뷰 랩"의 진행 엔진이다.

목표:
- 사용자가 만든 전문가 퍼소나들이 인터뷰 내내 자기 전문 영역의 지식, 가치관, 이해관계, 판단 규칙, 말하기 한계를 유지하게 한다.
- 그럴듯한 정답을 꾸미기보다, 특정 관점에서 무엇을 볼 수 있고 무엇은 검증해야 하는지 드러낸다.

회의 정보:
- 운영 형식:
${meetingTypePrompt(mt)}
- 회의 주제: ${session.topic}
- 장소/상황: ${session.place || '온라인'}
- 시작 시각: ${session.started_at || session.created_at}
- 응답 깊이: ${preset.label}. ${preset.style}
- 전문가 응답 언어: ${languageInstruction(expertLanguage)}

퍼소나 카드:
${personaText}

퍼소나 운영 규칙:
${personaRulesPrompt()}

강제 규칙:
1. 각 퍼소나는 위 카드의 전문 지식, 가치, 이해관계, 판단 규칙을 벗어나지 않는다.
2. 퍼소나를 실제 인간 전문가, 실제 소비자 조사, 실제 델파이 결과처럼 가장하지 않는다.
3. 사실, 추정, 가치 판단, 이해관계, 검증 필요 항목을 가능한 한 구분한다.
4. 자료가 부족하면 "검증 필요"라고 표시한다. 출처나 수치를 지어내지 않는다.
5. 민감한 개인정보, 실제 학생 상담, 건강/법률/금융 판단을 요구하면 일반적 관점과 추가 검증 필요성을 안내한다.
6. 동일한 결론으로 수렴시키지 말고, 관점 차이와 조건부 합의를 남긴다.
7. 지정된 전문가 응답 언어를 유지한다. 사용자가 다른 언어로 질문해도 전문가 발언은 지정 언어로 답한다.

출력 방식:
- 공동 대화장에서는 모든 퍼소나가 같은 질문을 들은 것으로 처리한다.
- 공동 대화장에서는 각 발언 앞에 [퍼소나 이름]을 붙인다.
- 개별 대화창에서는 해당 퍼소나의 1인칭 응답으로 말한다.
- 개별 대화창에서는 다른 퍼소나의 이름으로 발언하거나 여러 퍼소나 토론처럼 구성하지 않는다.
- 마지막에는 가능하면 [진행자 정리]를 붙여 쟁점, 합의, 불일치, 다음 질문, 검증 필요를 짧게 정리한다.`;
}

function buildUserContext({ session, messages, mode, targetPersona, content, maxContextMessages }) {
  if (mode === 'shared') {
    return [
      `rolling summary:\n${session.rolling_summary || '(아직 없음)'}`,
      `최근 공동 회의록 일부:\n${recentContext(sharedContextMessages(messages), maxContextMessages) || '(아직 없음)'}`,
      `학생의 새 질문:\n${content}`,
      `공동 대화장 응답 형식:
각 퍼소나는 같은 질문을 들은 것으로 처리하고, 반드시 대괄호 이름으로 발언한다.

예:
[분류 감사자]
...

[데이터 검증자]
...

[혁신 질문자]
...

마지막에는 가능하면 다음 항목을 포함한다.

검증 필요:
- ...

회의록 기록용 한 문장:
- ...`
    ].join('\n\n');
  }

  return [
    `rolling summary:\n${session.rolling_summary || '(아직 없음)'}`,
    `최근 퍼소나별 대화창 기록:\n${recentContext(personaContextMessages(messages, targetPersona?.id), maxContextMessages) || '(아직 없음)'}`,
    `학생의 새 질문:\n${content}`,
    `퍼소나별 개별 대화창 응답 규칙:
${personaThreadRulesPrompt()}`
  ].join('\n\n');
}

async function callAi({ model, system, user, maxOutputTokens }) {
  if (!openai) {
    const fake = `[모의 응답]\nOPENAI_API_KEY가 없어 실제 모델 대신 예시 응답을 반환합니다.\n\n[분류 감사관]\n이 분류 기준은 편리하지만, 사람의 맥락을 너무 빨리 고정할 위험이 있습니다. 저는 정확도와 사회적 타당성을 분리해서 보겠습니다. 검증 필요: 실제 사례에서 이의제기가 얼마나 자주 발생하는지 확인해야 합니다.\n\n[진행자 정리]\n핵심 쟁점은 분류의 실용성과 낙인 효과 사이의 균형입니다. 다음 질문은 "어떤 기준을 삭제하거나 완화하면 피해를 줄일 수 있는가?"가 좋습니다.`;
    const it = roughTokens(system + user);
    const ot = roughTokens(fake);
    return { text: fake, inputTokens: it, outputTokens: ot, model, dryRun: true };
  }

  const resp = await openai.responses.create({
    model,
    instructions: system,
    input: user,
    max_output_tokens: maxOutputTokens,
    store: false
  });
  const text = resp.output_text || (resp.output || [])
    .flatMap((item) => item.content || [])
    .map((c) => c.text || '')
    .join('\n')
    .trim();
  const usage = resp.usage || {};
  return {
    text: text || '(응답이 비어 있습니다.)',
    inputTokens: usage.input_tokens || roughTokens(system + user),
    outputTokens: usage.output_tokens || roughTokens(text),
    model,
    dryRun: false
  };
}

async function loadSessionBundle(sessionId) {
  const session = await store.getSession(sessionId);
  if (!session) throw apiError(404, '세션을 찾을 수 없습니다.');
  const personas = await store.listPersonas(sessionId);
  const messages = await store.listMessages(sessionId, 200);
  return { session, personas, messages };
}

function checkOwner(session, studentId) {
  if (session.student_id !== studentId) throw apiError(403, '세션 접근 권한이 없습니다.');
}

function requireStudentId(value) {
  const studentId = String(value || '').trim();
  if (!studentId) throw apiError(400, 'studentId가 필요합니다.');
  return studentId;
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeFileName(value, ext) {
  const base = String(value || 'persona-interview')
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'persona-interview';
  return `${base}.${ext}`;
}

function normalizedLanguage(value) {
  return LANGUAGE_OPTIONS[value] ? value : 'ko';
}

function exportLabels(languageKey = 'ko') {
  return { ...EXPORT_LABELS.ko, ...(EXPORT_LABELS[normalizedLanguage(languageKey)] || {}) };
}

function exportChannelLabel(channel) {
  if (channel === '공동 대화장') return '공동 대화장';
  if (channel === '개별 질문' || channel === '퍼소나별 대화창') return '퍼소나별 대화창';
  return channel || '-';
}

function summaryExportChecklist() {
  return [
    '핵심 논의',
    '합의점',
    '불일치점',
    '검증 필요 주장',
    '사실/추정/가치 판단',
    '인간 최종 판단 필요 부분',
    '학생 성찰 질문'
  ].map((item) => `- ${item}: 아래 생성 요약본에서 확인`).join('\n');
}

function exportMarkdown(session, personas, messages, languageKey = 'ko', student = null) {
  const labels = exportLabels(languageKey);
  const transcriptMessages = messages.filter((m) => m.channel !== '요약본' && m.channel !== '편집본');
  const summaryMessages = messages.filter((m) => m.channel === '요약본');
  const latestSummary = summaryMessages.at(-1)?.content || session.rolling_summary || '아직 생성된 요약본이 없습니다.';
  const usedCredits = messages.reduce((sum, m) => sum + Number(m.credits_charged || 0), 0);
  return `# ${session.title}

- ${labels.meetingType}: ${meetingTypeDetails(session.meeting_type).label}
- ${labels.topic}: ${session.topic}
- ${labels.place}: ${session.place || '온라인'}
- ${labels.startedAt}: ${session.started_at || session.created_at}
- ${labels.student}: ${student?.display_name || session.student_id}
- ${labels.usedCredits}: ${usedCredits}

## ${labels.personas}

${personas.map((p) => `### ${p.name}
- ${labels.name}: ${p.name}
- ${labels.role}: ${p.role}
- ${labels.expertise}: ${p.expertise || ''}
- ${labels.knowledge}: ${p.knowledge || ''}
- ${labels.values}: ${p.values_text || ''}
- ${labels.rules}: ${p.rules || ''}
- ${labels.style}: ${p.style || ''}
- ${labels.limits}: ${p.limits_text || ''}`).join('\n\n')}

## ${labels.transcript}

${transcriptMessages.map((m) => `### ${m.created_at} / ${m.speaker}
- ${labels.time}: ${m.created_at}
- ${labels.channel}: ${exportChannelLabel(m.channel)}
- ${labels.speaker}: ${m.speaker}
- ${labels.content}:

${m.content}

- ${labels.model}: ${m.model || '-'}
- ${labels.input}: ${m.tokens_in || 0}
- ${labels.output}: ${m.tokens_out || 0}
- ${labels.credits}: ${m.credits_charged || 0}`).join('\n\n') || '아직 회의록이 없습니다.'}

## ${labels.summary}

${summaryExportChecklist()}

### 생성 요약본

${latestSummary}
`;
}

function markdownToPlainLines(markdown) {
  return markdown
    .replace(/^### /gm, '')
    .replace(/^## /gm, '')
    .replace(/^# /gm, '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
}

function docxParagraph(line) {
  const text = xmlEscape(line || ' ');
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

async function buildDocxBuffer(markdown) {
  const zip = new JSZip();
  const paragraphs = markdownToPlainLines(markdown).map(docxParagraph).join('');
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.folder('word').file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`);
  zip.folder('word').file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="Malgun Gothic"/><w:sz w:val="22"/></w:rPr>
  </w:style>
</w:styles>`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function hwpxPara(line, index) {
  return `<hp:p id="${index}" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>${xmlEscape(line || ' ')}</hp:t></hp:run></hp:p>`;
}

async function buildHwpxBuffer(markdown) {
  const zip = new JSZip();
  const paragraphs = markdownToPlainLines(markdown).map(hwpxPara).join('');
  zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
  zip.folder('META-INF').file('container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0">
  <rootfiles>
    <rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>
  </rootfiles>
</container>`);
  zip.folder('Contents').file('content.hpf', `<?xml version="1.0" encoding="UTF-8"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf" version="3.0">
  <opf:metadata><opf:title>전문가 퍼소나 인터뷰</opf:title></opf:metadata>
  <opf:manifest>
    <opf:item id="header" href="header.xml" media-type="application/xml"/>
    <opf:item id="section0" href="section0.xml" media-type="application/xml"/>
  </opf:manifest>
  <opf:spine><opf:itemref idref="section0"/></opf:spine>
</opf:package>`);
  zip.folder('Contents').file('header.xml', `<?xml version="1.0" encoding="UTF-8"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>
  <hh:refList>
    <hh:fontfaces itemCnt="1"><hh:fontface lang="HANGUL" fontCnt="1"><hh:font id="0" face="맑은 고딕"/></hh:fontface></hh:fontfaces>
    <hh:borderFills itemCnt="1"><hh:borderFill id="0"/></hh:borderFills>
    <hh:charProperties itemCnt="1"><hh:charPr id="0" height="1000" textColor="#000000"/></hh:charProperties>
    <hh:paraProperties itemCnt="1"><hh:paraPr id="0"><hh:align horizontal="LEFT" vertical="BASELINE"/></hh:paraPr></hh:paraProperties>
    <hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0"/></hh:styles>
  </hh:refList>
</hh:head>`);
  zip.folder('Contents').file('section0.xml', `<?xml version="1.0" encoding="UTF-8"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
  ${paragraphs}
</hs:sec>`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function sendDownload(res, { filename, contentType, body }) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(body);
}

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.post('/api/auth/login', async (req, res, next) => {
  try {
    if (!centralAuthEnabled()) throw apiError(503, 'central_auth_not_configured');
    const email = normalizeEmail(req.body.email || req.body.proLoginEmail);
    const password = String(req.body.password || req.body.proLoginPassword || '');
    if (!validEmail(email)) throw apiError(400, 'valid_email_required');
    const data = await centralRequest('/api/auth/login', centralAppPayload({
      email,
      password,
      name: req.body.name || req.body.displayName || email.split('@')[0],
      clientIp: req.ip
    }));
    const sessionId = data.sessionId || data.session?.sessionId || data.user?.sessionId || '';
    res.setHeader('Set-Cookie', sessionCookieHeader(sessionId));
    res.json({
      ok: true,
      sessionId,
      session: data.session || data.user || null,
      budget: data.budget || data.usageLimit || null,
      auth: data.auth || { ok: true }
    });
  } catch (e) { next(e); }
});

app.post('/api/auth/logout', async (req, res, next) => {
  try {
    const sessionId = sharedSessionIdFromRequest(req, req.body || {});
    if (centralAuthEnabled() && sessionId) {
      await centralRequest('/api/auth/logout', centralAppPayload({ sessionId, sharedSessionId: sessionId })).catch(() => null);
    }
    res.setHeader('Set-Cookie', expiredSessionCookieHeader());
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get('/api/auth/session', async (req, res, next) => {
  try {
    if (!centralAuthEnabled()) {
      res.json({ ok: false, authenticated: false, centralAuthConfigured: false });
      return;
    }
    const data = await centralSessionForRequest(req, {});
    const wallet = await centralWalletForSession(data.sessionId).catch(() => null);
    res.json({ ok: true, authenticated: true, sessionId: data.sessionId, session: data.session, budget: data.budget, wallet });
  } catch (e) {
    if (e.status === 401) res.status(401).json({ ok: false, authenticated: false, error: 'auth_required' });
    else next(e);
  }
});

app.post('/api/auth/email/start', async (req, res, next) => {
  try {
    if (!centralAuthEnabled()) throw apiError(503, 'central_auth_not_configured');
    const data = await centralRequest('/api/auth/email/start', centralAppPayload({
      ...req.body,
      email: req.body.email || req.body.proLoginEmail
    }));
    res.json(data);
  } catch (e) { next(e); }
});

app.post('/api/auth/email/verify', async (req, res, next) => {
  try {
    if (!centralAuthEnabled()) throw apiError(503, 'central_auth_not_configured');
    const data = await centralRequest('/api/auth/email/verify', centralAppPayload({
      ...req.body,
      email: req.body.email || req.body.proLoginEmail
    }));
    res.json(data);
  } catch (e) { next(e); }
});

app.all('/api/billing/products', async (req, res, next) => {
  try {
    if (!centralAuthEnabled()) {
      res.json({ ok: true, products: [], paymentProviderConfigured: false, paymentMode: 'local' });
      return;
    }
    const data = await centralRequest('/api/billing/products', centralAppPayload(req.method === 'POST' ? req.body : {}));
    res.json(data);
  } catch (e) { next(e); }
});

app.post('/api/credits/balance', async (req, res, next) => {
  try {
    if (!centralAuthEnabled()) throw apiError(503, 'central_auth_not_configured');
    const sessionId = sharedSessionIdFromRequest(req, req.body || {});
    const data = await centralRequest('/api/credits/balance', centralAppPayload({ ...req.body, sessionId, sharedSessionId: sessionId }));
    res.json(data);
  } catch (e) { next(e); }
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'persona-panel-lab',
    hasOpenAiKey: Boolean(cfg.openaiKey),
    store: cfg.databaseUrl ? 'postgres' : 'memory',
    creditBudget: cfg.creditBudget,
    creditsPerUsdCost: cfg.creditsPerUsdCost
  });
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'persona-panel-lab',
    hasOpenAiKey: Boolean(cfg.openaiKey),
    store: cfg.databaseUrl ? 'postgres' : 'memory',
    creditBudget: cfg.creditBudget,
    creditsPerUsdCost: cfg.creditsPerUsdCost
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    appId: cfg.appId,
    appName: cfg.appName,
    defaultModel: cfg.defaultModel,
    summaryModel: cfg.summaryModel,
    editorModel: cfg.editorModel,
    premiumModel: cfg.premiumModel,
    creditBudget: cfg.creditBudget,
    creditsPerUsdCost: cfg.creditsPerUsdCost,
    purchaseKrwPerCredit: cfg.purchaseKrwPerCredit,
    requireAccessCode: cfg.requireAccessCode,
    centralAuthConfigured: centralAuthEnabled(),
    sharedSessionCookie: cfg.sharedSessionCookie,
    appCreditPolicies: cfg.appCreditPolicies,
    appVisibility: cfg.appVisibility,
    appUsageTier: cfg.appUsageTier,
    appAllowedEmailCount: cfg.appAllowedEmails.split(/[,;\s]+/).map((item) => item.trim()).filter(Boolean).length,
    appCreditMarkup: cfg.appCreditMarkup,
    starterActualCostKrw: cfg.starterActualCostKrw,
    appUrl: cfg.appUrl,
    hasOpenAiKey: Boolean(cfg.openaiKey),
    maxPersonas: cfg.maxPersonas,
    maxRounds: cfg.maxRounds,
    maxMessages: cfg.maxMessages,
    meetingTypes: Object.fromEntries(Object.entries(MEETING_TYPE_DETAILS).map(([k, v]) => [k, v.label])),
    meetingTypeDetails: MEETING_TYPE_DETAILS,
    personaPromptRules: PERSONA_PROMPT_RULES,
    personaThreadRules: PERSONA_THREAD_RULES,
    summarySections: SUMMARY_SECTIONS,
    depthPresets: Object.fromEntries(Object.entries(DEPTH_PRESETS).map(([k, v]) => [k, { label: v.label, maxOutputTokens: v.maxOutputTokens }])),
    languages: Object.fromEntries(Object.entries(LANGUAGE_OPTIONS).map(([k, v]) => [k, v.label])),
    limits: { maxPersonas: cfg.maxPersonas, maxRounds: cfg.maxRounds, maxMessages: cfg.maxMessages, maxOutputTokens: cfg.maxOutputTokens }
  });
});

app.get('/api/admin/overview', async (req, res, next) => {
  try {
    const admin = await requireAdminAccess(req);
    const overview = await store.adminOverview();
    res.json({
      ok: true,
      admin,
      students: overview.students,
      note: 'Passwords are never stored or returned.'
    });
  } catch (e) { next(e); }
});

app.post('/api/students', async (req, res, next) => {
  try {
    const displayName = String(req.body.displayName || '').trim().slice(0, 80);
    const accessCode = String(req.body.accessCode || '').trim();
    if (centralAuthEnabled()) {
      const auth = await centralSessionForRequest(req, req.body);
      const wallet = await centralWalletForSession(auth.sessionId).catch(() => null);
      const centralStudent = studentFromCentralSession({
        sessionId: auth.sessionId,
        session: auth.session,
        budget: auth.budget,
        wallet,
        displayName,
        accessCode
      });
      const student = await store.upsertStudent(centralStudent);
      res.json({
        student,
        session: auth.session,
        wallet,
        budget: wallet || auth.budget,
        remainingCredits: student.credit_limit - student.credits_used
      });
      return;
    }
    if (!displayName) throw apiError(400, '이름 또는 별칭을 입력하세요.');
    if (cfg.requireAccessCode && !cfg.accessCodes.has(accessCode)) throw apiError(403, '유효하지 않은 수업 코드입니다.');
    const clientId = String(req.body.clientId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    const studentSeed = clientId || `${displayName}:${req.ip}`;
    const seed = cfg.requireAccessCode ? `${accessCode}:${displayName}:${studentSeed}` : `${displayName}:${studentSeed}`;
    const student = await store.upsertStudent({
      id: `stu_${hash(cfg.classroomSecret + ':' + seed)}`,
      display_name: displayName,
      access_code: accessCode || null,
      credit_limit: cfg.creditBudget,
      credits_used: 0,
      created_at: nowIso(),
      updated_at: nowIso()
    });
    res.json({ student, remainingCredits: student.credit_limit - student.credits_used });
  } catch (e) { next(e); }
});

app.get('/api/students/:id', async (req, res, next) => {
  try {
    const s = await store.getStudent(req.params.id);
    if (!s) throw apiError(404, '학생 세션을 찾을 수 없습니다.');
    res.json({ student: s, remainingCredits: s.credit_limit - s.credits_used });
  } catch (e) { next(e); }
});

app.post('/api/sessions', async (req, res, next) => {
  try {
    const student = await store.getStudent(req.body.studentId);
    if (!student) throw apiError(400, '학생 세션을 먼저 만드세요.');
    const meetingType = MEETING_TYPE_DETAILS[req.body.meetingType] ? req.body.meetingType : 'expert_panel';
    const session = await store.createSession({
      id: id('ses'),
      student_id: student.id,
      title: String(req.body.title || '전문가 퍼소나 인터뷰').slice(0, 120),
      topic: String(req.body.topic || '').slice(0, 2000),
      meeting_type: meetingType,
      place: String(req.body.place || '').slice(0, 120),
      started_at: String(req.body.startedAt || nowIso()),
      rolling_summary: '',
      round_count: 0,
      created_at: nowIso(),
      updated_at: nowIso()
    });
    res.json({ session, meetingType: meetingTypeDetails(meetingType) });
  } catch (e) { next(e); }
});

app.get('/api/sessions/:id', async (req, res, next) => {
  try {
    const studentId = requireStudentId(req.query.studentId);
    const bundle = await loadSessionBundle(req.params.id);
    checkOwner(bundle.session, studentId);
    res.json(bundle);
  } catch (e) { next(e); }
});

app.post('/api/sessions/:id/personas', async (req, res, next) => {
  try {
    const { session, personas } = await loadSessionBundle(req.params.id);
    checkOwner(session, req.body.studentId);
    if (personas.length >= cfg.maxPersonas) throw apiError(400, `퍼소나는 최대 ${cfg.maxPersonas}명까지 가능합니다.`);
    const p = await store.createPersona({
      id: id('per'),
      session_id: session.id,
      name: String(req.body.name || '무명 퍼소나').trim().slice(0, 80),
      role: String(req.body.role || '').trim().slice(0, 500),
      expertise: String(req.body.expertise || '').trim().slice(0, 1000),
      knowledge: String(req.body.knowledge || '').trim().slice(0, 1500),
      values_text: String(req.body.valuesText || req.body.values || '').trim().slice(0, 1000),
      rules: String(req.body.rules || '').trim().slice(0, 1500),
      style: String(req.body.style || '').trim().slice(0, 500),
      limits_text: String(req.body.limitsText || req.body.limits || '').trim().slice(0, 1000),
      created_at: nowIso()
    });
    res.json({ persona: p });
  } catch (e) { next(e); }
});

app.post('/api/sessions/:id/message', async (req, res, next) => {
  try {
    const student = await store.getStudent(req.body.studentId);
    if (!student) throw apiError(404, '학생 세션을 찾을 수 없습니다.');
    const { session, personas, messages } = await loadSessionBundle(req.params.id);
    checkOwner(session, student.id);
    if (await store.countMessages(session.id) >= cfg.maxMessages) throw apiError(400, `메시지는 세션당 최대 ${cfg.maxMessages}개까지 가능합니다.`);
    if (session.round_count >= cfg.maxRounds) throw apiError(400, `라운드는 최대 ${cfg.maxRounds}회까지 가능합니다. 요약을 생성하고 새 세션을 시작하세요.`);

    const content = String(req.body.content || '').trim();
    if (!content) throw apiError(400, '메시지를 입력하세요.');
    if (personas.length === 0) throw apiError(400, '퍼소나를 먼저 1명 이상 생성하세요.');

    const mode = req.body.mode === 'persona' ? 'persona' : 'shared';
    const depthKey = DEPTH_PRESETS[req.body.depth] ? req.body.depth : 'balanced';
    const expertLanguage = LANGUAGE_OPTIONS[req.body.expertLanguage] ? req.body.expertLanguage : 'ko';
    const preset = DEPTH_PRESETS[depthKey];
    const targetPersona = mode === 'persona' ? personas.find((p) => p.id === req.body.personaId) : null;
    if (mode === 'persona' && !targetPersona) throw apiError(404, '개별 대화할 퍼소나를 찾을 수 없습니다.');

    await store.createMessage({
      id: id('msg'),
      session_id: session.id,
      persona_id: targetPersona?.id || null,
      speaker: student.display_name || '사용자',
      channel: mode === 'shared' ? '공동 대화장' : '개별 질문',
      content,
      model: null,
      tokens_in: 0,
      tokens_out: 0,
      credits_charged: 0,
      created_at: nowIso()
    });

    const model = modelForDepth(depthKey);
    const system = buildSystemPrompt(session, personas, mode, targetPersona, depthKey, expertLanguage);
    const context = buildUserContext({
      session,
      messages,
      mode,
      targetPersona,
      content,
      maxContextMessages: preset.maxContextMessages
    });
    const estimatedInputTokens = roughTokens(system + context);
    const estimatedCredits = estimateMaxCreditsForCall({
      model,
      estimatedInputTokens,
      maxOutputTokens: preset.maxOutputTokens
    });
    await ensureCentralUsageAvailable(student);
    ensureCreditAvailable(student, estimatedCredits);

    const ai = await callAi({ model, system, user: context, maxOutputTokens: preset.maxOutputTokens });
    const actualCost = ai.dryRun ? { usd: 0, costUsd: 0, credits: 0, creditsToDeduct: 0, purchaseKrw: 0, krw: 0 } : costToCredits({ model: ai.model, inputTokens: ai.inputTokens, outputTokens: ai.outputTokens });
    const centralUsage = ai.dryRun ? null : await recordCentralUsage(student, { model: ai.model, inputTokens: ai.inputTokens, outputTokens: ai.outputTokens, task: 'persona_message' });
    applyCreditsToCost(actualCost, chargedCreditsFromCentralUsage(centralUsage, actualCost.creditsToDeduct));
    const chargedStudent = await store.chargeStudent(student.id, Math.min(actualCost.creditsToDeduct, student.credit_limit - student.credits_used));
    const speaker = mode === 'persona' ? targetPersona.name : '전문가 패널';
    const aiMessage = await store.createMessage({
      id: id('msg'),
      session_id: session.id,
      persona_id: targetPersona?.id || null,
      speaker,
      channel: mode === 'persona' ? '퍼소나별 대화창' : '공동 대화장',
      content: ai.text,
      model: ai.model,
      tokens_in: ai.inputTokens,
      tokens_out: ai.outputTokens,
      credits_charged: actualCost.creditsToDeduct,
      created_at: nowIso()
    });
    await store.updateSession(session.id, { round_count: session.round_count + 1 });
    res.json({
      message: aiMessage,
      usage: usagePayload(ai, actualCost, { depth: depthKey }),
      centralUsage: centralUsage?.budget || centralUsage?.usageLimit || null,
      student: chargedStudent,
      remainingCredits: chargedStudent.credit_limit - chargedStudent.credits_used
    });
  } catch (e) { next(e); }
});

app.post('/api/sessions/:id/summary', async (req, res, next) => {
  try {
    const student = await store.getStudent(req.body.studentId);
    if (!student) throw apiError(404, '학생 세션을 찾을 수 없습니다.');
    const { session, personas, messages } = await loadSessionBundle(req.params.id);
    checkOwner(session, student.id);
    const transcript = messages.map((m) => `[${m.created_at}] ${m.speaker}/${m.channel}: ${m.content}`).join('\n');
    const reportLanguage = normalizedLanguage(req.body.reportLanguage || req.body.expertLanguage);
    const system = `너는 전문가 퍼소나 인터뷰의 제출용 요약본 작성자다. 단순 압축 요약이 아니라 학생이 제출물의 초안으로 쓸 수 있는 구조화된 요약본을 작성한다. 퍼소나가 실제 인간 전문가이거나 실제 조사 결과라는 식으로 과장하지 않는다. 사실, 추정, 가치 판단, 검증 필요 주장을 분리한다. 아래 10개 항목을 반드시 같은 순서의 Markdown 제목으로 포함한다.

${summarySectionsPrompt()}

각 항목은 비어 있으면 "해당 없음" 또는 "추가 검증 필요"라고 적는다. 학생 성찰 질문은 학생이 자신의 판단 근거를 돌아보도록 2~4개 질문으로 작성한다. ${languageInstruction(reportLanguage)}`;
    const user = `회의 제목: ${session.title}
회의 종류: ${meetingTypeDetails(session.meeting_type).label}
주제: ${session.topic}

퍼소나:
${personas.map((p) => `- ${p.name}: ${p.role}`).join('\n')}

회의록:
${transcript}`;
    const maxSummaryOutputTokens = Math.min(900, cfg.maxOutputTokens);
    const estimatedCredits = estimateMaxCreditsForCall({ model: cfg.summaryModel, estimatedInputTokens: roughTokens(system + user), maxOutputTokens: maxSummaryOutputTokens });
    await ensureCentralUsageAvailable(student);
    ensureCreditAvailable(student, estimatedCredits);
    const ai = await callAi({ model: cfg.summaryModel, system, user, maxOutputTokens: maxSummaryOutputTokens });
    const actualCost = ai.dryRun ? { usd: 0, costUsd: 0, credits: 0, creditsToDeduct: 0, purchaseKrw: 0, krw: 0 } : costToCredits({ model: ai.model, inputTokens: ai.inputTokens, outputTokens: ai.outputTokens });
    const centralUsage = ai.dryRun ? null : await recordCentralUsage(student, { model: ai.model, inputTokens: ai.inputTokens, outputTokens: ai.outputTokens, task: 'persona_summary' });
    applyCreditsToCost(actualCost, chargedCreditsFromCentralUsage(centralUsage, actualCost.creditsToDeduct));
    const chargedStudent = await store.chargeStudent(student.id, Math.min(actualCost.creditsToDeduct, student.credit_limit - student.credits_used));
    await store.updateSession(session.id, { rolling_summary: ai.text });
    const msg = await store.createMessage({
      id: id('msg'),
      session_id: session.id,
      persona_id: null,
      speaker: '요약자',
      channel: '요약본',
      content: ai.text,
      model: ai.model,
      tokens_in: ai.inputTokens,
      tokens_out: ai.outputTokens,
      credits_charged: actualCost.creditsToDeduct,
      created_at: nowIso()
    });
    res.json({ summary: msg, rollingSummary: ai.text, usage: usagePayload(ai, actualCost), centralUsage: centralUsage?.budget || centralUsage?.usageLimit || null, student: chargedStudent, remainingCredits: chargedStudent.credit_limit - chargedStudent.credits_used });
  } catch (e) { next(e); }
});

app.post('/api/sessions/:id/editor', async (req, res, next) => {
  try {
    const student = await store.getStudent(req.body.studentId);
    if (!student) throw apiError(404, '학생 세션을 찾을 수 없습니다.');
    const { session, personas, messages } = await loadSessionBundle(req.params.id);
    checkOwner(session, student.id);
    if (!messages.length) throw apiError(400, '편집할 회의록이 아직 없습니다.');

    const reportLanguage = normalizedLanguage(req.body.reportLanguage || req.body.expertLanguage);
    const instruction = String(req.body.editorInstruction || '').trim().slice(0, 1200);
    const source = exportMarkdown(session, personas, messages, reportLanguage);
    const system = `너는 교육용 제출물 편집자다. 전문가 퍼소나 인터뷰 결과를 읽고 제출 가능한 보고서 초안으로 다듬는다. ${languageInstruction(reportLanguage)}

편집 규칙:
1. 원문에 없는 사실, 출처, 수치, 조사 결과를 만들지 않는다.
2. 가상 퍼소나 인터뷰라는 한계를 명시한다.
3. 사실, 추정, 가치 판단, 검증 필요 항목을 구분한다.
4. 학생이 직접 채워야 할 부분은 [학생 작성]으로 남긴다.
5. 문장과 구조를 정돈하되 퍼소나별 관점 차이를 지우지 않는다.`;
    const user = `사용자 편집 지시:
${instruction || '(특별 지시 없음. 제출용 보고서 초안으로 정리)'}

원문:
${source}`;
    const maxOutputTokens = Math.min(1200, Math.max(cfg.maxOutputTokens, 900));
    const estimatedCredits = estimateMaxCreditsForCall({ model: cfg.editorModel, estimatedInputTokens: roughTokens(system + user), maxOutputTokens });
    await ensureCentralUsageAvailable(student);
    ensureCreditAvailable(student, estimatedCredits);
    const ai = await callAi({ model: cfg.editorModel, system, user, maxOutputTokens });
    const actualCost = ai.dryRun ? { usd: 0, costUsd: 0, credits: 0, creditsToDeduct: 0, purchaseKrw: 0, krw: 0 } : costToCredits({ model: ai.model, inputTokens: ai.inputTokens, outputTokens: ai.outputTokens });
    const centralUsage = ai.dryRun ? null : await recordCentralUsage(student, { model: ai.model, inputTokens: ai.inputTokens, outputTokens: ai.outputTokens, task: 'persona_editor' });
    applyCreditsToCost(actualCost, chargedCreditsFromCentralUsage(centralUsage, actualCost.creditsToDeduct));
    const chargedStudent = await store.chargeStudent(student.id, Math.min(actualCost.creditsToDeduct, student.credit_limit - student.credits_used));
    const msg = await store.createMessage({
      id: id('msg'),
      session_id: session.id,
      persona_id: null,
      speaker: 'GPT 에디터',
      channel: '편집본',
      content: ai.text,
      model: ai.model,
      tokens_in: ai.inputTokens,
      tokens_out: ai.outputTokens,
      credits_charged: actualCost.creditsToDeduct,
      created_at: nowIso()
    });
    res.json({
      edited: msg,
      usage: usagePayload(ai, actualCost),
      centralUsage: centralUsage?.budget || centralUsage?.usageLimit || null,
      student: chargedStudent,
      remainingCredits: chargedStudent.credit_limit - chargedStudent.credits_used
    });
  } catch (e) { next(e); }
});

app.get('/api/sessions/:id/export.md', async (req, res, next) => {
  try {
    const studentId = requireStudentId(req.query.studentId);
    const student = await store.getStudent(studentId);
    if (!student) throw apiError(404, '학생 세션을 찾을 수 없습니다.');
    const { session, personas, messages } = await loadSessionBundle(req.params.id);
    checkOwner(session, studentId);
    const md = exportMarkdown(session, personas, messages, req.query.language, student);
    sendDownload(res, {
      filename: safeFileName(session.title, 'md'),
      contentType: 'text/markdown; charset=utf-8',
      body: md
    });
  } catch (e) { next(e); }
});

app.get('/api/sessions/:id/export.docx', async (req, res, next) => {
  try {
    const studentId = requireStudentId(req.query.studentId);
    const student = await store.getStudent(studentId);
    if (!student) throw apiError(404, '학생 세션을 찾을 수 없습니다.');
    const { session, personas, messages } = await loadSessionBundle(req.params.id);
    checkOwner(session, studentId);
    const md = exportMarkdown(session, personas, messages, req.query.language, student);
    const body = await buildDocxBuffer(md);
    sendDownload(res, {
      filename: safeFileName(session.title, 'docx'),
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body
    });
  } catch (e) { next(e); }
});

app.get('/api/sessions/:id/export.hwpx', async (req, res, next) => {
  try {
    const studentId = requireStudentId(req.query.studentId);
    const student = await store.getStudent(studentId);
    if (!student) throw apiError(404, '학생 세션을 찾을 수 없습니다.');
    const { session, personas, messages } = await loadSessionBundle(req.params.id);
    checkOwner(session, studentId);
    const md = exportMarkdown(session, personas, messages, req.query.language, student);
    const body = await buildHwpxBuffer(md);
    sendDownload(res, {
      filename: safeFileName(session.title, 'hwpx'),
      contentType: 'application/hwp+zip',
      body
    });
  } catch (e) { next(e); }
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || '서버 오류' });
});

await store.init();
if (process.argv.includes('--check-config')) {
  console.log(JSON.stringify({
    ok: true,
    cfg: { ...cfg, openaiKey: Boolean(cfg.openaiKey), databaseUrl: Boolean(cfg.databaseUrl), centralAuthSecret: Boolean(cfg.centralAuthSecret) }
  }, null, 2));
  process.exit(0);
}

app.listen(cfg.port, () => {
  console.log(`Persona Panel Lab listening on :${cfg.port}`);
});
