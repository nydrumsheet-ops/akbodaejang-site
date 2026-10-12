/* ============================================================
   buyer.js — 스토어(구매자) 화면. 로그인 없이도 둘러볼 수 있다.
   "구매자/" 모드(또는 총괄/)에서 작업합니다.

   페이지: 홈 / 악보 목록(검색·필터) / 악보 상세 / 아티스트 / 장바구니 /
          마이페이지(내 악보함·포인트·찜·구독·최근 본) / 신청곡
   계정이 필요한 버튼은 requireLogin() 으로 감싸서, 로그인 후 하던 일을 이어간다.
   ============================================================ */

let BUYER_ROUTE = { page: "home", params: {} };
let HOME_POP = { period: 7, instrument: "" };
let HERO_TIMER = null;
let REVIEW_DRAFT = { rating: 0 };
const PAGE_SIZE = 20;

const INSTRUMENT_ICON = {
  "드럼": "🥁", "기타": "🎸", "피아노": "🎹", "베이스": "🎸",
  "우쿨렐레": "🪕", "칼림바": "🎶", "리코더": "🪈"
};

/* ---------- 일러스트 (직접 그린 SVG — 외부 이미지 없이 어디서든 보임) ---------- */

const INST_THEME = {
  "드럼":   { tint: "#fff1e9", ink: "#ff6b3d", soft: "#ffd9c7" },
  "기타":   { tint: "#fff7dc", ink: "#f2a10c", soft: "#ffe7a3" },
  "피아노": { tint: "#eef1ff", ink: "#4f6bed", soft: "#cfd8ff" },
  "베이스": { tint: "#f4eeff", ink: "#8b5cf6", soft: "#ddd0ff" },
  "우쿨렐레": { tint: "#e9f9f0", ink: "#14a35a", soft: "#bfeed3" },
  "칼림바": { tint: "#e7f8fc", ink: "#0ea5c6", soft: "#b8ebf6" },
  "리코더": { tint: "#fdeef6", ink: "#e0569a", soft: "#f9cbe2" }
};

function themeOf(inst) {
  return INST_THEME[inst] || { tint: "#f1f5f3", ink: "#14a35a", soft: "#d5ece0" };
}

