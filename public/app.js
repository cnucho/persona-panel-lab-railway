const state = {
  config: null,
  studentId: "",
  sessionId: "",
  session: null,
  messages: []
};

const $ = (id) => document.getElementById(id);

function todayLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>'"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API 오류: ${res.status}`);
  return data;
}

function renderBudget(budget) {
  if (!budget) return;
  $("budgetText").textContent = `${budget.creditsRemaining.toLocaleString()} / ${budget.creditLimit.toLocaleString()} 남음`;
  const percent = Math.max(0, Math.min(100, (budget.creditsRemaining / budget.creditLimit) * 100));
  $("budgetBar").style.width = `${percent}%`;
}

function personaDefaults() {
  return [
    {
      name: "분류 감사자",
      role: "AI 분류안이 어떤 사회적 의미를 갖는지 검토한다.",
      experience: "학교 정책과 학생 지원 제도에서 분류가 낙인으로 바뀌는 사례를 검토해 왔다.",
      knowledge: "분류는 단순 정리가 아니라 사람을 특정 이름으로 고정하는 사회적 행위다. 분류명, 기준, 이의제기 가능성이 중요하다.",
      values: "사회적 정합성, 당사자 설명권, 낙인 방지",
      rules: "정확도만으로 타당성을 판단하지 않는다. 누가 불리해지는지 반드시 묻는다.",
      limits: "실제 학생을 진단하지 않는다. 자료 없이 심리 상태를 단정하지 않는다."
    },
    {
      name: "데이터 검증자",
      role: "AI 답변의 사실, 추정, 가치 판단을 구분한다.",
      experience: "모델 결과 검증과 근거 확인 절차를 담당한다.",
      knowledge: "확인 가능한 사실, 확인 불가능한 추정, 가치 판단은 구분되어야 한다. 근거 없는 주장은 최종 판단에 쓰면 안 된다.",
      values: "진실성, 검증 가능성, 신뢰도",
      rules: "근거가 없으면 검증 필요라고 표시한다. 출처나 자료가 필요한 지점을 분리한다.",
      limits: "제공된 자료 밖의 수치를 만들지 않는다."
    },
    {
      name: "이해관계자 대변자",
      role: "정책이나 홍보 메시지가 여러 집단에게 어떻게 받아들여질지 본다.",
      experience: "학생, 교사, 학부모, 행정 담당자의 반응 차이를 비교한다.",
      knowledge: "같은 메시지도 이해관계자별로 다르게 해석된다. 수용 조건과 불신 요인을 따로 봐야 한다.",
      values: "수용성, 공정성, 설명 가능성",
      rules: "각 집단의 기대와 우려를 분리한다. 대표성의 한계를 밝힌다.",
      limits: "가상 반응을 실제 여론조사 결과처럼 말하지 않는다."
    },
    {
      name: "혁신 질문자",
      role: "현재 분류 체계와 문제 설정의 전제를 의심한다.",
      experience: "기존 제도를 단순 개선하기보다 문제의 틀을 바꾸는 질문을 만든다.",
      knowledge: "혁신은 더 강한 답을 내는 것이 아니라 문제를 보이게 만든 기존 분류 체계를 의심하는 데서 시작한다.",
      values: "창의성, 대안 가능성, 인간 중심성",
      rules: "A/B/C 분류 없이도 가능한 대안을 묻는다. 새 대안의 위험도 함께 말한다.",
      limits: "실현 불가능한 구호만 제안하지 않는다."
    }
  ];
}

function addPersonaCard(data = {}) {
  const tpl = $("personaTemplate").content.cloneNode(true);
  const card = tpl.querySelector(".persona-card");
  const i = document.querySelectorAll(".persona-card").length + 1;
  card.dataset.id = data.id || `p${i}`;
  card.querySelector(".persona-title").textContent = data.name || `퍼소나 ${i}`;
  card.querySelector(".p-name").value = data.name || "";
  card.querySelector(".p-role").value = data.role || "";
  card.querySelector(".p-experience").value = data.experience || "";
  card.querySelector(".p-knowledge").value = data.knowledge || "";
  card.querySelector(".p-values").value = data.values || "";
  card.querySelector(".p-rules").value = data.rules || "";
  card.querySelector(".p-limits").value = data.limits || "자료 없이 단정하지 않는다. 특정 집단을 고정관념으로 설명하지 않는다.";
  card.querySelector(".removePersona").addEventListener("click", () => { card.remove(); refreshPersonaSelect(); });
  card.querySelector(".p-name").addEventListener("input", (e) => { card.querySelector(".persona-title").textContent = e.target.value || "퍼소나"; refreshPersonaSelect(); });
  $("personas").appendChild(card);
  refreshPersonaSelect();
}

