/* ============================================================
   ads.js — 판매자 광고 "기반" (2026-11-21 추가)

   기획서: 「악보대장 판매자 광고 시스템 기획서」 9장 "지금 만들 것".
   광고는 꺼진 상태로 시작한다. 돈이 오가는 기능(광고캐시 충전, 광고 만들기, 클릭 과금)은
   아직 없고, 약관·결제 준비가 끝나면 다음 단계에서 만든다.

   이 파일이 하는 일
   1) 광고 스위치(ad_settings 테이블) 읽기·저장 — 전체 / 악기(카테고리)별 / 베타 판매자 / 무료 신규 악보 칸
   2) 목록의 "무료 신규 악보" 칸 — 검색 결과 6번째, 악기·전체 목록 11번째 자리 (인기순일 때만)
   3) 악보 카드 노출·클릭 기록(score_events 테이블, 서버 함수 rpc_log_score_events 로만 기록)
   4) 판매자 센터 › 통계 탭 아래 카드 3개 (목록 노출·클릭 / 악보 개선 팁 / 광고 오픈 예정 안내)
   5) 관리자 화면 › "광고 설정" 탭

   다른 파일과의 연결 (각각 한두 줄, typeof 로 확인 후 호출 — ads.js 가 없어도 기존 화면은 그대로 동작)
   - common.js  load()             → loadAdSettings()
   - buyer.js   renderListPage()   → adsArrangeList()      / scoreCard(opts.slot) 로 "신규" 표시
   - buyer.js   renderBuyer()      → adsAfterBuyerRender()  (노출·클릭 기록)
   - seller.js  renderSellerStats()→ adsRenderSellerCards()
   - admin.js   "광고 설정" 탭      → renderAdminAds()

   Supabase 준비: 저장소 루트의 광고기반_2026-11-21.sql 을 SQL Editor 에서 한 번 실행.
   실행 전에는 AD_SETTINGS.ready 가 false 라서 신규 악보 칸도, 기록도 전혀 동작하지 않는다(화면 변화 없음).
   ============================================================ */

const VIEWER_KEY_STORAGE = "madi.viewer.v1"; // 노출·클릭 중복 제거용 무작위 값 (회원 정보와 무관, 서비스 데이터 아님)

const AD_POLICY = {
  // 목록에서 칸의 위치 (0부터 셈). ad: 나중에 열릴 광고 칸, new: 무료 신규 악보 칸
  slots: {
    search:   { ad: [0, 1], new: 5 },   // 검색 결과: 1~2위 광고, 6위 신규 악보
    category: { ad: [0, 1], new: 10 },  // 악기 목록: 1~2위 광고, 11위 신규 악보
    list:     { ad: [0, 1], new: 10 }   // 전체 목록
  },
  newScoreDays: 14,                     // 등록 후 며칠까지 "신규 악보"로 볼지
  openCondition: { sellers: 20, scores: 200 }, // 악기별 광고 오픈 조건 (예시값 — 기획서 10장, 대표님 결정 필요)
  impression: { ratio: 0.5, ms: 1000 }, // 카드가 절반 이상, 1초 이상 보이면 노출 1회
  flushMs: 5000,                        // 기록을 모아서 5초마다 서버로 보낸다
  // 아래는 광고 상품을 열 때 쓸 값 (지금은 쓰지 않음)
  minBid: 30,
  minDailyBudget: 3000
};

const AD_SETTINGS = {
  ready: false, error: "",
  adsEnabled: false, openInstruments: [], betaSellerIds: [], newSlotEnabled: false,
  updatedAt: null, updatedBy: null
};

/* ---------- 1. 스위치 읽기·저장 ---------- */

function adSettingsFromRow(r) {
  return {
    adsEnabled: !!r.ads_enabled,
    openInstruments: Array.isArray(r.open_instruments) ? r.open_instruments.filter(i => INSTRUMENTS.includes(i)) : [],
    betaSellerIds: Array.isArray(r.beta_seller_ids) ? r.beta_seller_ids : [],
    newSlotEnabled: !!r.new_slot_enabled,
    updatedAt: r.updated_at || null,
    updatedBy: r.updated_by || null
  };
}