function hashStr(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

function instArt(inst) {
  const t = themeOf(inst);
  const c = t.ink, s = t.soft;
  const wrap = (body) => `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">${body}</svg>`;
  switch (inst) {
    case "드럼": return wrap(`
      <ellipse cx="44" cy="13" rx="15" ry="3.5" fill="#ffc94d"/><rect x="43" y="13" width="2" height="16" fill="#c9a33a"/>
      <rect x="12" y="30" width="40" height="18" rx="2" fill="${c}"/>
      <ellipse cx="32" cy="48" rx="20" ry="5" fill="${c}" opacity=".85"/>
      <ellipse cx="32" cy="30" rx="20" ry="5" fill="#fff" stroke="${c}" stroke-width="2"/>
      <path d="M16 34 L22 46 M28 35 L32 47 M40 35 L36 47 M48 34 L42 46" stroke="#fff" stroke-width="1.6" opacity=".7"/>
      <path d="M10 8 L30 28" stroke="#8a5a3c" stroke-width="3" stroke-linecap="round"/>
      <path d="M54 22 L36 29" stroke="#8a5a3c" stroke-width="3" stroke-linecap="round"/>`);
    case "기타": return wrap(`
      <rect x="30" y="4" width="6" height="30" rx="2" fill="#8a5a3c"/>
      <rect x="28" y="2" width="10" height="7" rx="2" fill="#5d3b26"/>
      <circle cx="33" cy="44" r="15" fill="${c}"/><circle cx="33" cy="30" r="10" fill="${c}"/>
      <circle cx="33" cy="39" r="4.5" fill="#5d3b26"/><rect x="26" y="50" width="14" height="3" rx="1.5" fill="#5d3b26"/>
      <path d="M32 6 V51 M34 6 V51" stroke="#fff" stroke-width=".6" opacity=".8"/>`);
    case "피아노": return wrap(`
      <rect x="6" y="16" width="52" height="34" rx="5" fill="${c}"/>
      <rect x="10" y="26" width="44" height="20" rx="2" fill="#fff"/>
      ${[0,1,2,3,4,5,6].map(i => `<rect x="${10 + i * 6.3}" y="26" width="6.3" height="20" fill="none" stroke="${s}" stroke-width=".8"/>`).join("")}
      ${[0,1,3,4,5].map(i => `<rect x="${14.3 + i * 6.3}" y="26" width="3.6" height="12" rx="1" fill="#2b2f45"/>`).join("")}
      <circle cx="16" cy="21" r="1.6" fill="#fff"/><circle cx="22" cy="21" r="1.6" fill="#fff" opacity=".6"/>`);
    case "베이스": return wrap(`
      <rect x="30" y="2" width="5" height="34" rx="2" fill="#5d3b26"/>
      <path d="M22 34 C14 40 16 58 30 58 C40 58 50 52 46 42 C44 36 40 34 36 34 Z" fill="${c}"/>
      <rect x="27" y="44" width="12" height="3" rx="1.5" fill="#2e1f5c"/><rect x="27" y="50" width="12" height="2" rx="1" fill="#2e1f5c"/>
      <path d="M31.5 4 V47 M33.5 4 V47" stroke="#fff" stroke-width=".6" opacity=".8"/>
      ${[8,14,20].map(y => `<circle cx="38" cy="${y}" r="1.6" fill="#c9a33a"/>`).join("")}`);
    case "우쿨렐레": return wrap(`
      <rect x="30" y="6" width="5" height="26" rx="2" fill="#8a5a3c"/>
      <circle cx="32.5" cy="45" r="12" fill="${c}"/><circle cx="32.5" cy="33" r="8" fill="${c}"/>
      <circle cx="32.5" cy="40" r="3.6" fill="#0f5c35"/><rect x="27" y="50" width="11" height="2.4" rx="1.2" fill="#0f5c35"/>
      <path d="M31.5 8 V51 M33.5 8 V51" stroke="#fff" stroke-width=".6" opacity=".8"/>
      <path d="M50 10 l2 4 4 .6-3 3 .8 4-3.8-2-3.8 2 .8-4-3-3 4-.6z" fill="#ffc94d"/>`);
    case "칼림바": return wrap(`
      <path d="M10 24 L54 24 L50 56 L14 56 Z" fill="${c}"/>
      <circle cx="32" cy="44" r="5" fill="#0b6f86"/>
      ${[0,1,2,3,4,5,6,7].map(i => { const x = 15 + i * 4.9; const h = 18 - Math.abs(i - 3.5) * 3; return `<rect x="${x}" y="${30 - h}" width="2.6" height="${h + 6}" rx="1.2" fill="#e8eef0" stroke="#9fb5bb" stroke-width=".5"/>`; }).join("")}
      <rect x="12" y="28" width="40" height="3" rx="1.5" fill="#0b6f86"/>`);
    case "리코더": return wrap(`
      <g transform="rotate(-35 32 32)">
        <rect x="26" y="2" width="12" height="60" rx="6" fill="${c}"/>
        <rect x="26" y="2" width="12" height="9" rx="4" fill="#b83a78"/>
        ${[20,27,34,41,48].map(y => `<circle cx="32" cy="${y}" r="2.1" fill="#7a1f4c"/>`).join("")}
      </g>
      <path d="M8 14 c3-6 9-6 9 0 v10" stroke="${c}" stroke-width="2" fill="none"/><circle cx="14" cy="25" r="3" fill="${c}"/>`);
    default: return wrap(`<circle cx="24" cy="44" r="8" fill="${c}"/><rect x="30" y="10" width="3" height="34" fill="${c}"/><path d="M33 10 q12 4 10 16" stroke="${c}" stroke-width="3" fill="none"/>`);
  }
}

/* 악보 첫 페이지처럼 보이는 그림 (곡 제목마다 음표 위치가 달라짐) */
function sheetArt(seedText, ink, rows) {
  const n = rows || 3;
  let h = hashStr(seedText);
  const rand = () => { h = (Math.imul(h, 1103515245) + 12345) >>> 0; return h / 4294967296; };
  let body = "";
  for (let r = 0; r < n; r++) {
    const top = 18 + r * 26;
    for (let l = 0; l < 5; l++) body += `<line x1="6" x2="114" y1="${top + l * 3.2}" y2="${top + l * 3.2}" stroke="#cfd5d2" stroke-width=".6"/>`;
    for (let b = 1; b < 4; b++) body += `<line x1="${6 + b * 27}" x2="${6 + b * 27}" y1="${top}" y2="${top + 12.8}" stroke="#cfd5d2" stroke-width=".6"/>`;
    for (let k = 0; k < 9; k++) {
      const x = 12 + k * 11.5 + rand() * 3;
      const y = top + Math.floor(rand() * 9) * 1.6;
      const fill = k % 4 === 0 ? ink : "#3b4240";
      body += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="2.1" ry="1.5" fill="${fill}" transform="rotate(-20 ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
      body += `<line x1="${(x + 1.9).toFixed(1)}" x2="${(x + 1.9).toFixed(1)}" y1="${y.toFixed(1)}" y2="${(y - 8).toFixed(1)}" stroke="${fill}" stroke-width=".7"/>`;
    }
  }
  return `<svg viewBox="0 0 120 ${18 + n * 26}" preserveAspectRatio="xMidYMin meet" aria-hidden="true" focusable="false">
    <rect x="30" y="5" width="60" height="3.2" rx="1.6" fill="#3b4240" opacity=".75"/>
    <rect x="45" y="10" width="30" height="2" rx="1" fill="#9aa39f"/>${body}</svg>`;
}

function heroArt(kind) {
  const note = (x, y, c, s) => `<g transform="translate(${x} ${y}) scale(${s || 1})"><ellipse cx="0" cy="14" rx="6" ry="4.5" fill="${c}" transform="rotate(-20 0 14)"/><rect x="4.6" y="-8" width="2.4" height="22" fill="${c}"/><path d="M7 -8 q10 4 8 14 q-2-6-8-7z" fill="${c}"/></g>`;
  if (kind === 1) {
    return `<svg viewBox="0 0 320 220" aria-hidden="true" focusable="false">
      <circle cx="250" cy="40" r="26" fill="#ffd34d" opacity=".9"/>
      <ellipse cx="80" cy="70" rx="44" ry="7" fill="#ffc94d"/><rect x="78" y="70" width="4" height="70" fill="#b8924a"/>
      <ellipse cx="250" cy="96" rx="40" ry="6" fill="#ffc94d"/><rect x="248" y="96" width="4" height="60" fill="#b8924a"/>
      <circle cx="165" cy="150" r="58" fill="#ff6b3d"/><circle cx="165" cy="150" r="46" fill="#fff"/><circle cx="165" cy="150" r="46" fill="none" stroke="#ffd9c7" stroke-width="6"/>
      <text x="165" y="158" text-anchor="middle" font-size="22" font-weight="800" fill="#ff6b3d" font-family="sans-serif">MADI</text>
      <rect x="92" y="104" width="44" height="26" rx="4" fill="#4f6bed"/><ellipse cx="114" cy="104" rx="22" ry="6" fill="#dfe5ff"/>
      <rect x="196" y="104" width="44" height="26" rx="4" fill="#4f6bed"/><ellipse cx="218" cy="104" rx="22" ry="6" fill="#dfe5ff"/>
      <path d="M40 40 L110 98" stroke="#8a5a3c" stroke-width="6" stroke-linecap="round"/>
      <path d="M300 70 L232 100" stroke="#8a5a3c" stroke-width="6" stroke-linecap="round"/>
      ${note(36, 120, "#14a35a", 1.1)}${note(282, 150, "#8b5cf6", .9)}${note(198, 22, "#ff6b3d", .8)}
    </svg>`;
  }
  if (kind === 2) {
    return `<svg viewBox="0 0 320 220" aria-hidden="true" focusable="false">
      <rect x="70" y="30" width="150" height="180" rx="10" fill="#fff" stroke="#ffd9c7" stroke-width="3" transform="rotate(-6 145 120)"/>
      <rect x="100" y="24" width="150" height="180" rx="10" fill="#fff" stroke="#e7e2dd" stroke-width="2"/>
      ${[0,1,2,3].map(r => [0,1,2,3,4].map(l => `<line x1="114" x2="236" y1="${60 + r * 34 + l * 4}" y2="${60 + r * 34 + l * 4}" stroke="#d9dedb" stroke-width="1"/>`).join("")).join("")}
      <rect x="130" y="38" width="90" height="6" rx="3" fill="#3b4240" opacity=".7"/>
      <circle cx="262" cy="70" r="32" fill="#ff6b3d"/><path d="M262 54 v32 M246 70 h32" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
      <path d="M40 120 c-14-14 6-30 16-16 c10-14 30 2 16 16 l-16 16z" fill="#e0569a"/>
      ${note(60, 40, "#4f6bed", 1)}${note(276, 140, "#14a35a", 1.1)}
    </svg>`;
  }
  return `<svg viewBox="0 0 320 220" aria-hidden="true" focusable="false">
    <rect x="40" y="150" width="240" height="8" rx="4" fill="#cfd8ff"/>
    ${[[70, 60], [120, 90], [170, 120], [220, 150]].map(([x, h], i) => `<rect x="${x}" y="${150 - h}" width="34" height="${h}" rx="6" fill="${["#cfd8ff", "#a9b8ff", "#7d93f5", "#4f6bed"][i]}"/>`).join("")}
    <path d="M70 100 L120 76 L170 60 L240 24" stroke="#ff6b3d" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M226 18 L246 22 L238 40" stroke="#ff6b3d" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${[0, 1, 2].map(i => `<ellipse cx="270" cy="${186 - i * 10}" rx="26" ry="8" fill="#ffc94d" stroke="#e0a91e" stroke-width="2"/>`).join("")}
    <text x="270" y="170" text-anchor="middle" font-size="12" font-weight="800" fill="#a07510" font-family="sans-serif">₩</text>
    <circle cx="44" cy="54" r="20" fill="#14a35a"/><path d="M36 54 l6 6 12-12" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${note(296, 70, "#8b5cf6", .9)}
  </svg>`;
}

function avatarStyle(name) {
  const palette = [["#ffe1d4", "#e2552b"], ["#dfe5ff", "#3d56d6"], ["#e1f6ea", "#0f8a4a"], ["#f3e8ff", "#7a45e0"], ["#fff1c9", "#b27b00"], ["#dff5fb", "#0a89a6"], ["#fde3ef", "#c53d82"]];
  const [bg, fg] = palette[hashStr(name) % palette.length];
  return `background:${bg};color:${fg};`;
}

/* ---------- 이동 ---------- */

function goBuyer(page, params, opts) {
  BUYER_ROUTE = { page, params: params || {} };
  if (page === "detail" && params && params.id) recordView(params.id);
  if (page === "detail") REVIEW_DRAFT = { rating: 0 };
  if (CURRENT_VIEW !== "buyer") {
    showView("buyer");
  } else {
    renderBuyer();
    renderHeaderAuth();
  }
  if (!(opts && opts.keepScroll)) window.scrollTo({ top: 0 });
}

function updateMenuHighlight() {
  const { page, params } = BUYER_ROUTE;
  let key = "";
  if (page === "home") key = "home";
  else if (page === "requests") key = "requests";
  else if (page === "list") {
    if (params.video && !params.instrument) key = "video";
    else if (params.instrument && !params.video) key = params.instrument;
    else if (params.sort === "latest" && !params.q && !params.instrument) key = "new";
  }
  setActiveMenu(key);
}

/* ---------- 작은 조각들 ---------- */

function sellerName(id) {
  const u = STATE.users[id];
  return u ? u.name : "알 수 없음";
}

function initialOf(name) {
  const t = String(name || "?").replace(/^데모\s*/, "");
  return esc(t.slice(0, 1));
}

function starsText(avg) {
  const full = Math.round(avg);
  return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
}

function approvedScores() {
  return Object.values(STATE.scores).filter(s => s.status === "승인");
}

function scoreCard(s, opts) {
  const o = opts || {};
  const user = getCurrentUser();
  const wished = user && user.wishlist.includes(s.id);
  const r = getScoreRating(s.id);
  return `
    <div class="score-card" data-score-id="${s.id}">
      <div class="thumb" style="--tint:${themeOf(s.instrument).tint};--ink:${themeOf(s.instrument).ink};">
        ${o.rank ? `<span class="rank-num ${o.rank <= 3 ? "top" : ""}">${o.rank}</span>` : ""}
        <button type="button" class="wish-btn ${wished ? "on" : ""}" data-wish="${s.id}" aria-label="찜하기">${wished ? "♥" : "♡"}</button>
        <div class="paper">${sheetArt(s.title, themeOf(s.instrument).ink, 3)}</div>
        <div class="thumb-art">${instArt(s.instrument)}</div>
        ${s.hasVideo ? `<span class="video-flag">▶ 연주영상</span>` : ""}
      </div>
      <div class="card-body">
        <div class="tags">
          <span class="tag">${esc(s.instrument)}</span>
          <span class="tag tag-diff">${esc(s.difficulty)}</span>
          ${s.isOriginal ? `<span class="tag tag-orig">오리지널</span>` : ""}
        </div>
        <div class="card-title">${esc(s.title)}</div>
        <div class="card-artist">${esc(s.artist)}</div>
        <div class="card-seller"><span class="avatar" style="${avatarStyle(sellerName(s.sellerId))}">${initialOf(sellerName(s.sellerId))}</span>${esc(sellerName(s.sellerId))}</div>
        <div class="card-foot">
          <span class="price">${formatPoint(s.price)}</span>
          ${r.count ? `<span class="rating"><b>★</b> ${r.avg} (${r.count})</span>` : `<span class="rating">조회 ${s.viewCount}</span>`}
        </div>
      </div>
    </div>
  `;
}

function bindCards(root) {
  if (!root) return;
  root.querySelectorAll("[data-wish]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.wish;
      requireLogin(() => {
        const res = toggleWishlist(getCurrentUser().id, id);
        if (!res.ok) { toast(res.message, true); return; }
        toast(res.added ? "찜 목록에 담았어요" : "찜을 해제했어요");
        renderBuyer();
        renderHeaderAuth();
      });
    });
  });
  root.querySelectorAll("[data-score-id]").forEach(card => {
    card.addEventListener("click", () => goBuyer("detail", { id: card.dataset.scoreId }));
  });
  root.querySelectorAll("[data-artist-id]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      goBuyer("artist", { id: el.dataset.artistId });
    });
  });
  root.querySelectorAll("[data-go]").forEach(el => {
    el.addEventListener("click", () => {
      const [page, key, value] = el.dataset.go.split(":");
      const params = {};
      if (key) params[key] = value === "true" ? true : value;
      goBuyer(page, params);
    });
  });
}

/* ---------- 렌더 진입점 ---------- */

function renderBuyer() {
  const el = document.getElementById("view-buyer");
  if (!el) return;
  if (HERO_TIMER) { clearInterval(HERO_TIMER); HERO_TIMER = null; }

  const { page, params } = BUYER_ROUTE;
  if (page === "list") renderListPage(el, params);
  else if (page === "detail") renderDetailPage(el, params);
  else if (page === "artist") renderArtistPage(el, params);
  else if (page === "cart") renderCartPage(el);
  else if (page === "mypage") renderMyPage(el, params);
  else if (page === "requests") renderRequestsPage(el);
  else renderHomePage(el);

  updateMenuHighlight();
}
/* ============================================================
   홈
   ============================================================ */

function renderHomePage(el) {
  const user = getCurrentUser();
  const recent = getRecentViewed().map(id => STATE.scores[id]).filter(s => s && s.status === "승인");
  const videoScores = approvedScores()
    .filter(s => s.hasVideo)
    .sort((a, b) => (a.instrument === "드럼" ? -1 : 0) - (b.instrument === "드럼" ? -1 : 0) || b.salesCount - a.salesCount)
    .slice(0, 10);
  const latest = approvedScores().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);
  const artists = Object.values(STATE.users)
    .filter(u => u.sellerInfo && getSellerStats(u.id).scoreCount > 0)
    .sort((a, b) => getSellerStats(b.id).sales - getSellerStats(a.id).sales)
    .slice(0, 4);
  const requests = Object.values(STATE.requests)
    .filter(r => r.status !== "완료")
    .sort((a, b) => b.buyerIds.length - a.buyerIds.length)
    .slice(0, 3);

  el.innerHTML = `
    <div class="hero" id="hero">
      <div class="hero-track" id="hero-track">
        <div class="hero-slide slide-1">
          <div class="hero-text">
          <div class="eyebrow">드럼 악보는 영상과 함께</div>
          <h2>연주 영상을 보고 바로 따라 치는<br>드럼 악보</h2>
          <p>▶ 연주영상 표시가 있는 악보는 판매 아티스트가 직접 연주한 영상을 함께 볼 수 있어요.</p>
          <button class="btn btn-primary" data-go="list:video:true">연주영상 악보 보기</button>
          </div>
          <div class="hero-art">${heroArt(1)}</div>
        </div>
        <div class="hero-slide slide-2">
          <div class="hero-text">
          <div class="eyebrow">찾는 악보가 없다면</div>
          <h2>신청곡을 올려주세요</h2>
          <p>1건에 ${formatPoint(POLICY.request.pointCost)}. 신청이 많은 곡부터 채보하고, 완성되면 신청한 분은 무료로 받아요.</p>
          <button class="btn btn-accent" data-go="requests">신청곡 보러가기</button>
          </div>
          <div class="hero-art">${heroArt(2)}</div>
        </div>
        <div class="hero-slide slide-3">
          <div class="hero-text">
          <div class="eyebrow">아티스트 모집</div>
          <h2>내 악보를 올리고<br>판매 금액의 ${Math.round((1 - POLICY.commission.normal) * 100)}%를 정산받으세요</h2>
          <p>적립금이 ${formatWon(POLICY.settlement.minWithdraw)} 이상이면 매달 ${POLICY.settlement.payoutDay}일 신청 없이 자동으로 입금돼요.</p>
          <button class="btn" id="hero-artist-btn" style="background:#2c5bd6;border-color:#2c5bd6;color:#fff;">아티스트로 시작하기</button>
          </div>
          <div class="hero-art">${heroArt(3)}</div>
        </div>
      </div>
      <div class="hero-dots" id="hero-dots">
        <button class="hero-dot active" data-slide="0" aria-label="첫 번째 배너"></button>
        <button class="hero-dot" data-slide="1" aria-label="두 번째 배너"></button>
        <button class="hero-dot" data-slide="2" aria-label="세 번째 배너"></button>
      </div>
    </div>

    <div class="quick-row">
      ${INSTRUMENTS.map(i => `<button class="quick-item" data-go="list:instrument:${esc(i)}"><span class="q-icon" style="background:${themeOf(i).tint};">${instArt(i)}</span>${esc(i)}</button>`).join("")}
      <button class="quick-item" data-go="list:video:true"><span class="q-icon" style="background:#fff1e9;font-size:26px;">🎬</span>연주영상</button>
      <button class="quick-item" data-go="requests"><span class="q-icon" style="background:#fdeef6;font-size:26px;">🙋</span>신청곡</button>
    </div>

    ${recent.length ? `
      <div class="section">
        <div class="section-head"><h2>최근 본 악보</h2></div>
        <div class="score-row">${recent.slice(0, 8).map(s => scoreCard(s)).join("")}</div>
      </div>` : ""}

    <div class="section">
      <div class="section-head">
        <h2>🏆 인기 악보</h2>
        <button class="more-link" data-go="list:sort:popular">전체 보기 ›</button>
      </div>
      <div class="chip-row" style="margin-bottom:8px;">
        ${[[7, "주간"], [30, "월간"], [0, "누적"]].map(([d, label]) => `<button class="chip ${HOME_POP.period === d ? "active" : ""}" data-pop-period="${d}">${label}</button>`).join("")}
        <span style="width:8px;flex-shrink:0;"></span>
        ${["", ...INSTRUMENTS].map(i => `<button class="chip ${HOME_POP.instrument === i ? "active" : ""}" data-pop-inst="${esc(i)}">${i ? esc(i) : "전체 악기"}</button>`).join("")}
      </div>
      <div id="pop-row"></div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2>🎬 연주 영상이 있는 악보</h2>
        <button class="more-link" data-go="list:video:true">더 보기 ›</button>
      </div>
      ${videoScores.length ? `<div class="score-row">${videoScores.map(s => scoreCard(s)).join("")}</div>` : `<div class="empty">아직 연주 영상이 있는 악보가 없어요.</div>`}
    </div>

    <div class="section">
      <div class="section-head">
        <h2>최신 악보</h2>
        <button class="more-link" data-go="list:sort:latest">더 보기 ›</button>
      </div>
      ${latest.length ? `
        <div class="table-wrap">
          <table class="list-table">
            <thead><tr><th>곡 제목</th><th class="hide-m">가수</th><th>아티스트</th><th>악기</th><th class="hide-m">난이도</th><th style="text-align:right;">가격</th></tr></thead>
            <tbody>
              ${latest.map(s => `
                <tr data-score-id="${s.id}">
                  <td><b>${esc(s.title)}</b> ${s.hasVideo ? `<span class="tag" style="background:#fdeee4;color:var(--accent);">▶ 영상</span>` : ""}</td>
                  <td class="hide-m muted">${esc(s.artist)}</td>
                  <td><span data-artist-id="${s.sellerId}" style="cursor:pointer;text-decoration:underline;text-underline-offset:3px;">${esc(sellerName(s.sellerId))}</span></td>
                  <td>${esc(s.instrument)}</td>
                  <td class="hide-m">${esc(s.difficulty)}</td>
                  <td style="text-align:right;font-weight:700;white-space:nowrap;">${formatPoint(s.price)}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>` : `<div class="empty">아직 등록된 악보가 없어요.</div>`}
    </div>

    <div class="section">
      <div class="section-head"><h2>지금 뜨는 아티스트</h2></div>
      ${artists.length ? `<div class="artist-grid">${artists.map(a => artistCard(a)).join("")}</div>` : `<div class="empty">아직 악보를 올린 아티스트가 없어요.</div>`}
    </div>

    <div class="section">
      <div class="section-head">
        <h2>🙋 신청곡 순위</h2>
        <button class="more-link" data-go="requests">신청하러 가기 ›</button>
      </div>
      <div class="panel">
        ${requests.length ? requests.map((r, i) => `
          <div class="req-item">
            <div class="req-count"><b>${r.buyerIds.length}</b><span>명 신청</span></div>
            <div class="row-main" style="flex:1;">
              <div class="row-title" style="cursor:default;">${i + 1}. ${esc(r.title)}</div>
              <div class="row-sub">${esc(r.artist)} · ${esc(r.instrument)}</div>
            </div>
            <span class="status-pill st-${esc(r.status)}">${esc(r.status)}</span>
          </div>`).join("") : `<p class="muted" style="margin:0;">아직 신청곡이 없어요. 첫 번째로 신청해보세요.</p>`}
      </div>
    </div>

    <div class="section info-banners">
      <div class="info-banner ib-1" id="ib-guide">
        <h3>처음이세요? 이용 방법</h3>
        <p>포인트 충전 → 악보 구매 → 내 악보함에서 다운로드. 1P는 1원이고 ${POLICY.point.expiryYears}년 동안 쓸 수 있어요.</p>
      </div>
      <div class="info-banner ib-2" data-go="mypage:tab:points">
        <h3>환불 안내</h3>
        <p>구매 후 ${POLICY.refund.windowDays}일 이내, 파일을 한 번도 열지 않았다면 포인트로 전액 환불돼요.</p>
      </div>
      <div class="info-banner ib-3" id="ib-artist">
        <h3>아티스트 가입</h3>
        <p>직접 채보·편곡한 악보를 판매하세요. 창작·오리지널 편곡은 수수료가 더 낮아요.</p>
      </div>
    </div>
  `;

  bindCards(el);
  renderPopRow();
  setupHero();

  el.querySelectorAll("[data-pop-period]").forEach(b => b.addEventListener("click", () => {
    HOME_POP.period = Number(b.dataset.popPeriod);
    el.querySelectorAll("[data-pop-period]").forEach(x => x.classList.toggle("active", x === b));
    renderPopRow();
  }));
  el.querySelectorAll("[data-pop-inst]").forEach(b => b.addEventListener("click", () => {
    HOME_POP.instrument = b.dataset.popInst;
    el.querySelectorAll("[data-pop-inst]").forEach(x => x.classList.toggle("active", x === b));
    renderPopRow();
  }));
  document.getElementById("hero-artist-btn")?.addEventListener("click", startArtist);
  document.getElementById("ib-artist")?.addEventListener("click", startArtist);
  document.getElementById("ib-guide")?.addEventListener("click", () => {
    requireLogin(() => goBuyer("mypage", { tab: "points" }));
  });
}

function startArtist() {
  const user = getCurrentUser();
  if (user && (user.role === "seller" || user.role === "both")) { showView("seller"); window.scrollTo({ top: 0 }); return; }
  openLoginModal("seller");
}

function renderPopRow() {
  const wrap = document.getElementById("pop-row");
  if (!wrap) return;
  const list = getPopularScores(HOME_POP.period || null, HOME_POP.instrument).slice(0, 10);
  wrap.innerHTML = list.length
    ? `<div class="score-row">${list.map((s, i) => scoreCard(s, { rank: i + 1 })).join("")}</div>`
    : `<div class="empty">이 조건의 악보가 아직 없어요.</div>`;
  bindCards(wrap);
}

function setupHero() {
  const track = document.getElementById("hero-track");
  const dots = document.querySelectorAll("#hero-dots .hero-dot");
  if (!track) return;
  let idx = 0;
  const go = (i) => {
    idx = i;
    track.style.transform = `translateX(-${i * 100}%)`;
    dots.forEach((d, k) => d.classList.toggle("active", k === i));
  };
  dots.forEach(d => d.addEventListener("click", () => { go(Number(d.dataset.slide)); restart(); }));
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const restart = () => {
    if (HERO_TIMER) clearInterval(HERO_TIMER);
    if (!reduce) HERO_TIMER = setInterval(() => go((idx + 1) % dots.length), 5000);
  };
  restart();
}

function artistCard(u) {
  const st = getSellerStats(u.id);
  const top = approvedScores().filter(s => s.sellerId === u.id).sort((a, b) => b.salesCount - a.salesCount).slice(0, 3);
  return `
    <div class="artist-card" data-artist-id="${u.id}">
      <div class="artist-top">
        <span class="avatar" style="${avatarStyle(u.name)}">${initialOf(u.name)}</span>
        <div>
          <div class="artist-name">${esc(u.name)}</div>
          <div class="artist-meta">악보 ${st.scoreCount} · 구독자 ${st.followers}</div>
        </div>
      </div>
      <div class="artist-songs">${top.map(s => `<span>· ${esc(s.title)}</span>`).join("")}</div>
    </div>
  `;
}
/* ============================================================
   악보 목록 (검색·필터)
   ============================================================ */

function filterScores(p) {
  const q = (p.q || "").trim().toLowerCase();
  let list = approvedScores();
  if (q) {
    list = list.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.artist.toLowerCase().includes(q) ||
      sellerName(s.sellerId).toLowerCase().includes(q)
    );
  }
  if (p.instrument) list = list.filter(s => s.instrument === p.instrument);
  if (p.difficulty) list = list.filter(s => s.difficulty === p.difficulty);
  if (p.video) list = list.filter(s => s.hasVideo);
  if (p.original) list = list.filter(s => s.isOriginal);
  if (p.minPrice) list = list.filter(s => s.price >= Number(p.minPrice));
  if (p.maxPrice) list = list.filter(s => s.price <= Number(p.maxPrice));

  const sort = p.sort || "popular";
  const byDate = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
  if (sort === "latest") list.sort(byDate);
  else if (sort === "priceLow") list.sort((a, b) => a.price - b.price || byDate(a, b));
  else if (sort === "priceHigh") list.sort((a, b) => b.price - a.price || byDate(a, b));
  else if (sort === "views") list.sort((a, b) => b.viewCount - a.viewCount);
  else if (sort === "rating") list.sort((a, b) => getScoreRating(b.id).avg - getScoreRating(a.id).avg || b.salesCount - a.salesCount);
  else list.sort((a, b) => b.salesCount - a.salesCount || b.viewCount - a.viewCount);
  return list;
}

function renderListPage(el, p) {
  const list = filterScores(p);
  const pageNo = Math.max(1, Number(p.page) || 1);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const current = Math.min(pageNo, pages);
  const shown = list.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  let title = "전체 악보";
  if (p.q) title = `"${esc(p.q)}" 검색 결과`;
  else if (p.instrument && p.video) title = `${esc(p.instrument)} 연주영상 악보`;
  else if (p.instrument) title = `${esc(p.instrument)} 악보`;
  else if (p.video) title = "연주 영상이 있는 악보";
  else if (p.sort === "latest") title = "신규 악보";

  const update = (patch) => goBuyer("list", Object.assign({}, p, patch, { page: 1 }), { keepScroll: true });

  el.innerHTML = `
    <div class="breadcrumb"><button data-go="home">홈</button> › ${title}</div>
    <h1 class="page-title">${title}</h1>
    <p class="muted" style="margin:0 0 16px;">${list.length}개의 악보${p.q ? ` <button class="more-link" id="clear-q">검색어 지우기 ✕</button>` : ""}</p>

    <div class="panel filter-panel">
      <div class="filter-line">
        <span class="filter-label">악기</span>
        <div class="chip-row">
          ${["", ...INSTRUMENTS].map(i => `<button class="chip ${(p.instrument || "") === i ? "active" : ""}" data-f-inst="${esc(i)}">${i ? `${INSTRUMENT_ICON[i]} ${esc(i)}` : "전체"}</button>`).join("")}
        </div>
      </div>
      <div class="filter-line">
        <span class="filter-label">난이도</span>
        <div class="chip-row">
          ${["", ...DIFFICULTIES].map(d => `<button class="chip ${(p.difficulty || "") === d ? "active" : ""}" data-f-diff="${esc(d)}">${d ? esc(d) : "전체"}</button>`).join("")}
        </div>
      </div>
      <div class="filter-line" style="flex-wrap:wrap;">
        <span class="filter-label">조건</span>
        <label class="toggle"><input type="checkbox" id="f-video" ${p.video ? "checked" : ""}> ▶ 연주영상 있음</label>
        <label class="toggle"><input type="checkbox" id="f-orig" ${p.original ? "checked" : ""}> 오리지널 편곡</label>
        <span style="display:inline-flex;align-items:center;gap:6px;">
          <input class="toolbar field" style="width:90px;" type="number" min="0" step="500" id="f-min" placeholder="최소P" value="${esc(p.minPrice || "")}">
          ~
          <input class="toolbar field" style="width:90px;" type="number" min="0" step="500" id="f-max" placeholder="최대P" value="${esc(p.maxPrice || "")}">
          <button class="btn btn-small" id="f-price">가격 적용</button>
        </span>
      </div>
    </div>

    <div class="toolbar">
      <span class="muted">${list.length ? `${(current - 1) * PAGE_SIZE + 1}–${(current - 1) * PAGE_SIZE + shown.length} / ${list.length}` : ""}</span>
      <select id="f-sort" aria-label="정렬">
        ${[["popular", "인기순"], ["latest", "최신순"], ["priceLow", "낮은 가격순"], ["priceHigh", "높은 가격순"], ["views", "조회순"], ["rating", "별점순"]]
          .map(([v, l]) => `<option value="${v}" ${(p.sort || "popular") === v ? "selected" : ""}>${l}</option>`).join("")}
      </select>
    </div>

    ${shown.length
      ? `<div class="score-grid">${shown.map(s => scoreCard(s)).join("")}</div>`
      : `<div class="empty">
           <p style="margin:0 0 10px;">조건에 맞는 악보가 없어요.</p>
           <button class="btn btn-small" id="go-request">이 곡 신청하기</button>
         </div>`}

    ${pages > 1 ? `<div class="pager">${Array.from({ length: pages }, (_, i) => `<button class="${i + 1 === current ? "active" : ""}" data-page="${i + 1}">${i + 1}</button>`).join("")}</div>` : ""}
  `;

  bindCards(el);
  el.querySelectorAll("[data-f-inst]").forEach(b => b.addEventListener("click", () => update({ instrument: b.dataset.fInst })));
  el.querySelectorAll("[data-f-diff]").forEach(b => b.addEventListener("click", () => update({ difficulty: b.dataset.fDiff })));
  document.getElementById("f-video")?.addEventListener("change", (e) => update({ video: e.target.checked }));
  document.getElementById("f-orig")?.addEventListener("change", (e) => update({ original: e.target.checked }));
  document.getElementById("f-sort")?.addEventListener("change", (e) => update({ sort: e.target.value }));
  document.getElementById("f-price")?.addEventListener("click", () => update({
    minPrice: document.getElementById("f-min").value, maxPrice: document.getElementById("f-max").value
  }));
  document.getElementById("clear-q")?.addEventListener("click", () => {
    const input = document.getElementById("header-search");
    if (input) input.value = "";
    update({ q: "" });
  });
  document.getElementById("go-request")?.addEventListener("click", () => goBuyer("requests", { prefill: p.q || "" }));
  el.querySelectorAll("[data-page]").forEach(b => b.addEventListener("click", () => goBuyer("list", Object.assign({}, p, { page: Number(b.dataset.page) }))));

  const input = document.getElementById("header-search");
  if (input && document.activeElement !== input) input.value = p.q || "";
}
/* ============================================================
   악보 상세
   ============================================================ */

function renderDetailPage(el, p) {
  const s = STATE.scores[p.id];
  if (!s || s.status !== "승인") {
    el.innerHTML = `<div class="empty"><p>판매 중인 악보가 아니에요.</p><button class="btn" data-go="home">홈으로</button></div>`;
    bindCards(el);
    return;
  }
  const user = getCurrentUser();
  const seller = STATE.users[s.sellerId];
  const st = getSellerStats(s.sellerId);
  const rating = getScoreRating(s.id);
  const bought = user && hasPurchased(user.id, s.id);
  const own = user && user.id === s.sellerId;
  const inCart = user && user.cart.includes(s.id);
  const wished = user && user.wishlist.includes(s.id);
  const following = user && user.following.includes(s.sellerId);
  const reviews = Object.values(STATE.reviews).filter(r => r.scoreId === s.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const reviewed = user && reviews.some(r => r.buyerId === user.id);

  const sameSeller = approvedScores().filter(x => x.sellerId === s.sellerId && x.id !== s.id).sort((a, b) => b.salesCount - a.salesCount).slice(0, 8);

  // 함께 구매한 악보: 이 악보를 산 사람들이 같이 산 다른 악보
  const buyerIds = new Set(Object.values(STATE.purchases).filter(x => x.scoreId === s.id && !x.refunded).map(x => x.buyerId));
  const co = {};
  for (const x of Object.values(STATE.purchases)) {
    if (x.refunded || x.scoreId === s.id || !buyerIds.has(x.buyerId)) continue;
    co[x.scoreId] = (co[x.scoreId] || 0) + 1;
  }
  let together = Object.keys(co).map(id => STATE.scores[id]).filter(x => x && x.status === "승인")
    .sort((a, b) => co[b.id] - co[a.id]).slice(0, 8);
  if (together.length < 4) {
    const extra = getPopularScores(null, s.instrument).filter(x => x.id !== s.id && !together.includes(x)).slice(0, 8 - together.length);
    together = together.concat(extra);
  }

  let buyArea;
  if (own) {
    buyArea = `<div class="panel" style="margin-top:14px;background:#fbfcfb;">내가 등록한 악보예요. 판매 현황은 판매자 센터에서 볼 수 있어요.</div>`;
  } else if (bought) {
    buyArea = `
      <div class="buy-row" style="grid-template-columns:1fr;">
        <button class="btn btn-primary" id="d-library">✓ 구매 완료 · 내 악보함에서 받기</button>
      </div>`;
  } else {
    buyArea = `
      <div class="buy-row">
        <button class="btn btn-primary" id="d-buy">바로 구매</button>
        <button class="btn" id="d-cart">${inCart ? "장바구니 보기" : "장바구니 담기"}</button>
        <button class="btn wish-big" id="d-wish" style="color:${wished ? "var(--accent)" : "var(--text)"};">${wished ? "♥ 찜함" : "♡ 찜"}</button>
      </div>
      ${user ? `<p class="buy-note">보유 포인트 <b>${formatPoint(user.points)}</b>${user.points < s.price ? ` · <span style="color:var(--danger);">${formatPoint(s.price - user.points)} 부족</span>` : ""}</p>` : ""}`;
  }

  el.innerHTML = `
    <div class="breadcrumb">
      <button data-go="home">홈</button> › <button data-go="list:instrument:${esc(s.instrument)}">${esc(s.instrument)}</button> › ${esc(s.title)}
    </div>

    <div class="detail-grid">
      <div>
        <div class="preview-box" style="background:${themeOf(s.instrument).tint};">
          <div class="preview-sheet">
            <div class="ps-title">${esc(s.title)}</div>
            <div class="ps-sub">${esc(s.artist)} · ${esc(s.instrument)} · arr. ${esc(sellerName(s.sellerId))}</div>
            <div class="ps-svg">${sheetArt(s.title + s.id, themeOf(s.instrument).ink, 4)}</div>
            <div class="ps-fade"></div>
            <div class="ps-lock">🔒 첫 ${POLICY.preview.bars}마디 이후는 구매 후 볼 수 있어요</div>
          </div>
          <p class="preview-note">미리보기는 악보 첫 ${POLICY.preview.bars}마디까지 보여요. 실제 악보 이미지는 파일 업로드가 연결되면 이 자리에 나옵니다.</p>
        </div>
        ${s.hasVideo ? `
          <a class="video-card" href="${esc(s.videoUrl || "#")}" target="_blank" rel="noopener">
            <span class="video-play">▶</span>
            <span><span class="vc-title">연주 영상 보기</span><br><span class="vc-sub">${esc(sellerName(s.sellerId))}님이 직접 연주한 영상 (새 창으로 열려요)</span></span>
          </a>` : ""}
      </div>

      <div>
        <div class="tags">
          <span class="tag">${esc(s.instrument)}</span>
          <span class="tag tag-diff">${esc(s.difficulty)}</span>
          ${s.isOriginal ? `<span class="tag tag-orig">창작·오리지널 편곡</span>` : ""}
          ${s.hasVideo ? `<span class="tag" style="background:#fdeee4;color:var(--accent);">▶ 연주영상</span>` : ""}
        </div>
        <h1 class="detail-title" style="margin-top:8px;">${esc(s.title)}</h1>
        <div class="detail-artist">${esc(s.artist)}</div>
        <div class="rating" style="margin-top:6px;">
          ${rating.count ? `<span class="stars">${starsText(rating.avg)}</span> ${rating.avg} · 리뷰 ${rating.count}개` : "아직 리뷰가 없어요"}
        </div>

        <div class="seller-box">
          <span class="avatar" style="width:40px;height:40px;font-size:15px;${avatarStyle(seller ? seller.name : "")}">${initialOf(seller ? seller.name : "")}</span>
          <div style="flex:1;min-width:0;">
            <div class="sb-name" data-artist-id="${s.sellerId}">${esc(sellerName(s.sellerId))} ›</div>
            <div class="sb-meta">악보 ${st.scoreCount} · 누적 판매 ${st.sales} · 구독자 ${st.followers}</div>
          </div>
          ${own ? "" : `<button class="btn btn-small ${following ? "" : "btn-primary"}" id="d-follow">${following ? "구독중" : "+ 구독"}</button>`}
        </div>

        <table class="info-table">
          <tr><th>악기</th><td>${esc(s.instrument)}</td></tr>
          <tr><th>난이도</th><td>${esc(s.difficulty)}</td></tr>
          <tr><th>편곡 구분</th><td>${s.isOriginal ? "창작·오리지널 편곡" : "일반 편곡"}</td></tr>
          <tr><th>파일</th><td>PDF</td></tr>
          <tr><th>등록일</th><td>${formatDate(s.approvedAt || s.createdAt)}</td></tr>
          <tr><th>조회 · 판매</th><td>${s.viewCount.toLocaleString("ko-KR")}회 · ${s.salesCount}건</td></tr>
        </table>

        <div class="price-big">${formatPoint(s.price)}</div>
        ${buyArea}
        <p class="buy-note">구매 후 ${POLICY.refund.windowDays}일 이내, 파일을 열지 않았다면 포인트로 전액 환불돼요. 구매한 악보는 마이페이지 › 내 악보함에서 언제든 다시 받을 수 있어요.</p>
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2>악보 소개</h2></div>
      <div class="panel desc-box">${s.description ? esc(s.description) : `<span class="muted">판매 아티스트가 아직 소개를 쓰지 않았어요.</span>`}</div>
    </div>

    <div class="section" id="review-section">
      <div class="section-head"><h2>구매 후기 ${reviews.length ? `<span class="muted" style="font-size:14px;">${reviews.length}</span>` : ""}</h2></div>
      <div class="panel">
        ${bought && !reviewed ? `
          <div style="padding-bottom:14px;margin-bottom:6px;border-bottom:1px solid var(--border);">
            <div style="font-weight:700;margin-bottom:6px;">이 악보 어떠셨어요?</div>
            <div class="star-pick" id="star-pick">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" class="${REVIEW_DRAFT.rating >= n ? "on" : ""}" aria-label="${n}점">★</button>`).join("")}</div>
            <div style="display:flex;gap:8px;margin:8px 0;flex-wrap:wrap;align-items:center;">
              <span class="muted" style="font-size:12px;">체감 난이도</span>
              <select class="field" id="rv-diff" style="width:auto;"><option value="">선택 안 함</option>${DIFFICULTIES.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("")}</select>
            </div>
            <textarea class="field" id="rv-text" placeholder="연주해보니 어땠는지 다른 분들께 알려주세요 (5글자 이상)"></textarea>
            <div style="text-align:right;margin-top:8px;"><button class="btn btn-primary btn-small" id="rv-submit">후기 등록</button></div>
          </div>` : ""}
        ${reviews.length ? reviews.map(r => `
          <div class="review">
            <div class="review-head">
              <span class="stars">${starsText(r.rating)}</span>
              <b style="color:var(--text);">${esc(sellerName(r.buyerId))}</b>
              <span>구매자</span>
              ${r.feltDifficulty ? `<span>체감 난이도 ${esc(r.feltDifficulty)}</span>` : ""}
              <span>${formatDate(r.createdAt)}</span>
            </div>
            <div style="margin-top:6px;line-height:1.6;">${esc(r.text)}</div>
          </div>`).join("") : `<p class="muted" style="margin:0;">${bought ? "" : "구매한 분만 후기를 남길 수 있어요. "}첫 후기를 기다리고 있어요.</p>`}
      </div>
    </div>

    ${sameSeller.length ? `
      <div class="section">
        <div class="section-head">
          <h2>${esc(sellerName(s.sellerId))}님의 다른 악보</h2>
          <button class="more-link" data-artist-id="${s.sellerId}">아티스트 페이지 ›</button>
        </div>
        <div class="score-row">${sameSeller.map(x => scoreCard(x)).join("")}</div>
      </div>` : ""}

    ${together.length ? `
      <div class="section">
        <div class="section-head"><h2>함께 많이 산 악보</h2></div>
        <div class="score-row">${together.map(x => scoreCard(x)).join("")}</div>
      </div>` : ""}
  `;

  bindCards(el);

  document.getElementById("d-buy")?.addEventListener("click", () => requireLogin(() => {
    const u = getCurrentUser();
    if (hasPurchased(u.id, s.id)) { renderBuyer(); return; }
    if (u.points < s.price) {
      toast(`포인트가 ${formatPoint(s.price - u.points)} 부족해요. 충전 화면으로 이동합니다.`, true);
      goBuyer("mypage", { tab: "points", back: s.id });
      return;
    }
    const res = purchaseScore(u.id, s.id);
    if (!res.ok) { toast(res.message, true); renderBuyer(); return; }
    toast(`"${s.title}" 구매 완료! 내 악보함에서 받을 수 있어요.`);
    renderBuyer();
    renderHeaderAuth();
  }));
  document.getElementById("d-cart")?.addEventListener("click", () => requireLogin(() => {
    const u = getCurrentUser();
    if (u.cart.includes(s.id)) { goBuyer("cart"); return; }
    const res = addToCart(u.id, s.id);
    if (!res.ok) { toast(res.message, true); renderBuyer(); return; }
    toast("장바구니에 담았어요");
    renderBuyer();
    renderHeaderAuth();
  }));
  document.getElementById("d-wish")?.addEventListener("click", () => requireLogin(() => {
    const res = toggleWishlist(getCurrentUser().id, s.id);
    if (!res.ok) { toast(res.message, true); return; }
    toast(res.added ? "찜 목록에 담았어요" : "찜을 해제했어요");
    renderBuyer();
  }));
  document.getElementById("d-follow")?.addEventListener("click", () => requireLogin(() => {
    const res = toggleFollow(getCurrentUser().id, s.sellerId);
    if (!res.ok) { toast(res.message, true); return; }
    toast(res.added ? `${sellerName(s.sellerId)}님을 구독했어요` : "구독을 취소했어요");
    renderBuyer();
  }));
  document.getElementById("d-library")?.addEventListener("click", () => goBuyer("mypage", { tab: "library" }));

  document.querySelectorAll("#star-pick [data-star]").forEach(b => b.addEventListener("click", () => {
    REVIEW_DRAFT.rating = Number(b.dataset.star);
    document.querySelectorAll("#star-pick [data-star]").forEach(x => x.classList.toggle("on", Number(x.dataset.star) <= REVIEW_DRAFT.rating));
  }));
  document.getElementById("rv-submit")?.addEventListener("click", () => {
    const res = submitReview(getCurrentUser().id, s.id, {
      rating: REVIEW_DRAFT.rating,
      feltDifficulty: document.getElementById("rv-diff").value,
      text: document.getElementById("rv-text").value
    });
    if (!res.ok) { toast(res.message, true); return; }
    toast("후기를 등록했어요. 고마워요!");
    REVIEW_DRAFT = { rating: 0 };
    renderBuyer();
  });

  if (p.focus === "review") document.getElementById("review-section")?.scrollIntoView({ block: "start" });
}
/* ============================================================
   아티스트 페이지
   ============================================================ */

function renderArtistPage(el, p) {
  const u = STATE.users[p.id];
  if (!u || !u.sellerInfo) {
    el.innerHTML = `<div class="empty"><p>아티스트를 찾을 수 없어요.</p><button class="btn" data-go="home">홈으로</button></div>`;
    bindCards(el);
    return;
  }
  const me = getCurrentUser();
  const st = getSellerStats(u.id);
  const following = me && me.following.includes(u.id);
  const sort = p.sort || "popular";
  const inst = p.instrument || "";
  let list = approvedScores().filter(s => s.sellerId === u.id);
  const instruments = [...new Set(list.map(s => s.instrument))];
  if (inst) list = list.filter(s => s.instrument === inst);
  if (sort === "latest") list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  else if (sort === "priceLow") list.sort((a, b) => a.price - b.price);
  else list.sort((a, b) => b.salesCount - a.salesCount);
  const videoCount = approvedScores().filter(s => s.sellerId === u.id && s.hasVideo).length;

  el.innerHTML = `
    <div class="breadcrumb"><button data-go="home">홈</button> › 아티스트 › ${esc(u.name)}</div>
    <div class="artist-hero">
      <span class="avatar lg" style="${avatarStyle(u.name)}">${initialOf(u.name)}</span>
      <div style="flex:1;min-width:200px;">
        <h1>${esc(u.name)}</h1>
        <div class="stat-row">
          <span>악보 <b>${st.scoreCount}</b></span>
          <span>누적 판매 <b>${st.sales}</b></span>
          <span>구독자 <b>${st.followers}</b></span>
          <span>연주영상 <b>${videoCount}</b></span>
        </div>
      </div>
      ${me && me.id === u.id ? `<span class="muted">내 아티스트 페이지</span>` : `<button class="btn ${following ? "" : "btn-primary"}" id="a-follow">${following ? "✓ 구독중" : "+ 구독하기"}</button>`}
    </div>

    <div class="toolbar" style="margin-top:20px;">
      <div class="chip-row" style="flex:1;min-width:0;">
        <button class="chip ${inst ? "" : "active"}" data-a-inst="">전체 ${approvedScores().filter(s => s.sellerId === u.id).length}</button>
        ${instruments.map(i => `<button class="chip ${inst === i ? "active" : ""}" data-a-inst="${esc(i)}">${esc(i)}</button>`).join("")}
      </div>
      <select id="a-sort" aria-label="정렬">
        ${[["popular", "인기순"], ["latest", "최신순"], ["priceLow", "낮은 가격순"]].map(([v, l]) => `<option value="${v}" ${sort === v ? "selected" : ""}>${l}</option>`).join("")}
      </select>
    </div>
    ${list.length ? `<div class="score-grid">${list.map(s => scoreCard(s)).join("")}</div>` : `<div class="empty">아직 판매 중인 악보가 없어요.</div>`}
  `;

  bindCards(el);
  document.getElementById("a-follow")?.addEventListener("click", () => requireLogin(() => {
    const res = toggleFollow(getCurrentUser().id, u.id);
    if (!res.ok) { toast(res.message, true); return; }
    toast(res.added ? `${u.name}님을 구독했어요` : "구독을 취소했어요");
    renderBuyer();
  }));
  el.querySelectorAll("[data-a-inst]").forEach(b => b.addEventListener("click", () => goBuyer("artist", { id: u.id, sort, instrument: b.dataset.aInst }, { keepScroll: true })));
  document.getElementById("a-sort")?.addEventListener("change", (e) => goBuyer("artist", { id: u.id, instrument: inst, sort: e.target.value }, { keepScroll: true }));
}

/* ============================================================
   장바구니
   ============================================================ */

function renderCartPage(el) {
  const user = getCurrentUser();
  if (!user) {
    el.innerHTML = `<div class="empty"><p>로그인하면 장바구니를 쓸 수 있어요.</p><button class="btn btn-primary" id="cart-login">로그인</button></div>`;
    document.getElementById("cart-login")?.addEventListener("click", () => openLoginModal("buyer", () => goBuyer("cart")));
    return;
  }
  const items = user.cart.map(id => STATE.scores[id]).filter(Boolean);
  const valid = items.filter(s => s.status === "승인" && !hasPurchased(user.id, s.id));
  const total = valid.reduce((sum, s) => sum + s.price, 0);
  const after = user.points - total;

  el.innerHTML = `
    <div class="breadcrumb"><button data-go="home">홈</button> › 장바구니</div>
    <h1 class="page-title">장바구니</h1>
    <p class="muted" style="margin:0 0 16px;">담은 악보를 한 번에 구매할 수 있어요.</p>
    <div class="two-col cart-layout">
      <div class="panel">
        ${items.length ? items.map(s => {
          const unavailable = s.status !== "승인" || hasPurchased(user.id, s.id);
          return `
            <div class="row-item">
              <div style="display:flex;gap:12px;align-items:center;min-width:0;">
                <span class="mini-art" style="background:${themeOf(s.instrument).tint};">${instArt(s.instrument)}</span>
                <div class="row-main">
                  <div class="row-title" data-score-id="${s.id}">${esc(s.title)}</div>
                  <div class="row-sub">${esc(sellerName(s.sellerId))} · ${esc(s.instrument)} · ${esc(s.difficulty)}${unavailable ? ` · <span style="color:var(--danger);">${s.status !== "승인" ? "판매 중지" : "이미 구매함"}</span>` : ""}</div>
                </div>
              </div>
              <div class="row-actions" style="align-items:center;">
                <b style="white-space:nowrap;">${formatPoint(s.price)}</b>
                <button class="btn btn-small" data-remove="${s.id}">삭제</button>
              </div>
            </div>`;
        }).join("") : `<div class="empty" style="border:none;"><p style="margin:0 0 10px;">장바구니가 비어 있어요.</p><button class="btn btn-small" data-go="home">악보 둘러보기</button></div>`}
      </div>
      <div class="panel cart-summary">
        <div class="sum-line"><span>구매할 악보</span><span>${valid.length}개</span></div>
        <div class="sum-line"><span>보유 포인트</span><span>${formatPoint(user.points)}</span></div>
        <div class="sum-line total"><span>합계</span><span>${formatPoint(total)}</span></div>
        <div class="sum-line" style="color:${after < 0 ? "var(--danger)" : "var(--muted)"};"><span>결제 후 잔액</span><span>${formatPoint(after)}</span></div>
        ${after < 0
          ? `<button class="btn btn-accent" style="width:100%;margin-top:12px;" id="cart-charge">${formatPoint(-after)} 부족 · 충전하기</button>`
          : `<button class="btn btn-primary" style="width:100%;margin-top:12px;" id="cart-buy" ${valid.length ? "" : "disabled"}>전체 구매</button>`}
        <p class="buy-note">합계 포인트가 모자라면 한 건도 결제되지 않아요.</p>
      </div>
    </div>
  `;

  bindCards(el);
  el.querySelectorAll("[data-remove]").forEach(b => b.addEventListener("click", () => {
    removeFromCart(user.id, b.dataset.remove);
    renderBuyer();
    renderHeaderAuth();
  }));
  document.getElementById("cart-charge")?.addEventListener("click", () => goBuyer("mypage", { tab: "points", backCart: true }));
  document.getElementById("cart-buy")?.addEventListener("click", () => {
    const res = purchaseCart(user.id);
    if (!res.ok) { toast(res.message, true); renderBuyer(); return; }
    toast(`${res.count}개 악보 구매 완료 (${formatPoint(res.total)})`);
    goBuyer("mypage", { tab: "library" });
  });
}
/* ============================================================
   마이페이지
   ============================================================ */

function renderMyPage(el, p) {
  const user = getCurrentUser();
  if (!user) {
    el.innerHTML = `<div class="empty"><p>로그인하면 마이페이지를 볼 수 있어요.</p><button class="btn btn-primary" id="my-login">로그인</button></div>`;
    document.getElementById("my-login")?.addEventListener("click", () => openLoginModal("buyer", () => goBuyer("mypage", p)));
    return;
  }
  const tab = p.tab || "library";
  const tabs = [["library", "내 악보함"], ["points", "포인트 · 충전"], ["wish", `찜한 악보 ${user.wishlist.length}`], ["following", `구독 아티스트 ${user.following.length}`], ["recent", "최근 본 악보"]];

  let body = "";
  if (tab === "points") body = myPointsHTML(user, p);
  else if (tab === "wish") {
    const list = user.wishlist.map(id => STATE.scores[id]).filter(s => s && s.status === "승인");
    body = list.length ? `<div class="score-grid">${list.map(s => scoreCard(s)).join("")}</div>` : `<div class="empty">찜한 악보가 없어요. 악보 카드의 ♡를 눌러 담아보세요.</div>`;
  } else if (tab === "following") {
    const list = user.following.map(id => STATE.users[id]).filter(Boolean);
    body = list.length ? `<div class="artist-grid">${list.map(a => artistCard(a)).join("")}</div>` : `<div class="empty">구독한 아티스트가 없어요.</div>`;
  } else if (tab === "recent") {
    const list = getRecentViewed().map(id => STATE.scores[id]).filter(s => s && s.status === "승인");
    body = list.length ? `<div class="score-grid">${list.map(s => scoreCard(s)).join("")}</div>` : `<div class="empty">최근 본 악보가 없어요.</div>`;
  } else body = myLibraryHTML(user);

  el.innerHTML = `
    <div class="breadcrumb"><button data-go="home">홈</button> › 마이페이지</div>
    <div class="two-col">
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div class="point-card">
          <div class="pc-label">${esc(user.name)}님의 보유 포인트</div>
          <div class="pc-value">${formatPoint(user.points)}</div>
          <button class="btn btn-small" style="margin-top:10px;background:#fff;border-color:#fff;color:var(--primary);" data-tab="points">충전하기</button>
        </div>
        <div class="panel side-menu" style="padding:8px;">
          ${tabs.map(([k, l]) => `<button class="${tab === k ? "active" : ""}" data-tab="${k}">${l}</button>`).join("")}
          <button data-go="cart">장바구니 ${user.cart.length}</button>
          <button data-go="requests">내 신청곡</button>
        </div>
      </div>
      <div>${body}</div>
    </div>
  `;

  bindCards(el);
  el.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => goBuyer("mypage", { tab: b.dataset.tab }, { keepScroll: true })));

  // 내 악보함 버튼
  el.querySelectorAll("[data-download]").forEach(b => b.addEventListener("click", () => {
    const res = downloadPurchase(b.dataset.download);
    if (!res.ok) { toast(res.message, true); return; }
    toast("파일을 받았어요 (서버 연결 전이라 실제 파일은 아직 없어요)");
    renderBuyer();
  }));
  el.querySelectorAll("[data-refund]").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.confirm !== "1") {
      b.dataset.confirm = "1";
      b.textContent = "정말 환불할까요? 한 번 더 누르기";
      b.classList.add("btn-accent");
      return;
    }
    const res = refundPurchase(b.dataset.refund);
    if (!res.ok) { toast(res.message, true); return; }
    toast("환불했어요. 포인트가 돌아왔어요.");
    renderBuyer();
    renderHeaderAuth();
  }));
  el.querySelectorAll("[data-review]").forEach(b => b.addEventListener("click", () => goBuyer("detail", { id: b.dataset.review, focus: "review" })));

  // 충전
  el.querySelectorAll("[data-charge]").forEach(b => b.addEventListener("click", () => {
    const res = chargePoints(user.id, Number(b.dataset.charge));
    if (!res.ok) { toast(res.message, true); return; }
    toast(`${formatPoint(res.pointsGained)} 충전됐어요`);
    if (p.back && STATE.scores[p.back]) { goBuyer("detail", { id: p.back }); return; }
    if (p.backCart) { goBuyer("cart"); return; }
    renderBuyer();
    renderHeaderAuth();
  }));
}