function getPersonas() {
  return [...document.querySelectorAll(".persona-card")].map((card, i) => ({
    id: card.dataset.id || `p${i+1}`,
    name: card.querySelector(".p-name").value || `퍼소나${i+1}`,
    role: card.querySelector(".p-role").value,
    experience: card.querySelector(".p-experience").value,
    knowledge: card.querySelector(".p-knowledge").value,
    values: card.querySelector(".p-values").value,
    rules: card.querySelector(".p-rules").value,
    limits: card.querySelector(".p-limits").value
  }));
}

function refreshPersonaSelect() {
  const select = $("personaSelect");
  const current = select.value;
  select.innerHTML = "";
  getPersonas().forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
  if ([...select.options].some(o => o.value === current)) select.value = current;
}

function renderTranscript() {
  const transcript = $("transcript");
  if (!state.messages.length) {
    transcript.innerHTML = "<p class='hint'>아직 회의록이 없습니다.</p>";
    return;
  }
  transcript.innerHTML = state.messages.map(m => `
    <div class="message">
      <div class="meta">${escapeHtml(m.created_at || "")} · ${escapeHtml(m.room || "shared")}</div>
      <strong>${escapeHtml(m.author || m.role)}</strong>
      <div>${escapeHtml(m.content || "")}</div>
    </div>
  `).join("");
  transcript.scrollTop = transcript.scrollHeight;
}

async function refreshSession() {
  if (!state.sessionId) return;
  const data = await api(`/api/sessions/${state.sessionId}`);
  state.session = data.session;
  state.messages = data.messages || [];
  renderTranscript();
}

async function refreshBudget() {
  if (!state.studentId) return;
  const budget = await api(`/api/students/${encodeURIComponent(state.studentId)}/budget`);
  renderBudget(budget);
}

async function generate(kind, body = {}) {
  if (!state.sessionId) throw new Error("먼저 회의를 시작하세요.");
  const data = await api(`/api/sessions/${state.sessionId}/generate`, {
    method: "POST",
    body: { studentId: state.studentId, kind, ...body }
  });
  renderBudget(data.budget);
  await refreshSession();
}

async function init() {
  state.config = await api("/api/config");
  const meetingSelect = $("meetingType");
  Object.entries(state.config.meetingTypes).forEach(([key, val]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = val.label;
    meetingSelect.appendChild(opt);
  });
  meetingSelect.value = "classification_validity_audit";
  $("scheduledAt").value = todayLocal();
  personaDefaults().forEach(addPersonaCard);

  $("loginBtn").addEventListener("click", async () => {
    const studentId = $("studentId").value.trim();
    if (!studentId) return alert("학생 코드를 입력하세요.");
    const data = await api("/api/students", { method: "POST", body: { studentId, displayName: $("displayName").value } });
    state.studentId = data.student.id;
    renderBudget(data.budget);
  });

  $("addPersonaBtn").addEventListener("click", () => addPersonaCard({ name: "새 퍼소나" }));

  $("createSessionBtn").addEventListener("click", async () => {
    if (!state.studentId) return alert("먼저 학생 확인을 하세요.");
    const data = await api("/api/sessions", {
      method: "POST",
      body: {
        studentId: state.studentId,
        title: $("title").value,
        topic: $("topic").value,
        meetingType: $("meetingType").value,
        place: $("place").value,
        scheduledAt: $("scheduledAt").value,
        mode: $("mode").value,
        personas: getPersonas()
      }
    });
    state.sessionId = data.session.id;
    state.session = data.session;
    $("sessionInfo").textContent = `회의가 시작되었습니다. 세션 ID: ${state.sessionId}`;
    await refreshSession();
  });

  $("sharedGenerateBtn").addEventListener("click", async () => {
    try { await generate("shared_all", { userInstruction: $("sharedInstruction").value }); } catch (e) { alert(e.message); }
  });

  $("saveManualBtn").addEventListener("click", async () => {
    if (!state.sessionId) return alert("먼저 회의를 시작하세요.");
    const content = $("manualMessage").value.trim();
    if (!content) return;
    await api(`/api/sessions/${state.sessionId}/messages`, { method: "POST", body: { studentId: state.studentId, room: "shared", role: "user", author: "학생", content } });
    $("manualMessage").value = "";
    await refreshSession();
  });

  $("personaQuestionPreset").addEventListener("change", (e) => {
    $("personaInstruction").value = e.target.value;
  });
  $("personaInstruction").value = $("personaQuestionPreset").value;

  $("personaGenerateBtn").addEventListener("click", async () => {
    try { await generate("persona_one", { personaId: $("personaSelect").value, userInstruction: $("personaInstruction").value }); } catch (e) { alert(e.message); }
  });

  $("refreshBtn").addEventListener("click", refreshSession);
  $("summaryBtn").addEventListener("click", async () => { try { await generate("summary"); } catch (e) { alert(e.message); } });
  $("reportBtn").addEventListener("click", async () => { try { await generate("report"); } catch (e) { alert(e.message); } });
}

init().catch(err => {
  console.error(err);
  alert(`초기화 오류: ${err.message}`);
});