async function loadAdSettings() {
  const sb = getSb();
  if (!sb) { AD_SETTINGS.ready = false; AD_SETTINGS.error = "서버 연결 없음"; return; }
  try {
    const { data, error } = await sb.from("ad_settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("ad_settings 설정 줄이 없습니다");
    Object.assign(AD_SETTINGS, adSettingsFromRow(data), { ready: true, error: "" });
  } catch (e) {
    // SQL 실행 전이면 여기로 온다 — 광고 기반 기능은 전부 꺼진 채로 둔다.
    console.warn("[ads] 광고 설정을 불러오지 못했습니다. 광고 기반 기능은 꺼진 채로 둡니다.", e);
    Object.assign(AD_SETTINGS, { ready: false, error: (e && e.message) || "불러오기 실패", adsEnabled: false, newSlotEnabled: false });
  }
}

async function saveAdSettings(next) {
  const u = getCurrentUser();
  if (!u || !u.isAdmin) return { ok: false, message: "관리자만 바꿀 수 있어요." };
  if (!AD_SETTINGS.ready) return { ok: false, message: "광고 설정 저장 공간(ad_settings 테이블)이 아직 없어요. 광고기반_2026-11-21.sql 을 Supabase에서 먼저 실행해 주세요." };
  const sb = getSb();
  if (!sb) return { ok: false, message: "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." };
  const row = {
    ads_enabled: !!next.adsEnabled,
    open_instruments: (next.openInstruments || []).filter(i => INSTRUMENTS.includes(i)),
    beta_seller_ids: [...new Set(next.betaSellerIds || [])],
    new_slot_enabled: !!next.newSlotEnabled,
    updated_at: nowISO(),
    updated_by: u.id
  };
  const { data, error } = await sb.from("ad_settings").update(row).eq("id", 1).select();
  if (error) return { ok: false, message: `저장하지 못했어요: ${error.message}` };
  if (!data || !data.length) return { ok: false, message: "저장 권한이 없어요. 서버에 관리자로 등록된 계정인지 확인해 주세요." };
  Object.assign(AD_SETTINGS, adSettingsFromRow(data[0]));
  return { ok: true };
}

/* 이 악기(카테고리)에서 광고가 열려 있는지. 지금은 광고 상품이 없어서, 켜져 있어도 채울 광고가 없다. */
function adsOpenFor(instrument) {
  return AD_SETTINGS.ready && AD_SETTINGS.adsEnabled && AD_SETTINGS.openInstruments.includes(instrument);
}

/* ---------- 2. 목록의 무료 "신규 악보" 칸 ---------- */

function adsHash(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

function adsListSurface(p) {
  return p.q ? "search" : p.instrument ? "category" : "list";
}

/* filterScores() 로 거른 전체 목록을 받아, 신규 악보 하나를 정해진 자리로 옮긴다.
   - 인기순(기본 정렬)일 때만. 구매자가 최신순·가격순 등을 고르면 그 순서를 그대로 둔다.
   - 목록이 그 자리보다 짧으면 넣지 않는다.
   - 이미 그 자리 위쪽에 있는 악보는 고르지 않는다.
   - 판매가 가장 적은 신규 악보들 중에서, 방문자·날짜마다 돌아가며 하나를 고른다.
   - 전체 목록 안에서 순서만 바꾸므로 개수·페이지 수는 그대로다.
   돌려주는 값: { list: 새 순서, slots: Map(악보 id → "new") } */
function adsArrangeList(list, p) {
  const slots = new Map();
  if (!AD_SETTINGS.ready || !AD_SETTINGS.newSlotEnabled) return { list, slots };
  if ((p.sort || "popular") !== "popular") return { list, slots };
  const surface = adsListSurface(p);
  const pos = AD_POLICY.slots[surface].new;
  if (list.length <= pos) return { list, slots };

  const above = new Set(list.slice(0, pos).map(s => s.id));
  const since = Date.now() - AD_POLICY.newScoreDays * 86400000;
  const cands = list.filter(s => !above.has(s.id) && new Date(s.approvedAt || s.createdAt).getTime() >= since);
  if (!cands.length) return { list, slots };

  const minSales = Math.min(...cands.map(s => s.salesCount || 0));
  const pool = cands.filter(s => (s.salesCount || 0) === minSales).sort((a, b) => (a.id < b.id ? -1 : 1));
  const pick = pool[adsHash(`${adsViewerKey()}|${todayKey()}|${surface}|${p.q || ""}|${p.instrument || ""}`) % pool.length];

  const out = list.filter(s => s.id !== pick.id);
  out.splice(pos, 0, pick);
  slots.set(pick.id, "new");
  return { list: out, slots };
}

/* ---------- 3. 노출·클릭 기록 ---------- */

let ADS_SESSION_KEY = null;  // localStorage 를 못 쓰는 브라우저용 (이번 접속 동안만)
let ADS_QUEUE = [];
let ADS_FLUSH_TIMER = null;
let ADS_OBSERVER = null;
const ADS_TIMERS = new Map();
let ADS_SEEN = new Set();    // 같은 화면에서 같은 카드를 두 번 세지 않도록
let ADS_ROUTE_SIG = "";

function adsViewerKey() {
  try {
    let k = localStorage.getItem(VIEWER_KEY_STORAGE);
    if (!k) {
      k = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(VIEWER_KEY_STORAGE, k);
    }
    return k;
  } catch (e) {
    if (!ADS_SESSION_KEY) ADS_SESSION_KEY = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    return ADS_SESSION_KEY;
  }
}

function adsSurfaceOf(route) {
  const page = route && route.page;
  if (page === "list") return adsListSurface(route.params || {});
  if (page === "home" || !page) return "home";
  if (page === "detail") return "detail";
  if (page === "artist") return "artist";
  return "other";
}

function adsQueue(type, scoreId, surface, slot, query) {
  if (!AD_SETTINGS.ready || !scoreId) return;
  const score = STATE && STATE.scores[scoreId];
  const me = getCurrentUser();
  if (score && me && score.sellerId === me.id) return; // 판매자 본인 것은 세지 않는다 (서버도 한 번 더 확인)
  ADS_QUEUE.push({
    type, score_id: scoreId, surface,
    slot: slot === "new" || slot === "ad" ? slot : "organic",
    query: String(query || "").slice(0, 60),
    viewer: adsViewerKey()
  });
  if (ADS_QUEUE.length >= 40) adsFlush();
  else if (!ADS_FLUSH_TIMER) ADS_FLUSH_TIMER = setTimeout(adsFlush, AD_POLICY.flushMs);
}

function adsFlush() {
  if (ADS_FLUSH_TIMER) { clearTimeout(ADS_FLUSH_TIMER); ADS_FLUSH_TIMER = null; }
  if (!ADS_QUEUE.length) return;
  const sb = getSb();
  if (!sb) return;
  const batch = ADS_QUEUE.splice(0, 50);
  sb.rpc("rpc_log_score_events", { p_events: batch }).then(({ error }) => {
    if (error) console.warn("[ads] 노출·클릭 기록 실패", error);
  });
  if (ADS_QUEUE.length) ADS_FLUSH_TIMER = setTimeout(adsFlush, AD_POLICY.flushMs);
}

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") adsFlush(); });
window.addEventListener("pagehide", adsFlush);

/* renderBuyer() 가 화면을 다 그린 뒤 부른다. 화면 안의 악보 카드를 지켜보다가
   절반 이상·1초 이상 보이면 노출, 눌러서 상세로 가면 클릭으로 기록한다. */
function adsAfterBuyerRender(el, route) {
  if (ADS_OBSERVER) { ADS_OBSERVER.disconnect(); ADS_OBSERVER = null; }
  ADS_TIMERS.forEach(t => clearTimeout(t));
  ADS_TIMERS.clear();
  if (!el || !AD_SETTINGS.ready) return;

  const surface = adsSurfaceOf(route);
  const query = route && route.page === "list" ? ((route.params || {}).q || "") : "";
  const sig = JSON.stringify([route && route.page, route && route.params]);
  if (sig !== ADS_ROUTE_SIG) { ADS_ROUTE_SIG = sig; ADS_SEEN = new Set(); }

  const cards = el.querySelectorAll(".score-card[data-score-id]");
  if (!cards.length) return;

  if ("IntersectionObserver" in window) {
    const obs = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const card = en.target;
        const id = card.dataset.scoreId;
        const slot = card.dataset.slot || "organic";
        const key = `${surface}|${id}|${slot}`;
        if (ADS_SEEN.has(key)) { obs.unobserve(card); continue; }
        if (en.isIntersecting && en.intersectionRatio >= AD_POLICY.impression.ratio) {
          if (!ADS_TIMERS.has(card)) {
            ADS_TIMERS.set(card, setTimeout(() => {
              ADS_TIMERS.delete(card);
              if (!card.isConnected || ADS_SEEN.has(key)) return;
              ADS_SEEN.add(key);
              adsQueue("impression", id, surface, slot, query);
              obs.unobserve(card);
            }, AD_POLICY.impression.ms));
          }
        } else if (ADS_TIMERS.has(card)) {
          clearTimeout(ADS_TIMERS.get(card));
          ADS_TIMERS.delete(card);
        }
      }
    }, { threshold: [0, AD_POLICY.impression.ratio] });
    cards.forEach(c => obs.observe(c));
    ADS_OBSERVER = obs;
  }

  // 카드 안의 장바구니 버튼은 클릭을 막아두었으므로(stopPropagation) 상세로 가는 클릭만 잡힌다.
  cards.forEach(card => card.addEventListener("click", () => {
    adsQueue("click", card.dataset.scoreId, surface, card.dataset.slot || "organic", query);
  }));
}