function myLibraryHTML(user) {
  const list = Object.values(STATE.purchases)
    .filter(x => x.buyerId === user.id)
    .sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt));
  if (!list.length) {
    return `<div class="empty"><p style="margin:0 0 10px;">아직 구매한 악보가 없어요.</p><button class="btn btn-small" data-go="home">악보 둘러보기</button></div>`;
  }
  return `
    <div class="panel">
      <h2 style="margin:0 0 4px;font-size:17px;">내 악보함</h2>
      <p class="muted" style="margin:0 0 8px;font-size:12px;">환불은 파일을 열기 전, 구매 후 ${POLICY.refund.windowDays}일 이내만 가능해요.</p>
      ${list.map(x => {
        const s = STATE.scores[x.scoreId];
        const title = s ? s.title : "삭제된 악보";
        const reviewed = Object.values(STATE.reviews).some(r => r.buyerId === user.id && r.scoreId === x.scoreId);
        if (x.refunded) {
          return `<div class="row-item"><div class="row-main"><div class="row-title" ${s ? `data-score-id="${s.id}"` : ""}>${esc(title)}</div><div class="row-sub" style="color:var(--danger);">환불 완료 · ${formatDate(x.refundedAt)}</div></div></div>`;
        }
        const canRefund = x.price > 0 && !x.downloaded && new Date() <= new Date(x.refundDeadline);
        return `
          <div class="row-item">
            <div class="row-main">
              <div class="row-title" ${s ? `data-score-id="${s.id}"` : ""}>${esc(title)}</div>
              <div class="row-sub">${x.price === 0 ? "신청곡 무료 지급" : formatPoint(x.price)} · 구매 ${formatDate(x.purchasedAt)}${x.downloaded ? ` · 받음 ${formatDate(x.downloadedAt)}` : canRefund ? ` · 환불 가능 ~${formatDate(x.refundDeadline)}` : ""}</div>
            </div>
            <div class="row-actions">
              <button class="btn btn-primary btn-small" data-download="${x.id}">${x.downloaded ? "다시 받기" : "다운로드"}</button>
              ${canRefund ? `<button class="btn btn-small" data-refund="${x.id}">환불</button>` : ""}
              ${s && !reviewed ? `<button class="btn btn-small" data-review="${s.id}">후기 쓰기</button>` : ""}
            </div>
          </div>`;
      }).join("")}
    </div>
  `;
}

function myPointsHTML(user, p) {
  const history = [...user.pointHistory].reverse().slice(0, 30);
  const backScore = p.back && STATE.scores[p.back];
  return `
    ${backScore ? `<div class="panel" style="margin-bottom:12px;background:#fff8f2;border-color:#f5d9c4;">"${esc(backScore.title)}" 구매에 ${formatPoint(backScore.price)}가 필요해요. 충전하면 바로 악보 화면으로 돌아갑니다.</div>` : ""}
    ${p.backCart ? `<div class="panel" style="margin-bottom:12px;background:#fff8f2;border-color:#f5d9c4;">충전하면 장바구니로 돌아갑니다.</div>` : ""}
    <div class="panel">
      <h2 style="margin:0 0 4px;font-size:17px;">포인트 충전</h2>
      <p class="muted" style="margin:0 0 12px;font-size:12px;">1P = 1원, 유효기간 ${POLICY.point.expiryYears}년.${user.isFirstCharge ? ` 첫 충전에는 보너스 ${Math.round(POLICY.firstChargeBonus * 100)}%가 적용돼요.` : ""}</p>
      <div class="tier-grid">
        ${POLICY.chargeTiers.map(t => {
          const bonus = calcChargeBonus(user, t.amount);
          const pts = Math.round(t.amount * (1 + bonus));
          return `<button class="tier-btn" data-charge="${t.amount}">${formatWon(t.amount)}<small>${formatPoint(pts)} 적립${bonus ? ` (+${Math.round(bonus * 100)}%)` : ""}</small></button>`;
        }).join("")}
      </div>
      <p class="muted" style="margin:10px 0 0;font-size:11px;">지금은 실제 결제 없이 바로 충전되는 시험 버전이에요. 결제대행(PG) 연결은 오픈 전에 붙입니다.</p>
    </div>
    <div class="panel" style="margin-top:12px;">
      <h2 style="margin:0 0 8px;font-size:17px;">포인트 내역</h2>
      ${history.length ? history.map(h => `
        <div class="row-item">
          <div class="row-main"><div style="font-size:13px;">${esc(h.reason)}</div><div class="row-sub">${formatDate(h.at)}</div></div>
          <b style="color:${h.amount >= 0 ? "var(--primary)" : "var(--text)"};white-space:nowrap;">${h.amount >= 0 ? "+" : ""}${formatPoint(h.amount)}</b>
        </div>`).join("") : `<p class="muted" style="margin:0;">아직 내역이 없어요.</p>`}
    </div>
  `;
}