/* ---------- 4. 판매자 센터 › 통계 탭 카드 ---------- */

const ADS_SURFACE_LABEL = { search: "검색", category: "악기 목록", list: "전체 목록", home: "홈", detail: "상세 페이지", artist: "아티스트 페이지", other: "기타" };

function adsScoreTips(s) {
  const tips = [];
  if (!s.hasVideo) tips.push("연주 영상 연결하기");
  const previews = Array.isArray(s.previewUrls) ? s.previewUrls.length : (s.previewUrl ? 1 : 0);
  if (previews < 2) tips.push("미리보기 2페이지 이상 보여주기");
  if (!String(s.description || "").trim()) tips.push("악보 소개글 쓰기");
  if (!(s.tags || []).length) tips.push("태그 넣기");
  return tips;
}

function adsTipsCardHTML(myScores) {
  const rows = myScores
    .filter(s => s.status === "승인")
    .map(s => ({ s, tips: adsScoreTips(s) }))
    .filter(r => r.tips.length)
    .sort((a, b) => (b.s.viewCount || 0) - (a.s.viewCount || 0))
    .slice(0, 5);
  return `
    <div class="st-card">
      <h3>악보를 더 잘 보이게 하는 방법</h3>
      <p class="s">구매자가 믿고 고를 수 있는 악보가 검색과 목록에서 더 잘 팔려요. 광고가 열리면 광고 순위에도 반영될 예정이에요.</p>
      ${rows.length
        ? rows.map(r => `<div class="ads-tip"><button type="button" class="st-title" data-ads-go="${esc(r.s.id)}">${esc(r.s.title)}</button><span>${r.tips.map(t => esc(t)).join(" · ")}</span></div>`).join("")
        : `<p class="st-empty">판매 중인 악보가 모두 잘 갖춰져 있어요.</p>`}
    </div>`;
}

function adsComingSoonCardHTML(myScores) {
  const myInst = [...new Set(myScores.filter(s => s.status === "승인").map(s => s.instrument))];
  const open = myInst.filter(adsOpenFor);
  if (open.length) {
    return `
      <div class="st-card">
        <h3>광고</h3>
        <p class="s">${open.map(esc).join(", ")} 악보는 광고를 열 수 있는 상태예요. 광고 만들기 기능은 곧 열려요.</p>
      </div>`;
  }
  return `
    <div class="st-card">
      <h3>광고 기능을 준비하고 있어요</h3>
      <p class="s">악보를 검색 결과와 목록 맨 위에 보여주는 광고를 준비 중이에요. 열리면 공지로 알려드릴게요.
      그 전에도 새로 등록한 악보는 2주 동안 목록의 "신규" 칸에 돌아가며 무료로 소개돼요.</p>
    </div>`;
}

async function adsRenderSellerCards(el, userId, days) {
  if (!el) return;
  const myScores = Object.values(STATE.scores).filter(s => s.sellerId === userId);
  const wrap = document.createElement("div");
  wrap.className = "ads-seller";
  wrap.innerHTML = `
    <div class="st-card" id="ads-ev-card">
      <h3>목록 노출 · 클릭</h3>
      <p class="s">${AD_SETTINGS.ready ? "불러오는 중이에요…" : "노출·클릭 기록은 준비 중이에요."}</p>
    </div>
    ${adsTipsCardHTML(myScores)}
    ${adsComingSoonCardHTML(myScores)}`;
  el.appendChild(wrap);
  wrap.querySelectorAll("[data-ads-go]").forEach(b => b.addEventListener("click", () => { showView("buyer"); goBuyer("detail", { id: b.dataset.adsGo }); }));
  if (!AD_SETTINGS.ready) return;

  const sb = getSb();
  let rows = null, failed = false;
  try {
    const { data, error } = await sb.rpc("rpc_my_score_event_stats", { p_days: days || 0 });
    if (error) throw error;
    rows = data || [];
  } catch (e) {
    console.warn("[ads] 노출·클릭 통계를 불러오지 못했습니다.", e);
    failed = true;
  }
  const card = wrap.querySelector("#ads-ev-card");
  if (!card || !card.isConnected) return; // 기다리는 사이 화면이 다시 그려졌으면 그만둔다

  const periodName = days ? `최근 ${days}일` : "전체 기간";
  if (failed) {
    card.innerHTML = `<h3>목록 노출 · 클릭</h3><p class="st-empty">지금은 불러오지 못했어요. 잠시 후 다시 열어 주세요.</p>`;
    return;
  }
  const by = {};
  const bySurface = {};
  for (const r of rows) {
    const imp = Number(r.impressions || 0), clk = Number(r.clicks || 0);
    const x = by[r.score_id] || (by[r.score_id] = { imp: 0, clk: 0, newImp: 0 });
    x.imp += imp; x.clk += clk;
    if (r.slot_type === "new") x.newImp += imp;
    const sf = bySurface[r.surface] || (bySurface[r.surface] = { imp: 0, clk: 0 });
    sf.imp += imp; sf.clk += clk;
  }
  const totImp = Object.values(by).reduce((a, x) => a + x.imp, 0);
  const totClk = Object.values(by).reduce((a, x) => a + x.clk, 0);
  const pct = (c, i) => (i ? `${((c / i) * 100).toFixed(1)}%` : "-");
  const list = Object.entries(by)
    .map(([id, x]) => ({ s: STATE.scores[id], ...x }))
    .filter(r => r.s)
    .sort((a, b) => b.imp - a.imp || b.clk - a.clk)
    .slice(0, 20);

  card.innerHTML = `
    <h3>목록 노출 · 클릭 <span class="ads-dim">(${periodName})</span></h3>
    <p class="s">구매자 화면에서 악보 카드가 절반 이상, 1초 넘게 보이면 노출 1회, 눌러서 상세 페이지로 들어가면 클릭 1회예요. 같은 사람이 30분 안에 반복한 것과 내가 본 것은 세지 않아요.</p>
    ${totImp || totClk ? `
    <div class="ads-kpis">
      <div><span>노출</span><b>${totImp.toLocaleString("ko-KR")}회</b></div>
      <div><span>클릭</span><b>${totClk.toLocaleString("ko-KR")}회</b></div>
      <div><span>클릭률</span><b>${pct(totClk, totImp)}</b></div>
    </div>
    <p class="ads-surf">${Object.entries(bySurface).sort((a, b) => b[1].imp - a[1].imp).map(([k, v]) => `${esc(ADS_SURFACE_LABEL[k] || k)} ${v.imp.toLocaleString("ko-KR")}회`).join(" · ")}</p>
    <div class="st-tbl-wrap"><table class="st-tbl">
      <thead><tr><th>악보</th><th>노출</th><th>클릭</th><th>클릭률</th><th>신규 칸 노출</th></tr></thead>
      <tbody>${list.map(r => `<tr>
        <td><button type="button" class="st-title" data-ads-go="${esc(r.s.id)}">${esc(r.s.title)}</button><small>${esc(r.s.artist)}</small></td>
        <td>${r.imp.toLocaleString("ko-KR")}</td><td>${r.clk.toLocaleString("ko-KR")}</td><td>${pct(r.clk, r.imp)}</td>
        <td>${r.newImp ? r.newImp.toLocaleString("ko-KR") : `<span class="st-dim">-</span>`}</td></tr>`).join("")}</tbody>
    </table></div>`
    : `<p class="st-empty">아직 기록이 없어요. 구매자가 목록에서 내 악보를 보기 시작하면 여기에 쌓여요.</p>`}`;
  card.querySelectorAll("[data-ads-go]").forEach(b => b.addEventListener("click", () => { showView("buyer"); goBuyer("detail", { id: b.dataset.adsGo }); }));
}