/* ============================================================
   신청곡
   ============================================================ */

let REQ_FILTER = "";

function renderRequestsPage(el) {
  const user = getCurrentUser();
  const prefill = BUYER_ROUTE.params.prefill || "";
  let list = Object.values(STATE.requests);
  if (REQ_FILTER === "mine") list = list.filter(r => user && r.buyerIds.includes(user.id));
  else if (REQ_FILTER) list = list.filter(r => r.status === REQ_FILTER);
  list.sort((a, b) => (a.status === "완료") - (b.status === "완료") || b.buyerIds.length - a.buyerIds.length);

  el.innerHTML = `
    <div class="breadcrumb"><button data-go="home">홈</button> › 신청곡</div>
    <h1 class="page-title">신청곡</h1>
    <p class="muted" style="margin:0 0 16px;line-height:1.6;">찾는 악보가 없으면 신청해주세요. 1건 ${formatPoint(POLICY.request.pointCost)}이고, 신청이 많은 곡부터 채보해요. 악보가 완성되면 신청한 분 모두에게 무료로 드려요.</p>

    <div class="two-col req-layout">
      <div class="panel" style="display:flex;flex-direction:column;gap:8px;">
        <h2 style="margin:0 0 4px;font-size:16px;">새 곡 신청하기</h2>
        <input class="field" id="rq-title" placeholder="곡 제목" value="${esc(prefill)}">
        <input class="field" id="rq-artist" placeholder="가수 / 원곡자">
        <select class="field" id="rq-inst">${INSTRUMENTS.map(i => `<option value="${esc(i)}">${esc(i)}</option>`).join("")}</select>
        <button class="btn btn-primary" id="rq-submit">${formatPoint(POLICY.request.pointCost)}로 신청하기</button>
        <p class="muted" style="margin:0;font-size:11px;">같은 곡·같은 악기를 이미 누가 신청했다면 그 신청에 함께 이름이 올라가요.</p>
      </div>
      <div>
        <div class="chip-row" style="margin-bottom:10px;">
          ${[["", "전체"], ...REQUEST_STATUS.map(s => [s, s]), ...(user ? [["mine", "내 신청"]] : [])].map(([v, l]) => `<button class="chip ${REQ_FILTER === v ? "active" : ""}" data-rq-filter="${v}">${l}</button>`).join("")}
        </div>
        <div class="panel">
          ${list.length ? list.map((r, i) => {
            const joined = user && r.buyerIds.includes(user.id);
            return `
              <div class="req-item">
                <div class="req-count"><b>${r.buyerIds.length}</b><span>명</span></div>
                <div class="row-main" style="flex:1;">
                  <div class="row-title" style="cursor:default;">${esc(r.title)}</div>
                  <div class="row-sub">${esc(r.artist)} · ${esc(r.instrument)}${joined ? " · 내가 신청함" : ""}</div>
                </div>
                <span class="status-pill st-${esc(r.status)}">${esc(r.status)}</span>
                ${r.status === "완료" && r.fulfilledScoreId
                  ? `<button class="btn btn-small" data-score-id="${r.fulfilledScoreId}">악보 보기</button>`
                  : joined ? "" : `<button class="btn btn-small" data-join="${r.id}">나도 신청</button>`}
              </div>`;
          }).join("") : `<p class="muted" style="margin:0;">해당하는 신청곡이 없어요.</p>`}
        </div>
      </div>
    </div>
  `;

  bindCards(el);
  el.querySelectorAll("[data-rq-filter]").forEach(b => b.addEventListener("click", () => { REQ_FILTER = b.dataset.rqFilter; renderBuyer(); }));
  document.getElementById("rq-submit")?.addEventListener("click", () => {
    const data = {
      title: document.getElementById("rq-title").value,
      artist: document.getElementById("rq-artist").value,
      instrument: document.getElementById("rq-inst").value
    };
    requireLogin(() => {
      const res = submitSongRequest(getCurrentUser().id, data);
      if (!res.ok) { toast(res.message, true); return; }
      toast(res.joined ? "이미 있던 신청에 함께 올렸어요" : "신청곡을 등록했어요");
      BUYER_ROUTE.params.prefill = "";
      renderBuyer();
      renderHeaderAuth();
    });
  });
  el.querySelectorAll("[data-join]").forEach(b => b.addEventListener("click", () => {
    const r = STATE.requests[b.dataset.join];
    requireLogin(() => {
      const res = submitSongRequest(getCurrentUser().id, { title: r.title, artist: r.artist, instrument: r.instrument });
      if (!res.ok) { toast(res.message, true); return; }
      toast(`"${r.title}" 신청에 함께했어요 (-${formatPoint(POLICY.request.pointCost)})`);
      renderBuyer();
      renderHeaderAuth();
    });
  }));
}