/* ---------- 5. 관리자 화면 › 광고 설정 탭 ---------- */

let ADS_ADMIN_DRAFT = null;   // 저장 전 고치는 중인 설정
let ADS_ADMIN_BUSY = false;
let ADS_ADMIN_MSG = null;     // { text, error }
let ADS_ADMIN_SUMMARY = null; // 최근 7일 노출·클릭 요약 (null = 아직 안 불러옴)

function adsInstrumentStats() {
  const out = {};
  for (const inst of INSTRUMENTS) out[inst] = { sellers: new Set(), scores: 0 };
  for (const s of Object.values(STATE.scores)) {
    if (s.status !== "승인" || !out[s.instrument]) continue;
    out[s.instrument].scores += 1;
    out[s.instrument].sellers.add(s.sellerId);
  }
  return out;
}

function adsFindSeller(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  const sellers = Object.values(STATE.users).filter(u => u.role === "seller" || u.role === "both");
  return sellers.find(u => (u.email || "").toLowerCase() === t)
    || sellers.find(u => ((u.sellerInfo && u.sellerInfo.displayName) || u.name || "").trim().toLowerCase() === t)
    || null;
}

async function adsLoadAdminSummary() {
  const sb = getSb();
  if (!sb || !AD_SETTINGS.ready) { ADS_ADMIN_SUMMARY = []; return; }
  try {
    const { data, error } = await sb.rpc("rpc_admin_score_event_summary", { p_days: 7 });
    if (error) throw error;
    ADS_ADMIN_SUMMARY = data || [];
  } catch (e) {
    console.warn("[ads] 관리자 노출·클릭 요약을 불러오지 못했습니다.", e);
    ADS_ADMIN_SUMMARY = [];
  }
}

function renderAdminAds(body) {
  if (!body) return;
  if (!ADS_ADMIN_DRAFT) {
    ADS_ADMIN_DRAFT = {
      adsEnabled: AD_SETTINGS.adsEnabled, newSlotEnabled: AD_SETTINGS.newSlotEnabled,
      openInstruments: [...AD_SETTINGS.openInstruments], betaSellerIds: [...AD_SETTINGS.betaSellerIds]
    };
  }
  const d = ADS_ADMIN_DRAFT;
  const dis = ADS_ADMIN_BUSY || !AD_SETTINGS.ready ? "disabled" : "";
  const changed = d.adsEnabled !== AD_SETTINGS.adsEnabled || d.newSlotEnabled !== AD_SETTINGS.newSlotEnabled
    || [...d.openInstruments].sort().join("|") !== [...AD_SETTINGS.openInstruments].sort().join("|")
    || [...d.betaSellerIds].sort().join("|") !== [...AD_SETTINGS.betaSellerIds].sort().join("|");
  const stats = adsInstrumentStats();
  const cond = AD_POLICY.openCondition;
  const sellerLabel = id => { const u = STATE.users[id]; return u ? `${(u.sellerInfo && u.sellerInfo.displayName) || u.name} (${u.email || "이메일 없음"})` : `알 수 없는 회원 (${id})`; };
  const summary = ADS_ADMIN_SUMMARY || [];
  const sumImp = summary.reduce((a, r) => a + Number(r.impressions || 0), 0);
  const sumClk = summary.reduce((a, r) => a + Number(r.clicks || 0), 0);
  const slotName = { organic: "일반", new: "신규 칸", ad: "광고" };

  body.innerHTML = `
    ${AD_SETTINGS.ready ? "" : `<div class="ct-warn">광고 설정 저장 공간(ad_settings 테이블)이 아직 없어요. 저장소의 <b>광고기반_2026-11-21.sql</b> 을 Supabase SQL Editor에서 한 번 실행하면 바로 쓸 수 있어요. 그 전에는 신규 악보 칸과 노출·클릭 기록이 모두 꺼져 있어요.</div>`}
    ${ADS_ADMIN_MSG ? `<div class="sm-msg ${ADS_ADMIN_MSG.error ? "is-error" : ""}" style="margin-bottom:12px;">${esc(ADS_ADMIN_MSG.text)}</div>` : ""}

    <div style="${ADMIN_PANEL}">
      <h2 style="margin:0 0 4px;font-size:17px;">광고 스위치</h2>
      <p style="margin:0 0 8px;font-size:13px;color:var(--muted);line-height:1.6;">광고 상품(광고캐시 충전·광고 만들기)은 아직 없어서, 광고를 켜도 구매자 화면에는 광고가 나오지 않아요. 판매자가 충분히 모인 악기부터 켜는 용도예요.</p>
      <label class="ads-switch"><input type="checkbox" id="ads-enabled" ${d.adsEnabled ? "checked" : ""} ${dis}>
        <span><b>광고 전체 스위치</b><small>끄면 모든 악기의 광고가 한 번에 멈춰요(비상 정지).</small></span></label>
      <label class="ads-switch"><input type="checkbox" id="ads-newslot" ${d.newSlotEnabled ? "checked" : ""} ${dis}>
        <span><b>무료 "신규 악보" 칸</b><small>인기순 목록의 검색 결과 6번째, 악기·전체 목록 11번째 자리에 등록 ${AD_POLICY.newScoreDays}일 이내 악보를 돌아가며 보여줘요. 광고가 아니라서 "광고" 표시 없이 "신규"로 보여요.</small></span></label>
    </div>

    <div style="${ADMIN_PANEL}">
      <h2 style="margin:0 0 4px;font-size:17px;">악기별 광고 열기</h2>
      <p style="margin:0 0 10px;font-size:13px;color:var(--muted);line-height:1.6;">오픈 조건(예시): 판매자 ${cond.sellers}명 이상, 판매 중 악보 ${cond.scores}개 이상. 조건은 참고용이고, 여는 것은 직접 체크해서 저장해야 해요. 전체 스위치가 꺼져 있으면 체크해도 열리지 않아요.</p>
      <div class="st-tbl-wrap"><table class="st-tbl">
        <thead><tr><th>악기</th><th>판매자</th><th>판매 중 악보</th><th>오픈 조건</th><th>광고 열기</th></tr></thead>
        <tbody>${INSTRUMENTS.map(inst => {
          const st = stats[inst];
          const ok = st.sellers.size >= cond.sellers && st.scores >= cond.scores;
          return `<tr><td>${esc(inst)}</td><td>${st.sellers.size}명</td><td>${st.scores}개</td>
            <td><span class="ads-pill ${ok ? "ok" : ""}">${ok ? "충족" : "미충족"}</span></td>
            <td><input type="checkbox" data-ads-inst="${esc(inst)}" ${d.openInstruments.includes(inst) ? "checked" : ""} ${dis} aria-label="${esc(inst)} 광고 열기"></td></tr>`;
        }).join("")}</tbody>
      </table></div>
    </div>

    <div style="${ADMIN_PANEL}">
      <h2 style="margin:0 0 4px;font-size:17px;">베타 판매자</h2>
      <p style="margin:0 0 10px;font-size:13px;color:var(--muted);line-height:1.6;">광고 만들기 기능이 생기면, 악기가 아직 닫혀 있어도 여기 등록한 판매자만 먼저 시험해볼 수 있어요.</p>
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <input class="field" id="ads-beta-input" placeholder="판매자 이메일 또는 활동명" style="flex:1;min-width:0;" ${dis}>
        <button type="button" class="btn btn-small" id="ads-beta-add" ${dis}>추가</button>
      </div>
      ${d.betaSellerIds.length
        ? `<div class="ads-beta-list">${d.betaSellerIds.map(id => `<span class="filter-pill">${esc(sellerLabel(id))} <button type="button" data-ads-beta-del="${esc(id)}" aria-label="빼기" ${dis}><span class="ico ico-x"></span></button></span>`).join("")}</div>`
        : `<p class="st-empty" style="margin:0;">등록된 베타 판매자가 없어요.</p>`}
    </div>

    <div style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:16px;">
      <button type="button" class="btn btn-small" id="ads-cancel" ${changed && !ADS_ADMIN_BUSY ? "" : "disabled"}>되돌리기</button>
      <button type="button" class="btn btn-small btn-primary" id="ads-save" ${changed && !dis ? "" : "disabled"}>${ADS_ADMIN_BUSY ? "저장 중…" : "변경 내용 저장"}</button>
    </div>

    <div style="${ADMIN_PANEL}">
      <h2 style="margin:0 0 4px;font-size:17px;">노출 · 클릭 (최근 7일)</h2>
      <p style="margin:0 0 10px;font-size:13px;color:var(--muted);line-height:1.6;">구매자 화면의 악보 카드 노출(절반 이상·1초 이상)과 상세 페이지로 들어간 클릭이에요. 광고 오픈 시점을 정하는 참고 자료예요.</p>
      ${!AD_SETTINGS.ready ? `<p class="st-empty" style="margin:0;">SQL 실행 후에 기록이 쌓여요.</p>`
        : ADS_ADMIN_SUMMARY === null ? `<p class="st-empty" style="margin:0;">불러오는 중이에요…</p>`
        : summary.length ? `
        <div class="ads-kpis">
          <div><span>노출</span><b>${sumImp.toLocaleString("ko-KR")}회</b></div>
          <div><span>클릭</span><b>${sumClk.toLocaleString("ko-KR")}회</b></div>
          <div><span>클릭률</span><b>${sumImp ? ((sumClk / sumImp) * 100).toFixed(1) + "%" : "-"}</b></div>
        </div>
        <div class="st-tbl-wrap"><table class="st-tbl">
          <thead><tr><th>위치</th><th>칸</th><th>노출</th><th>클릭</th><th>클릭률</th></tr></thead>
          <tbody>${summary.slice().sort((a, b) => Number(b.impressions) - Number(a.impressions)).map(r => `<tr>
            <td>${esc(ADS_SURFACE_LABEL[r.surface] || r.surface)}</td><td>${esc(slotName[r.slot_type] || r.slot_type)}</td>
            <td>${Number(r.impressions).toLocaleString("ko-KR")}</td><td>${Number(r.clicks).toLocaleString("ko-KR")}</td>
            <td>${Number(r.impressions) ? ((Number(r.clicks) / Number(r.impressions)) * 100).toFixed(1) + "%" : "-"}</td></tr>`).join("")}</tbody>
        </table></div>`
        : `<p class="st-empty" style="margin:0;">아직 기록이 없어요.</p>`}
    </div>`;

  const rerender = () => renderAdminAds(body);
  document.getElementById("ads-enabled")?.addEventListener("change", e => { d.adsEnabled = e.target.checked; ADS_ADMIN_MSG = null; rerender(); });
  document.getElementById("ads-newslot")?.addEventListener("change", e => { d.newSlotEnabled = e.target.checked; ADS_ADMIN_MSG = null; rerender(); });
  body.querySelectorAll("[data-ads-inst]").forEach(cb => cb.addEventListener("change", () => {
    const inst = cb.dataset.adsInst;
    d.openInstruments = cb.checked ? [...new Set([...d.openInstruments, inst])] : d.openInstruments.filter(i => i !== inst);
    ADS_ADMIN_MSG = null; rerender();
  }));
  const addBeta = () => {
    const input = document.getElementById("ads-beta-input");
    const u = adsFindSeller(input && input.value);
    if (!u) { ADS_ADMIN_MSG = { text: "그 이메일이나 활동명의 판매자를 찾지 못했어요.", error: true }; rerender(); return; }
    if (d.betaSellerIds.includes(u.id)) { ADS_ADMIN_MSG = { text: "이미 등록된 판매자예요.", error: true }; rerender(); return; }
    d.betaSellerIds = [...d.betaSellerIds, u.id];
    ADS_ADMIN_MSG = null; rerender();
  };
  document.getElementById("ads-beta-add")?.addEventListener("click", addBeta);
  document.getElementById("ads-beta-input")?.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); addBeta(); } });
  body.querySelectorAll("[data-ads-beta-del]").forEach(b => b.addEventListener("click", () => {
    d.betaSellerIds = d.betaSellerIds.filter(id => id !== b.dataset.adsBetaDel);
    ADS_ADMIN_MSG = null; rerender();
  }));
  document.getElementById("ads-cancel")?.addEventListener("click", () => { ADS_ADMIN_DRAFT = null; ADS_ADMIN_MSG = null; rerender(); });
  document.getElementById("ads-save")?.addEventListener("click", async () => {
    ADS_ADMIN_BUSY = true; ADS_ADMIN_MSG = null; rerender();
    const res = await saveAdSettings(d);
    ADS_ADMIN_BUSY = false;
    if (res.ok) { ADS_ADMIN_DRAFT = null; ADS_ADMIN_MSG = { text: "저장했어요.", error: false }; }
    else ADS_ADMIN_MSG = { text: res.message, error: true };
    rerender();
  });

  if (ADS_ADMIN_SUMMARY === null && AD_SETTINGS.ready) {
    adsLoadAdminSummary().then(() => { if (body.isConnected && ADMIN_TAB === "ads") rerender(); });
  }
}
