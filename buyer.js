/* ============================================================
   buyer.js — 스토어(구매자) 화면. 로그인 없이도 둘러볼 수 있다.
   "구매자/" 모드(또는 총괄/)에서 작업합니다.

   페이지: 홈 / 악보 목록(검색·필터) / 악보 상세 / 아티스트 / 장바구니 /
          마이페이지(내 악보함·포인트·아티스트 되기·찜·구독·최근 본) / 신청곡 / 고객센터(FAQ·1:1 문의)
   계정이 필요한 버튼은 requireLogin() 으로 감싸서, 로그인 후 하던 일을 이어간다.

   2026-10-19 추가: "아티스트 되기"는 더 이상 버튼 한 번으로 즉시 판매자가 되지 않는다.
   마이페이지의 "아티스트 되기" 탭에서 신청서를 내고, 관리자 승인을 거쳐야 한다
   (common.js의 submitArtistApplication/getLatestArtistApplication, admin.js Phase 2에서
   승인·거절 화면 작업 예정). startArtist()는 이제 그 탭으로 안내만 한다.
   ============================================================ */

let BUYER_ROUTE = { page: "home", params: {} };
let HOME_POP = { period: 7, instrument: "" };
let HERO_TIMER = null;
let REVIEW_DRAFT = { rating: 0 };
let SUPPORT_TAB = "faq";
let SUPPORT_FAQ_CAT = "";
let SUPPORT_FAQ_OPEN = null;
let SUPPORT_QNA_OPEN = null;
let SUPPORT_FORM_OPEN = false;
const PAGE_SIZE = 20;

/* 자주 묻는 질문 — 고정 콘텐츠. 정책 수치는 직접 쓰지 않고 POLICY를 참조한다 */
const FAQ_LIST = [
  { id: "f1", cat: "결제·포인트", q: "포인트는 어떻게 충전하나요?",
    a: () => `마이페이지 › 포인트 메뉴에서 ${POLICY.chargeTiers.map(t => formatWon(t.amount)).join(" / ")} 중 골라 충전해요. 1P는 ${POLICY.point.unit}원이고, 충전한 포인트는 ${POLICY.point.expiryYears}년 동안 쓸 수 있어요.` },
  { id: "f2", cat: "결제·포인트", q: "충전하면 보너스가 붙나요?",
    a: () => `충전 금액에 따라 ${POLICY.chargeTiers.filter(t => t.bonus > 0).map(t => `${formatWon(t.amount)} 이상 ${Math.round(t.bonus * 100)}%`).join(", ")} 보너스가 붙어요. 첫 충전은 ${Math.round(POLICY.firstChargeBonus * 100)}% 보너스와 티어 보너스 중 더 큰 쪽이 적용돼요.` },
  // 2026-10-20 추가(mydrumsheet.com FAQ 이전): 악보 구매 환불과는 별개로, 아직 쓰지 않은
  // 충전 포인트 자체의 환불 정책. POLICY.chargeRefund.windowDays 참고.
  { id: "f11", cat: "결제·포인트", q: "충전한 포인트도 환불되나요?",
    a: () => `네, 아직 쓰지 않은 충전 포인트는 충전일로부터 ${POLICY.chargeRefund.windowDays}일 이내면 환불할 수 있어요. 고객센터 1:1 문의로 신청해주세요. (악보를 구매한 뒤의 환불은 아래 "환불은 어떻게 하나요?" 항목을 참고해주세요.)` },
  { id: "f3", cat: "환불", q: "환불은 어떻게 하나요?",
    a: () => `구매 후 ${POLICY.refund.windowDays}일 이내, 파일을 한 번도 받지 않았다면 마이페이지 › 내 악보함에서 환불 버튼으로 포인트 전액 환불돼요. 악보는 전자 PDF 파일이라 한 번이라도 다운로드했다면 환불이 안 돼요.` },
  { id: "f4", cat: "악보·심사", q: "악보 등록하면 언제 노출되나요?",
    a: () => `판매자가 악보를 등록하면 바로 목록에 노출돼요. 궁금한 점이 있으면 고객센터 1:1 문의로 알려주세요.` },
  { id: "f5", cat: "악보·심사", q: "수수료는 얼마인가요?",
    a: () => `수수료는 ${Math.round(POLICY.commission.rate * 100)}%예요. 나머지는 전부 판매자 몫이에요.` },
  { id: "f6", cat: "정산", q: "정산은 언제 들어오나요?",
    a: () => `출금 신청은 따로 안 해요. 적립금이 ${formatWon(POLICY.settlement.minWithdraw)} 이상이고 정산 계좌가 등록돼 있으면, 매달 ${POLICY.settlement.payoutDay}일에 자동으로 입금돼요.` },
  { id: "f7", cat: "계정", q: "비밀번호는 어떻게 바꾸나요?",
    a: () => `지금은 이름과 이메일만으로 로그인하는 시험 버전이라 비밀번호가 없어요. 정식 오픈 전에 추가될 예정이에요.` },
  // 2026-10-20 추가(mydrumsheet.com FAQ 이전): 중복 이메일 가입 제한은 Supabase Auth 공통 동작이라
  // 이 사이트에도 그대로 적용된다.
  { id: "f9", cat: "계정", q: "회원가입이 안 돼요. 왜 그런가요?",
    a: () => `같은 이메일 주소로는 중복 가입이 안 돼요. 가입하려는 이메일이 이미 다른 계정에서 쓰이고 있다면, 다른 이메일 주소로 다시 시도해보세요.` },
  { id: "f8", cat: "기타", q: "신청곡은 어떻게 신청하나요?",
    a: () => `스토어 › 신청곡에서 곡 제목·작곡가·가수·악기를 적으면 무료로 올라가요. 신청이 많은 곡부터 채보해서 악보로 만들어요. 완성되면 신청하신 분께도 따로 드리지 않고, 다른 구매자와 똑같이 구매하실 수 있어요.` },
  // 2026-10-20 추가(mydrumsheet.com FAQ 이전): PDF 다운로드·열람 관련 기술 문의.
  { id: "f10", cat: "기타", q: "PDF 파일을 받았는데 악보가 안 열려요.",
    a: () => `쓰고 계신 PDF 뷰어 프로그램에 문제가 있을 수 있어요. Chrome 브라우저로 파일을 다시 받아보시면 대부분 바로 열려요.` }
];

const INSTRUMENT_ICON = {
  "드럼": "♪", "기타": "♪", "피아노": "♪", "베이스": "♪", "바이올린": "♪", "보컬": "♪"
};

/* ---------- 일러스트 (직접 그린 SVG — 외부 이미지 없이 어디서든 보임) ---------- */

const INST_THEME = {
  "드럼": { tint: "#f4eee5", ink: "#ff9a5c", soft: "#fbcdb5" },
  "기타": { tint: "#f4eee5", ink: "#c4860e", soft: "#efd9a6" },
  "피아노": { tint: "#f4eee5", ink: "#3b302a", soft: "#d9cfc3" },
  "베이스": { tint: "#f4eee5", ink: "#8a4b3c", soft: "#e6c8bf" },
  "우쿨렐레": { tint: "#f4eee5", ink: "#6b7a2a", soft: "#d8dcb4" },
  "칼림바": { tint: "#f4eee5", ink: "#2f736c", soft: "#bcd9d4" },
  "리코더": { tint: "#f4eee5", ink: "#b14d66", soft: "#ecc4ce" }
};

function themeOf(inst) {
  return INST_THEME[inst] || { tint: "#f4eee5", ink: "#ff9a5c", soft: "#fbcdb5" };
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

/* 연주영상 바로가기용 재생 아이콘 (빨간 둥근 사각형 + 흰 삼각형). size를 주면 그 px로, 안 주면 부모(.q-icon) CSS 크기를 따른다 */
function videoIconArt(size) {
  const attr = size ? `width="${size}" height="${size}"` : "";
  return `<svg ${attr} viewBox="0 0 64 64" aria-hidden="true" focusable="false" style="flex-shrink:0;">
    <rect x="6" y="16" width="52" height="32" rx="11" fill="#ff2d2d"/>
    <path d="M27 23 L44 32 L27 41 Z" fill="#fff"/>
  </svg>`;
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
      <text x="165" y="158" text-anchor="middle" font-size="22" font-weight="800" fill="#ff6b3d" font-family="sans-serif">악보</text>
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

/* ---------- 이동 ----------
   화면 이동은 전부 이 함수를 거친다. fromHistory(뒤로/앞으로가기로 호출됨)가 아니면
   매번 브라우저 기록에 한 칸씩 쌓아서(pushNavState), 뒤로가기를 누르면 방금 전 화면으로,
   계속 누르면 결국 메인(홈)까지 돌아가도록 한다. (2026-10-13 추가) */

function goBuyer(page, params, opts) {
  BUYER_ROUTE = { page, params: params || {} };
  if (page === "detail" && params && params.id) recordView(params.id);
  if (page === "detail") REVIEW_DRAFT = { rating: 0 };
  if (CURRENT_VIEW !== "buyer") {
    showView("buyer", opts && opts.fromHistory ? { fromHistory: true } : undefined);
  } else {
    renderBuyer();
    renderHeaderAuth();
    if (!(opts && opts.fromHistory)) pushNavState();
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
  // 2026-10-20 추가: 헤더의 "FAQ" 메뉴는 고객센터 화면의 "자주 묻는 질문" 탭으로 연결된다.
  else if (page === "support" && (!params.tab || params.tab === "faq")) key = "faq";
  setActiveMenu(key);
}

/* ---------- 작은 조각들 ---------- */

function sellerName(id) {
  const u = STATE.users[id];
  if (!u) return "알 수 없음";
  return (u.sellerInfo && u.sellerInfo.displayName) || u.name;
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

/* 2026-10-16 추가: 할인 중이면 할인율 배지 + 취소선 정가 + 할인가를, 아니면 그냥 가격을 보여준다 */
function priceHtml(s) {
  const d = activeDiscount(s);
  if (!d) return formatPoint(s.price);
  const pct = Math.round(d.rate * 100);
  return `<span style="color:var(--danger);font-weight:700;">${pct}%</span> `
    + `<span style="text-decoration:line-through;color:var(--muted);font-weight:400;">${formatPoint(s.price)}</span> `
    + `<span>${formatPoint(effectivePrice(s))}</span>`;
}

// 2026-10-20: 난이도 이름 교체(초급→매우 쉬움, 초중급→쉬움, 중급→보통, 고급→어려움, 프로→매우 어려움)에 맞춰 키를 바꿨다.
// "입문"/"상급"은 예전(더 이전) 버전에서 쓰던 이름이 남아있던 것으로, 지금은 어디서도 저장되지 않아 그대로 둔다.
// 2026-10-20 추가: 사용자 지정 색상으로 5단계 각각 다른 배경·글자색 적용 (border는 배경색과 동일하게 맞춰 테두리가 도드라지지 않게 함)
const DIFF_BADGE_COLORS = {
  "입문": { bg: "#D7F5DF", border: "#D7F5DF", fg: "#18743A" },
  "매우 쉬움": { bg: "#D7F5DF", border: "#D7F5DF", fg: "#18743A" },
  "쉬움": { bg: "#FFF1B8", border: "#FFF1B8", fg: "#8A6200" },
  "보통": { bg: "#FFE0C2", border: "#FFE0C2", fg: "#B94F0A" },
  "매우 어려움": { bg: "#FFDADA", border: "#FFDADA", fg: "#B92332" },
  "상급": { bg: "#FFDADA", border: "#FFDADA", fg: "#B92332" },
  "어려움": { bg: "#EAD9FF", border: "#EAD9FF", fg: "#7138B5" }
};
function diffBadgeStyle(difficulty) {
  const c = DIFF_BADGE_COLORS[difficulty] || DIFF_BADGE_COLORS["매우 쉬움"];
  return `background:${c.bg};border:1px solid ${c.border};color:${c.fg};`;
}
// 2026-10-29 추가: 상세페이지 태그(.tag-diff)에 홈 카드 난이도 배지와 같은 색(DIFF_BADGE_COLORS)을 적용한다.
// .tag-diff 는 테두리를 inset box-shadow 로 그리므로 border 대신 box-shadow 를 덮어써 태그 크기가 바뀌지 않게 한다.
function diffTagStyle(difficulty) {
  const c = DIFF_BADGE_COLORS[difficulty] || DIFF_BADGE_COLORS["매우 쉬움"];
  return `background:${c.bg};box-shadow:inset 0 0 0 1px ${c.border};color:${c.fg};`;
}
function cartIcon() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
  </svg>`;
}

/* 상세페이지 미리보기 캐러셀에 쓸 이미지 배열을 정한다.
   여러 장(previewUrls)이 있으면 그걸(최대 5장), 옛날 방식(previewUrl 한 장)만 있으면
   그 한 장짜리 배열로, 둘 다 없으면 null(가짜 오선지 그림으로 대체)을 돌려준다. */
function previewImages(s) {
  if (Array.isArray(s.previewUrls) && s.previewUrls.length) return s.previewUrls.slice(0, 5);
  if (s.previewUrl) return [s.previewUrl];
  // 2026-10-21 추가: 전용 미리보기 이미지가 한 번도 안 만들어진 옛날 악보(대량 수입 데이터)는
  // 목록 카드에 쓰는 전체 페이지 썸네일(cardThumbUrl)을 상세페이지 미리보기에도 그대로 재사용한다.
  // 가짜 오선지 그림 대신 실제 악보 첫 페이지가 보이고, 그 아래는 기존 ps-fade가 그대로 가려준다(2026-10-29: ps-lock 안내 문구는 제거).
  if (s.cardThumbUrl) return [s.cardThumbUrl];
  return null;
}

function pagerArrowIcon(dir) {
  const d = dir === "left" ? "M14.5 5L8 12l6.5 7" : "M9.5 5L16 12l-6.5 7";
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"></path></svg>`;
}

/* 페이지 번호를 최대 5개만 보여주고(현재 페이지 중심으로 창을 움직임), 더 있으면 좌우에 테두리 없는 화살표로 이동 */
function renderPager(current, pages) {
  const WINDOW = 5;
  let start = Math.max(1, current - Math.floor(WINDOW / 2));
  let end = Math.min(pages, start + WINDOW - 1);
  start = Math.max(1, end - WINDOW + 1);
  const nums = [];
  for (let i = start; i <= end; i++) nums.push(i);
  const showArrows = pages > WINDOW;
  return `
    <div class="pager">
      ${showArrows ? `<button class="pager-arrow" data-page-nav="prev" aria-label="이전 페이지" ${current <= 1 ? "disabled" : ""}>${pagerArrowIcon("left")}</button>` : ""}
      ${nums.map(n => `<button class="${n === current ? "active" : ""}" data-page="${n}">${n}</button>`).join("")}
      ${showArrows ? `<button class="pager-arrow" data-page-nav="next" aria-label="다음 페이지" ${current >= pages ? "disabled" : ""}>${pagerArrowIcon("right")}</button>` : ""}
    </div>`;
}

/* 상세페이지 하단 "다른 악보"/"함께 많이 산 악보" 줄: 5개 넘으면 좌우 테두리 없는 화살표로 한 화면씩 넘기기 */
function renderScoreCarousel(items, cardOpts) {
  const row = `<div class="score-row">${items.map(x => scoreCard(x, cardOpts)).join("")}</div>`;
  if (items.length <= 5) return row;
  return `
    <div class="score-carousel">
      <button class="carousel-arrow" data-car-nav="prev" aria-label="이전">${pagerArrowIcon("left")}</button>
      ${row}
      <button class="carousel-arrow" data-car-nav="next" aria-label="다음">${pagerArrowIcon("right")}</button>
    </div>`;
}

/* 상세페이지 미리보기 이미지가 여러 장일 때, 좌·우 화살표로 넘겨보는 기능.
   전체 페이지를 다시 그리지 않고 이미지·블러·화살표 상태만 바꿔서 가볍게 동작한다.
   1페이지(맨 앞)는 그대로(블러 없음), 2페이지부터는 블러 처리한다. */
function bindPreviewCarousel(el, images) {
  if (!images || images.length <= 1) return;
  const box = el.querySelector(".ps-img");
  if (!box) return;
  const img = box.querySelector("img");
  const prevBtn = box.querySelector('[data-preview-nav="prev"]');
  const nextBtn = box.querySelector('[data-preview-nav="next"]');
  const counter = box.querySelector(".preview-page-count");
  if (!img) return;
  let idx = 0;
  function render() {
    img.src = images[idx];
    img.classList.toggle("preview-page-blur", idx > 0);
    if (counter) counter.textContent = `${idx + 1} / ${images.length}`;
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx >= images.length - 1;
  }
  prevBtn?.addEventListener("click", () => { if (idx > 0) { idx--; render(); } });
  nextBtn?.addEventListener("click", () => { if (idx < images.length - 1) { idx++; render(); } });
  render();
}

function bindScoreCarousels(el) {
  el.querySelectorAll(".score-carousel").forEach(car => {
    const row = car.querySelector(".score-row");
    const prevBtn = car.querySelector('[data-car-nav="prev"]');
    const nextBtn = car.querySelector('[data-car-nav="next"]');
    if (!row || !prevBtn || !nextBtn) return;
    const updateArrows = () => {
      const max = row.scrollWidth - row.clientWidth;
      prevBtn.disabled = row.scrollLeft <= 2;
      nextBtn.disabled = row.scrollLeft >= max - 2;
    };
    prevBtn.addEventListener("click", () => row.scrollBy({ left: -row.clientWidth, behavior: "smooth" }));
    nextBtn.addEventListener("click", () => row.scrollBy({ left: row.clientWidth, behavior: "smooth" }));
    row.addEventListener("scroll", updateArrows);
    updateArrows();
  });
}

function scoreCard(s, opts) {
  const o = opts || {};
  const r = getScoreRating(s.id);
  // 2026-10-20 추가: 전용 썸네일(thumbnailUrl)이 없으면, 상세페이지 미리보기와 같은 소스(previewImages — 악보 첫 페이지)를 그대로 써서 목록에서도 실제 악보 첫 페이지가 보이게 한다. 둘 다 없으면 기존 가짜 오선지 그림(sheetArt)으로 대체.
  // 2026-10-21 변경: 판매자가 직접 올린 thumbnailUrl이 없으면, 첫 페이지를 "잘리지 않고 전체 다" 보여주는
  // cardThumbUrl(새로 추가, 미리보기용 42% 크롭 이미지와는 별개로 페이지 전체를 담아 생성)을 우선 쓴다.
  // cardThumbUrl도 없으면(아직 백필 전인 기존 악보) 예전처럼 42% 크롭 미리보기 이미지로 대체한다.
  // thumbnailUrl은 판매자가 의도적으로 올린 이미지이므로 기존처럼 object-fit:cover로 박스를 꽉 채우고,
  // cardThumbUrl·크롭 미리보기는 object-fit:contain + 흰 배경으로 보여줘서 정사각형 박스 안에서
  // 위아래(또는 좌우)에 여백이 생기더라도 악보 내용이 잘리지 않게 한다.
  const cardPreviewSrc = s.thumbnailUrl || s.cardThumbUrl || (previewImages(s) ? previewImages(s)[0] : null);
  const cardPreviewFit = s.thumbnailUrl ? "cover" : "contain";
  return `
    <div class="score-card" data-score-id="${s.id}">
      <div class="thumb" style="--tint:${themeOf(s.instrument).tint};--ink:${themeOf(s.instrument).ink};">
        ${o.rank ? `<span class="rank-num ${o.rank <= 3 ? "top" : ""}">${o.rank}</span>` : ""}
        <span class="diff-badge" style="${diffBadgeStyle(s.difficulty)}">${esc(s.difficulty)}</span>
        ${cardPreviewSrc
          ? `<img src="${esc(cardPreviewSrc)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${cardPreviewFit};background:#fff;" onerror="this.style.display='none';">
             <img src="${esc(cardPreviewSrc)}" alt="" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${cardPreviewFit};background:#fff;z-index:1;pointer-events:none;filter:blur(6px);-webkit-mask-image:linear-gradient(to bottom, transparent 0%, transparent 78%, rgba(0,0,0,.6) 88%, #000 100%);mask-image:linear-gradient(to bottom, transparent 0%, transparent 78%, rgba(0,0,0,.6) 88%, #000 100%);" onerror="this.style.display='none';">`
          : `<div class="paper">${sheetArt(s.title, themeOf(s.instrument).ink, 3)}</div><div class="thumb-art">${esc(s.instrument)}</div>`}
        ${s.hasVideo && !o.hideVideoBadge ? `<span class="video-flag">▶</span>` : ""}
      </div>
      <div class="card-body">
        <div class="card-seller"><span class="avatar" style="${avatarStyle(sellerName(s.sellerId))}">${initialOf(sellerName(s.sellerId))}</span>${esc(sellerName(s.sellerId))}</div>
        <div class="card-title">${esc(s.title)}</div>
        <div class="card-artist">${esc(s.artist)}</div>
        <div class="card-foot">
          <button type="button" class="cart-btn" data-cart="${s.id}" aria-label="장바구니 담기">${cartIcon()}</button>
          <div class="card-foot-right">
            ${r.count ? `<span class="rating"><b>★</b> ${r.avg} (${r.count})</span>` : `<span class="rating">조회 ${s.viewCount}</span>`}
            <span class="price">${priceHtml(s)}</span>
          </div>
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
  root.querySelectorAll("[data-cart]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.cart;
      requireLogin(() => {
        const u = getCurrentUser();
        if (u.cart.includes(id)) { goBuyer("cart"); return; }
        const res = addToCart(u.id, id);
        if (!res.ok) { toast(res.message, true); return; }
        toast("장바구니에 담았어요");
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
  else if (page === "support") renderSupportPage(el, params);
  else renderHomePage(el);

  updateMenuHighlight();
}

/* ============================================================
   홈
   ============================================================ */

function renderHomePage(el) {
  const user = getCurrentUser();
  const videoScores = approvedScores()
    .filter(s => s.hasVideo)
    .sort((a, b) => (a.instrument === "드럼" ? -1 : 0) - (b.instrument === "드럼" ? -1 : 0) || b.salesCount - a.salesCount)
    .slice(0, 10);
  const latest = approvedScores().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);
  const requests = Object.values(STATE.requests)
    .filter(r => r.status !== "완료")
    .sort((a, b) => b.buyerIds.length - a.buyerIds.length)
    .slice(0, 3);

  el.innerHTML = `
    <div class="hero" id="hero">
      <div class="hero-track" id="hero-track">
        <div class="hero-slide slide-1">
          <div class="hero-inner">
          <div class="hero-text">
          <div class="eyebrow">악보는 영상과 함께</div>
          <h2>연주 영상과 함께 보는 악보</h2>
          <p>연주영상 표시가 있는 악보는<br>판매 아티스트가 직접 연주한 영상을 함께 볼 수 있어요.</p>
          <button class="btn btn-primary" id="hero-video-btn" data-go="list:video:true" style="background:linear-gradient(90deg,#ffb36b 0%,#f07845 100%);border-color:transparent;">연주영상 악보 보기</button>
          </div>
          </div>
        </div>
        <div class="hero-slide slide-2">
          <div class="hero-inner">
          <div class="hero-text">
          <div class="eyebrow">찾는 악보가 없다면</div>
          <h2>신청곡을 올려주세요</h2>
          <p>누구나 무료로 올릴 수 있어요.<br>신청이 많은 곡부터 채보해서<br>악보로 만들어 드려요.</p>
          <button class="btn btn-accent" id="hero-request-btn" data-go="requests">신청곡 보러가기</button>
          </div>
          </div>
        </div>
        <div class="hero-slide slide-3">
          <div class="hero-inner">
          <div class="hero-text">
          <div class="eyebrow">아티스트 모집</div>
          <h2>내 악보를 올리고<br>판매 금액의 ${Math.round((1 - POLICY.commission.rate) * 100)}%를 정산받으세요</h2>
          <p>적립금이 ${formatWon(POLICY.settlement.minWithdraw)} 이상이면 매달 ${POLICY.settlement.payoutDay}일 신청 없이 자동으로 입금돼요.</p>
          <button class="btn" id="hero-artist-btn" style="background:linear-gradient(90deg,#ffb36b 0%,#f07845 100%);border-color:transparent;border-radius:16px;">아티스트로 시작하기</button>
          </div>
          </div>
        </div>
      </div>
      <div class="hero-dots" id="hero-dots">
        <button class="hero-dot active" data-slide="0" aria-label="첫 번째 배너"></button>
        <button class="hero-dot" data-slide="1" aria-label="두 번째 배너"></button>
        <button class="hero-dot" data-slide="2" aria-label="세 번째 배너"></button>
      </div>
    </div>

    <div class="inst-band">
      <div class="inst-head"><h2>어떤 악기와 함께하시나요?</h2></div>
      <div class="inst-grid">
        ${["피아노", "드럼", "기타", "베이스", "바이올린", "보컬"].map(i => `<button class="inst-card" data-go="list:instrument:${esc(i)}"><b>${esc(i)}</b></button>`).join("")}
      </div>

    <div class="lvl-band">
      <div class="lvl-head"><h2>지금의 나에게, 알맞은 난이도</h2></div>
      <div class="lvl-grid">
        ${DIFFICULTIES.map((d, n) => { const info = ({"매우 쉬움":["한 곡을 끝까지, 차근차근","쉬운 반주 · 편안한 조성"],"보통":["표현이 깊어지는 시간","다양한 리듬 · 풍부한 화성"],"어려움":["나만의 해석을 더하다","원곡의 깊이 · 연주회 레퍼토리"]})[d] || ["",""]; const lv = 4 - DIFFICULTIES.length + n + 1; return `<button class="lvl-card" data-go="list:difficulty:${esc(d)}"><span class="lvl-top"><b>${esc(d)}</b><span class="lvl-bars" aria-hidden="true">${[1,2,3,4].map(k => `<i class="${k <= lv ? "on" : ""}" style="height:${8 + k * 3}px"></i>`).join("")}</span></span><span class="lvl-tag">${info[0]}</span><span class="lvl-meta">${info[1]}</span><span class="lvl-foot"><span>보러가기</span><i class="ico" style="--i:url(https://unpkg.com/lucide-static@0.468.0/icons/arrow-right.svg)"></i></span></button>`; }).join("")}
      </div>
    </div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2>인기 악보</h2>
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
        <h2>최신 악보</h2>
        <button class="more-link" data-go="list:sort:latest">더 보기 ›</button>
      </div>
      ${latest.length ? `
        <div class="table-wrap">
          <table class="list-table">
            <thead>
              <tr>
                <th>곡 정보</th>
                <th class="hide-m">아티스트</th>
                <th>악기</th>
                <th>난이도</th>
                <th class="hide-m">조회수</th>
                <th>가격</th>
              </tr>
            </thead>
            <tbody>
              ${latest.map(s => `
                <tr data-score-id="${s.id}">
                  <td>${esc(s.title)}</td>
                  <td class="hide-m"><span style="display:flex;align-items:center;gap:8px;"><span class="avatar" style="width:26px;height:26px;font-size:11px;flex-shrink:0;${avatarStyle(sellerName(s.sellerId))}">${initialOf(sellerName(s.sellerId))}</span>${esc(sellerName(s.sellerId))}</span></td>
                  <td>${esc(s.instrument)}</td>
                  <td>${esc(s.difficulty)}</td>
                  <td class="hide-m">${s.viewCount.toLocaleString("ko-KR")}</td>
                  <td>${priceHtml(s)}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>` : `<div class="empty">아직 등록된 악보가 없어요.</div>`}
    </div>

    <div class="section">
      <div class="section-head">
        <h2 style="display:flex;align-items:center;gap:6px;">${videoIconArt(22)} 연주 영상이 있는 악보</h2>
        <button class="more-link" data-go="list:video:true">더 보기 ›</button>
      </div>
      ${videoScores.length ? `<div class="score-row">${videoScores.map(s => scoreCard(s)).join("")}</div>` : `<div class="empty">아직 연주 영상이 있는 악보가 없어요.</div>`}
    </div>

    <div class="req-band">
      <div class="req-band-inner">
        <div class="section-head">
          <h2>신청곡 순위</h2>
          <button class="more-link" data-go="requests">신청하러 가기 ›</button>
        </div>
        ${requests.length ? requests.map((r, i) => `
          <div class="req-item">
            <div class="req-count"><b>${r.buyerIds.length}</b><span>신청자 수</span></div>
            <div class="row-main" style="flex:1;">
              <div class="row-title" style="cursor:default;">${i + 1}. ${esc(r.title)}</div>
              <div class="row-sub">${esc(r.composer)} 작곡 · ${esc(r.singer)} · ${esc(r.instrument)}</div>
            </div>
            <span class="status-pill st-${esc(r.status)}">${esc(r.status)}</span>
          </div>`).join("") : `<p class="muted" style="margin:0;">아직 신청곡이 없어요. 첫 번째로 신청해보세요.</p>`}
      </div>
    </div>

    <div class="section info-banners">
      <div class="info-banner ib-1" id="ib-guide">
        <h3>이용 방법</h3>
        <p>포인트 충전 → 악보 구매 → 내 악보함에서 다운로드.<br>1P는 1원이고 ${POLICY.point.expiryYears}년 동안 쓸 수 있어요.</p>
      </div>
      <div class="info-banner ib-2" data-go="mypage:tab:points">
        <h3>환불 안내</h3>
        <p>구매 후 ${POLICY.refund.windowDays}일 이내,<br>파일을 한 번도 열지 않았다면<br>포인트로 전액 환불돼요.</p>
      </div>
      <div class="info-banner ib-3" id="ib-artist">
        <h3>아티스트 가입</h3>
        <p>직접 채보·편곡한 악보를 판매하세요.</p>
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

/* 2026-10-19 변경: 더 이상 버튼 한 번으로 즉시 판매자가 되지 않는다.
   이미 아티스트(판매자)면 판매자 센터로, 아니면 로그인 여부와 상관없이
   마이페이지의 "아티스트 되기" 신청 탭으로 안내한다(로그인 전이면 로그인 후 그 탭으로). */
function startArtist() {
  const user = getCurrentUser();
  if (user && (user.role === "seller" || user.role === "both")) { showView("seller"); window.scrollTo({ top: 0 }); return; }
  if (user) { goBuyer("mypage", { tab: "artist" }); return; }
  requireLogin(() => goBuyer("mypage", { tab: "artist" }));
}

function renderPopRow() {
  const wrap = document.getElementById("pop-row");
  if (!wrap) return;
  const list = getPopularScores(HOME_POP.period || null, HOME_POP.instrument).slice(0, 10);
  wrap.innerHTML = list.length
    ? `<div class="score-row">${list.map((s, i) => scoreCard(s, { rank: i + 1, hideVideoBadge: true })).join("")}</div>`
    : `<div class="empty">이 조건의 악보가 아직 없어요.</div>`;
  bindCards(wrap);
}

function setupHero() {
  const track = document.getElementById("hero-track");
  const dots = document.querySelectorAll("#hero-dots .hero-dot");
  const dotsWrap = document.getElementById("hero-dots");
  if (!track) return;
  const HERO_DOT_ACCENTS = { 2: "#ff8a50" };
  let idx = 0;
  const go = (i) => {
    idx = i;
    track.style.transform = `translateX(-${i * 100}%)`;
    dots.forEach((d, k) => d.classList.toggle("active", k === i));
    if (dotsWrap) {
      if (HERO_DOT_ACCENTS[i]) dotsWrap.style.setProperty("--hero-dot-accent", HERO_DOT_ACCENTS[i]);
      else dotsWrap.style.removeProperty("--hero-dot-accent");
    }
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
        <span class="avatar" style="${avatarStyle(sellerName(u.id))}">${initialOf(sellerName(u.id))}</span>
        <div>
          <div class="artist-name">${esc(sellerName(u.id))}</div>
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

// 2026-10-20 추가: 난이도 필터가 체크박스 다중 선택으로 바뀌면서, 실제 비교에 쓸 선택된 5단계 값 목록을 여기서 정리한다.
// p.difficulties(배열)가 있으면 그대로 쓰고, 없을 때만 홈 화면 난이도 카드가 넘겨주는 예전 방식(p.difficulty, 3개 카테고리 중 하나)을
// DIFFICULTY_SUBTIERS로 풀어서 하위호환으로 써준다.
function selectedDifficulties(p) {
  if (Array.isArray(p.difficulties)) return p.difficulties;
  if (p.difficulty) {
    const sub = DIFFICULTY_SUBTIERS[p.difficulty];
    return sub && sub.length ? sub : [p.difficulty];
  }
  return [];
}

function filterScores(p) {
  const q = (p.q || "").trim().toLowerCase();
  let list = approvedScores();
  if (q) {
    list = list.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.artist.toLowerCase().includes(q) ||
      sellerName(s.sellerId).toLowerCase().includes(q) ||
      (s.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }
  if (p.instrument) list = list.filter(s => s.instrument === p.instrument);
  // 2026-10-20 변경: 난이도 필터는 체크박스 다중 선택으로 바뀌어, 선택된 5단계 값과 직접 비교한다.
  const diffs = selectedDifficulties(p);
  if (diffs.length) list = list.filter(s => diffs.includes(s.difficulty));
  if (p.video) list = list.filter(s => s.hasVideo);
  if (p.minPrice) list = list.filter(s => effectivePrice(s) >= Number(p.minPrice));
  if (p.maxPrice) list = list.filter(s => effectivePrice(s) <= Number(p.maxPrice));

  const sort = p.sort || "popular";
  const byDate = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
  if (sort === "latest") list.sort(byDate);
  else if (sort === "priceLow") list.sort((a, b) => effectivePrice(a) - effectivePrice(b) || byDate(a, b));
  else if (sort === "priceHigh") list.sort((a, b) => effectivePrice(b) - effectivePrice(a) || byDate(a, b));
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

  // 2026-10-20 변경: 난이도 필터를 체크박스 다중 선택으로 바꾸면서, 매우 쉬움부터 매우 어려움까지 5단계를 전부 보여준다.
  const DIFF_CHECK_ORDER = ["매우 쉬움", "쉬움", "보통", "어려움", "매우 어려움"];
  const checkedDiffs = selectedDifficulties(p);

  el.innerHTML = `
    <div class="breadcrumb"><button data-go="home">홈</button> › ${title}</div>
    <h1 class="page-title">${title}</h1>
    <p class="muted" style="margin:0 0 16px;">${list.length}개의 악보${p.q ? ` <button class="more-link" id="clear-q">검색어 지우기 ✕</button>` : ""}</p>

    <div class="panel filter-panel">
      <div class="filter-line">
        <span class="filter-label">악기</span>
        <div class="chip-row">
          ${["", ...INSTRUMENTS].map(i => `<button class="chip ${(p.instrument || "") === i ? "active" : ""}" data-f-inst="${esc(i)}">${i ? esc(i) : "전체"}</button>`).join("")}
        </div>
      </div>
      <div class="filter-line" style="flex-wrap:wrap;">
        <span class="filter-label">난이도</span>
        ${DIFF_CHECK_ORDER.map(d => `<label class="toggle"><input type="checkbox" data-f-diff value="${esc(d)}" ${checkedDiffs.includes(d) ? "checked" : ""}> ${esc(d)}</label>`).join("")}
      </div>
      <div class="filter-line" style="flex-wrap:wrap;">
        <span class="filter-label">조건</span>
        <label class="toggle"><input type="checkbox" id="f-video" ${p.video ? "checked" : ""}> 연주영상 있음</label>
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
      ? `<div class="score-grid">${shown.map(s => scoreCard(s, { hideVideoBadge: true })).join("")}</div>`
      : `<div class="empty">
           <p style="margin:0 0 10px;">조건에 맞는 악보가 없어요.</p>
           <button class="btn btn-small" id="go-request">이 곡 신청하기</button>
         </div>`}

    ${pages > 1 ? renderPager(current, pages) : ""}
  `;

  bindCards(el);
  el.querySelectorAll("[data-f-inst]").forEach(b => b.addEventListener("click", () => update({ instrument: b.dataset.fInst })));
  el.querySelectorAll("[data-f-diff]").forEach(cb => cb.addEventListener("change", () => {
    const cur = selectedDifficulties(p);
    const next = cb.checked ? [...cur, cb.value] : cur.filter(d => d !== cb.value);
    update({ difficulties: next, difficulty: "" });
  }));
  document.getElementById("f-video")?.addEventListener("change", (e) => update({ video: e.target.checked }));
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
  el.querySelectorAll("[data-page-nav]").forEach(b => b.addEventListener("click", () => {
    if (b.disabled) return;
    const target = current + (b.dataset.pageNav === "prev" ? -1 : 1);
    goBuyer("list", Object.assign({}, p, { page: Math.min(pages, Math.max(1, target)) }));
  }));

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

  const previewImgs = previewImages(s);
  const ytEmbed = s.hasVideo ? youtubeEmbedUrl(s.videoUrl) : null;

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
    buyArea = `<div class="panel" style="margin-top:14px;background:var(--band);">내가 등록한 악보예요. 판매 현황은 판매자 센터에서 볼 수 있어요.</div>`;
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
        <button class="btn wish-big" id="d-wish" aria-label="${wished ? "찜 해제" : "찜하기"}" style="color:${wished ? "var(--hot)" : "var(--text)"};">${wished ? "♥" : "♡"}</button>
      </div>
      ${user ? `
      <div class="buy-points">
        <div class="buy-points-row">
          <span class="buy-points-label">보유 포인트</span>
          <span class="buy-points-value">${formatPoint(user.points)}</span>
        </div>
        ${user.points < effectivePrice(s)
          ? `<div class="buy-points-short">${formatPoint(effectivePrice(s) - user.points)} 부족</div>`
          : `<div class="buy-points-ok">✓ 포인트로 바로 구매할 수 있어요</div>`}
      </div>` : ""}`;
  }

  el.innerHTML = `
    <div class="detail-page-bleed"><div class="detail-page">
    <div class="breadcrumb">
      <button data-go="home">홈</button> › <button data-go="list:instrument:${esc(s.instrument)}">${esc(s.instrument)}</button> › ${esc(s.title)}
    </div>

    <div class="detail-grid">
      <div>
        <div class="preview-box">
          <div class="preview-sheet">
            ${previewImgs
              ? `<div class="ps-img">
                   <img src="${esc(previewImgs[0])}" alt="${esc(s.title)} 미리보기" loading="lazy">
                   ${previewImgs.length > 1 ? `
                     <button class="preview-nav-arrow" data-preview-nav="prev" aria-label="이전 페이지" disabled>${pagerArrowIcon("left")}</button>
                     <button class="preview-nav-arrow" data-preview-nav="next" aria-label="다음 페이지">${pagerArrowIcon("right")}</button>
                     <span class="preview-page-count">1 / ${previewImgs.length}</span>` : ""}
                 </div>`
              : `<div class="ps-svg">${sheetArt(s.title + s.id, themeOf(s.instrument).ink, 4)}</div>`}
            <div class="ps-fade"></div>
          </div>
        </div>
        ${s.hasVideo ? (ytEmbed
          ? `<div class="video-embed-wrap">
               <iframe src="${esc(ytEmbed)}" title="${esc(s.title)} 연주 영상" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
             </div>`
          : `<a class="video-card" href="${esc(s.videoUrl || "#")}" target="_blank" rel="noopener">
               <span class="video-play">▶</span>
               <span><span class="vc-title">연주 영상 보기</span><br><span class="vc-sub">${esc(sellerName(s.sellerId))}님이 직접 연주한 영상 (새 창으로 열려요)</span></span>
             </a>`) : ""}
      </div>

      <div>
        <div class="tags">
          <span class="tag">${esc(s.instrument)}</span>
          <span class="tag tag-diff" style="${diffTagStyle(s.difficulty)}">${esc(s.difficulty)}</span>
          ${s.hasVideo ? `<span class="tag" style="background:var(--primary-soft);color:var(--hot);">▶ 연주영상</span>` : ""}
        </div>
        <h1 class="detail-title" style="margin-top:8px;">${esc(s.title)}</h1>
        <div class="detail-artist">${esc(s.artist)}</div>
        <div class="rating" style="margin-top:6px;">
          ${rating.count ? `<span class="stars">${starsText(rating.avg)}</span> ${rating.avg} · 리뷰 ${rating.count}개` : "아직 리뷰가 없어요"}
        </div>

        <div class="seller-box">
          <span class="avatar" style="width:40px;height:40px;font-size:15px;${avatarStyle(seller ? sellerName(seller.id) : "")}">${initialOf(seller ? sellerName(seller.id) : "")}</span>
          <div style="flex:1;min-width:0;">
            <div class="sb-name" data-artist-id="${s.sellerId}">${esc(sellerName(s.sellerId))} ›</div>
            <div class="sb-meta">악보 ${st.scoreCount} · 누적 판매 ${st.sales} · 구독자 ${st.followers}</div>
          </div>
          ${own ? "" : `<button class="btn btn-small ${following ? "" : "btn-primary"}" id="d-follow">${following ? "구독중" : "+ 구독"}</button>`}
        </div>

        <div class="price-big">${priceHtml(s)}</div>
        ${buyArea}
        <p class="buy-note">구매 후 ${POLICY.refund.windowDays}일 이내, 파일을 열지 않았다면 포인트로 전액 환불돼요. 구매한 악보는 마이페이지 › 내 악보함에서 같은 기간(${POLICY.refund.windowDays}일) 안에 다시 받을 수 있어요.</p>
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2>악보 상세 정보</h2></div>
      <div class="info-table-wrap">
        <div class="spec-grid">
          <div class="spec-item"><span class="spec-k">악기</span><span class="spec-v">${esc(s.instrument)}</span></div>
          <div class="spec-item"><span class="spec-k">난이도</span><span class="spec-v">${esc(s.difficulty)}</span></div>
          <div class="spec-item"><span class="spec-k">파일</span><span class="spec-v">PDF</span></div>
          ${/* 2026-10-29: 페이지 행을 항상 표시(6칸이라 2열 표의 빈 칸도 사라짐). 페이지 수가 아직 저장되지 않은 기존 악보는 "-"로 표시하고,
               관리자 > 기존 악보 페이지 수 일괄 계산을 돌리면 숫자로 채워진다. */""}
          <div class="spec-item${s.pageCount ? "" : " spec-meta"}"><span class="spec-k">전체 페이지</span><span class="spec-v">${s.pageCount ? `${s.pageCount}페이지` : "-"}</span></div>
          <div class="spec-item spec-meta"><span class="spec-k">등록일</span><span class="spec-v">${formatDate(s.approvedAt || s.createdAt)}</span></div>
          <div class="spec-item spec-meta"><span class="spec-k">조회 · 판매</span><span class="spec-v">${s.viewCount.toLocaleString("ko-KR")}회 · ${s.salesCount}건</span></div>
        </div>
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
        ${renderScoreCarousel(sameSeller)}
      </div>` : ""}

    ${together.length ? `
      <div class="section">
        <div class="section-head"><h2>함께 많이 산 악보</h2></div>
        ${renderScoreCarousel(together)}
      </div>` : ""}
    </div></div>
  `;

  bindCards(el);
  bindScoreCarousels(el);
  bindPreviewCarousel(el, previewImgs);

  document.getElementById("d-buy")?.addEventListener("click", () => requireLogin(async () => {
    const u = getCurrentUser();
    if (hasPurchased(u.id, s.id)) { renderBuyer(); return; }
    if (u.points < effectivePrice(s)) {
      toast(`포인트가 ${formatPoint(effectivePrice(s) - u.points)} 부족해요. 충전 화면으로 이동합니다.`, true);
      goBuyer("mypage", { tab: "points", back: s.id });
      return;
    }
    const res = await purchaseScore(u.id, s.id);
    if (!res.ok) { toast(res.message, true); renderBuyer(); return; }
    toast(`"${s.title}" 구매 완료! 내 악보함에서 받을 수 있어요.`);
    renderBuyer();
    renderHeaderAuth();
  }));
  document.getElementById("d-cart")?.addEventListener("click", () => requireLogin(() => {
    const u = getCurrentUser();
    if (u.cart.includes(s.id)) { goBuyer("cart"); return; }
    const res = addToCart(u.id, s.id);
    if (!res.ok) { toast(res.message, true); return; }
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
  else if (sort === "priceLow") list.sort((a, b) => effectivePrice(a) - effectivePrice(b));
  else list.sort((a, b) => b.salesCount - a.salesCount);
  const videoCount = approvedScores().filter(s => s.sellerId === u.id && s.hasVideo).length;

  el.innerHTML = `
    <div class="breadcrumb"><button data-go="home">홈</button> › 아티스트 › ${esc(sellerName(u.id))}</div>
    <div class="artist-hero">
      <span class="avatar lg" style="${avatarStyle(sellerName(u.id))}">${initialOf(sellerName(u.id))}</span>
      <div style="flex:1;min-width:200px;">
        <h1>${esc(sellerName(u.id))}</h1>
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
    toast(res.added ? `${sellerName(u.id)}님을 구독했어요` : "구독을 취소했어요");
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
  const total = valid.reduce((sum, s) => sum + effectivePrice(s), 0);
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
                <b style="white-space:nowrap;">${priceHtml(s)}</b>
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
  document.getElementById("cart-buy")?.addEventListener("click", async () => {
    const res = await purchaseCart(user.id);
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
  // 2026-10-19 추가: "아티스트 되기" 탭은 아직 판매자가 아닌 회원(role === "buyer")에게만 보여준다.
  const tabs = [["library", "내 악보함"], ["points", "포인트 · 충전"]];
  if (user.role === "buyer") tabs.push(["artist", "아티스트 되기"]);
  tabs.push(["wish", `찜한 악보 ${user.wishlist.length}`], ["following", `구독 아티스트 ${user.following.length}`], ["recent", "최근 본 악보"], ["inquiry", "1:1 문의"]);

  let body = "";
  if (tab === "points") body = myPointsHTML(user, p);
  else if (tab === "artist") body = myArtistHTML(user);
  // 2026-10-20 추가: 마이페이지에서도 1:1 문의(문의하기 + 내 문의 내역)를 바로 볼 수 있게,
  // 고객센터 화면에서 쓰던 renderSupportQna()를 그대로 재사용한다(중복 구현 방지).
  else if (tab === "inquiry") body = `<div id="mypage-qna-mount"></div>`;
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
          <button class="btn btn-small" style="margin-top:10px;background:var(--accent);border-color:var(--accent);color:var(--on-accent);" data-tab="points">충전하기</button>
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

  // 2026-10-20 추가: "1:1 문의" 탭은 고객센터의 renderSupportQna()를 그대로 호출해서 채운다.
  if (tab === "inquiry") {
    const qnaMount = document.getElementById("mypage-qna-mount");
    if (qnaMount) renderSupportQna(qnaMount, user);
  }

  // 내 악보함 버튼
  el.querySelectorAll("[data-download]").forEach(b => b.addEventListener("click", async () => {
    if (b.disabled) return;
    // 2026-10-20 추가: 서명된 다운로드 URL을 만들기 전에 먼저 기한(구매 후 7일) 체크부터 한다.
    const preCheck = canDownloadPurchase(b.dataset.download);
    if (!preCheck.ok) { toast(preCheck.message, true); renderBuyer(); return; }
    b.disabled = true;
    const originalText = b.textContent;
    b.textContent = "준비 중...";
    try {
      const urlRes = await getScoreDownloadUrl(STATE.purchases[b.dataset.download]?.scoreId);
      if (!urlRes.ok) { toast(urlRes.message, true); return; }
      const res = downloadPurchase(b.dataset.download);
      if (!res.ok) { toast(res.message, true); return; }
      const a = document.createElement("a");
      a.href = urlRes.url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast("파일을 받았어요");
      renderBuyer();
    } finally {
      b.disabled = false;
      b.textContent = originalText;
    }
  }));
  el.querySelectorAll("[data-refund]").forEach(b => b.addEventListener("click", async () => {
    if (b.dataset.confirm !== "1") {
      b.dataset.confirm = "1";
      b.textContent = "정말 환불할까요? 한 번 더 누르기";
      b.classList.add("btn-accent");
      return;
    }
    const res = await refundPurchase(b.dataset.refund);
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

  // 아티스트 되기 신청 — 2026-10-20: 파일 업로드 + 이메일 도메인 선택 UI 추가
  document.getElementById("aa-sample")?.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    const nameEl = document.getElementById("aa-sample-name");
    if (nameEl) nameEl.textContent = f ? f.name : "선택된 파일 없음";
  });
  document.getElementById("aa-email-domain-select")?.addEventListener("change", (e) => {
    if (e.target.value) document.getElementById("aa-email-domain").value = e.target.value;
  });
  document.getElementById("aa-cancel")?.addEventListener("click", () => {
    goBuyer("mypage", { tab: "library" });
  });
  document.getElementById("aa-submit")?.addEventListener("click", async () => {
    const msgEl = document.getElementById("artist-apply-msg");
    const setMsg = (text, isError) => { if (msgEl) { msgEl.textContent = text; msgEl.style.color = isError ? "var(--danger)" : "var(--text)"; } };

    const fileInput = document.getElementById("aa-sample");
    const file = fileInput && fileInput.files && fileInput.files[0];
    const phone = [document.getElementById("aa-phone1").value, document.getElementById("aa-phone2").value, document.getElementById("aa-phone3").value]
      .map(v => v.trim()).filter(Boolean).join("-");
    const emailLocal = document.getElementById("aa-email-local").value.trim();
    const emailDomain = document.getElementById("aa-email-domain").value.trim();
    const email = emailLocal && emailDomain ? `${emailLocal}@${emailDomain}` : "";

    if (!file) { setMsg("악보/MR 샘플 파일을 선택해주세요.", true); return; }

    const submitBtn = document.getElementById("aa-submit");
    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = "업로드 중...";
    setMsg("");
    try {
      const uploadRes = await uploadArtistSampleFile(user.id, file);
      if (!uploadRes.ok) { setMsg(uploadRes.message, true); return; }

      const res = submitArtistApplication(user.id, {
        name: document.getElementById("aa-realname").value,
        artistName: document.getElementById("aa-name").value,
        phone,
        email,
        videoUrl: document.getElementById("aa-video").value,
        sampleFileUrl: uploadRes.url
      });
      if (!res.ok) { setMsg(res.message, true); return; }
      toast("아티스트 신청을 보냈어요. 심사 결과는 이 화면에서 확인할 수 있어요.");
      renderBuyer();
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
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
      <p class="muted" style="margin:0 0 8px;font-size:12px;">환불은 파일을 열기 전, 다운로드는 구매 후 ${POLICY.refund.windowDays}일 이내만 가능해요.</p>
      ${list.map(x => {
        const s = STATE.scores[x.scoreId];
        const title = s ? s.title : "삭제된 악보";
        const reviewed = Object.values(STATE.reviews).some(r => r.buyerId === user.id && r.scoreId === x.scoreId);
        if (x.refunded) {
          return `<div class="row-item"><div class="row-main"><div class="row-title" ${s ? `data-score-id="${s.id}"` : ""}>${esc(title)}</div><div class="row-sub" style="color:var(--danger);">환불 완료 · ${formatDate(x.refundedAt)}</div></div></div>`;
        }
        const canRefund = x.price > 0 && !x.downloaded && new Date() <= new Date(x.refundDeadline);
        // 2026-10-20 추가: 다운로드 기한(구매 후 7일, 오늘 이후 구매분부터만 적용) 체크
        const dlCheck = canDownloadPurchase(x.id);
        const downloadExpired = !dlCheck.ok && !x.refunded;
        return `
          <div class="row-item">
            <div class="row-main">
              <div class="row-title" ${s ? `data-score-id="${s.id}"` : ""}>${esc(title)}</div>
              <div class="row-sub">${x.price === 0 ? "신청곡 무료 지급" : formatPoint(x.price)} · 구매 ${formatDate(x.purchasedAt)}${downloadExpired ? ` · <span style="color:var(--danger);">${esc(dlCheck.message)}</span>` : x.downloaded ? ` · 받음 ${formatDate(x.downloadedAt)}` : canRefund ? ` · 환불 가능 ~${formatDate(x.refundDeadline)}` : ""}</div>
            </div>
            <div class="row-actions">
              <button class="btn btn-primary btn-small" data-download="${x.id}" ${downloadExpired ? "disabled" : ""}>${downloadExpired ? "기한 만료" : x.downloaded ? "다시 받기" : "다운로드"}</button>
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
    ${backScore ? `<div class="panel" style="margin-bottom:12px;background:var(--band);border-color:var(--border);">"${esc(backScore.title)}" 구매에 ${formatPoint(effectivePrice(backScore))}가 필요해요. 충전하면 바로 악보 화면으로 돌아갑니다.</div>` : ""}
    ${p.backCart ? `<div class="panel" style="margin-bottom:12px;background:var(--band);border-color:var(--border);">충전하면 장바구니로 돌아갑니다.</div>` : ""}
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
   아티스트 되기 (2026-10-19 추가)
   마이페이지 › 아티스트 되기 탭의 내용. 신청 내역이 없거나 지난번에 거절됐으면
   신청 폼을 보여주고, 심사 대기 중이면 상태만 보여준다(재신청 불가).
   ============================================================ */

function myArtistHTML(user) {
  const app = getLatestArtistApplication(user.id);

  if (app && app.status === "심사대기") {
    return `
      <div class="panel">
        ${artistStepsHTML(2)}
        <h2 style="margin:0 0 4px;font-size:17px;">아티스트 가입</h2>
        <p class="muted" style="margin:0 0 14px;">심사 대기 중이에요. 결과가 나오면 이 화면에서 바로 확인할 수 있어요.</p>
        <div class="row-item" style="border-top:none;">
          <div class="row-main">
            <div class="row-title" style="cursor:default;">${esc(app.artistName)}</div>
            <div class="row-sub">신청일 ${formatDate(app.createdAt)}</div>
          </div>
          <span class="status-pill" style="background:#f6e7c4;color:#7a5410;">심사대기</span>
        </div>
      </div>`;
  }

  if (app && app.status === "거절") {
    return `
      <div class="panel">
        ${artistStepsHTML(1)}
        <h2 style="margin:0 0 4px;font-size:17px;">아티스트 가입</h2>
        <p class="muted" style="margin:0 0 4px;">아쉽지만 이번 신청은 승인되지 않았어요. 아래 사유를 참고해 다시 신청할 수 있어요.</p>
        <div style="padding:10px;margin:10px 0 16px;background:color-mix(in oklch,var(--danger) 10%,var(--card));border-radius:8px;font-size:13px;color:var(--danger);">
          거절 사유: ${esc(app.rejectReason || "사유 없음")}
        </div>
        ${artistApplyFormHTML()}
      </div>`;
  }

  return `
    <div class="panel">
      ${artistStepsHTML(1)}
      <h2 style="margin:0 0 4px;font-size:17px;">아티스트 가입</h2>
      <p class="muted" style="margin:0 0 14px;">아티스트로 신청하면 관리자 확인 후 이 계정으로 악보를 등록할 수 있어요.</p>
      ${artistApplyFormHTML()}
    </div>`;
}

/* 2026-10-20 추가: "01 정보 입력 > 02 가입완료" 진행 단계 표시줄. step=1 이면 아직 입력 중,
   step=2 면 접수(심사대기)까지 끝난 상태다. */
function artistStepsHTML(step) {
  return `
    <div class="aa-steps">
      <span class="aa-step${step === 1 ? " aa-step-active" : ""}">01 정보 입력</span>
      <span class="aa-step-sep">&gt;</span>
      <span class="aa-step${step === 2 ? " aa-step-active" : ""}">02 가입완료</span>
    </div>`;
}

/* 2026-10-20 디자인 변경: 신청 항목을 이름·아티스트명·휴대폰·이메일·판매자 영상·악보/MR 샘플
   파일로 전면 교체했다(기존 활동소개·판매계획·연락처·포트폴리오링크 칸은 없앴다).
   입력칸 테두리는 공용 .field 를 그대로 쓰지 않고 이 화면 전용 .aa-field 를 새로 둬서
   1px solid #D5D0CA 로만 다르게 입힌다(다른 화면 입력칸에는 영향 없음). */
function artistApplyFormHTML() {
  return `
    <div id="artist-apply-msg" style="font-size:13px;margin:0 0 10px;"></div>
    <div class="aa-form">
      <div class="aa-row">
        <div class="aa-label">악보/MR 샘플 *</div>
        <div class="aa-input-wrap">
          <div class="aa-file-row">
            <label class="aa-file-btn" for="aa-sample">파일 선택</label>
            <span class="aa-file-name" id="aa-sample-name">선택된 파일 없음</span>
          </div>
          <input type="file" id="aa-sample" accept=".pdf,.jpg,.jpeg,.mp3" style="display:none;">
          <p class="aa-note">※ 악보샘플 1개만 업로드 // PDF, JPG, MP3 업로드 가능</p>
        </div>
      </div>
      <div class="aa-row">
        <div class="aa-label">판매자 영상 *</div>
        <div class="aa-input-wrap">
          <textarea class="aa-field" id="aa-video" rows="4"></textarea>
          <p class="aa-note">※ 유튜브채널 url을 입력해주세요</p>
        </div>
      </div>
      <div class="aa-row">
        <div class="aa-label">이름 *</div>
        <div class="aa-input-wrap"><input class="aa-field" id="aa-realname"></div>
      </div>
      <div class="aa-row">
        <div class="aa-label">아티스트명 *</div>
        <div class="aa-input-wrap"><input class="aa-field" id="aa-name" placeholder="구매자에게 보일 이름"></div>
      </div>
      <div class="aa-row">
        <div class="aa-label">휴대폰 *</div>
        <div class="aa-input-wrap">
          <div class="aa-phone-row">
            <input class="aa-field aa-phone-part" id="aa-phone1" maxlength="3" inputmode="numeric">
            <span class="aa-dash">-</span>
            <input class="aa-field aa-phone-part" id="aa-phone2" maxlength="4" inputmode="numeric">
            <span class="aa-dash">-</span>
            <input class="aa-field aa-phone-part" id="aa-phone3" maxlength="4" inputmode="numeric">
            <button type="button" class="aa-verify-btn" disabled>휴대전화번호 인증</button>
          </div>
          <p class="aa-note">※ 지금은 별도 인증 없이 입력한 번호 그대로 접수돼요</p>
        </div>
      </div>
      <div class="aa-row">
        <div class="aa-label">이메일 *</div>
        <div class="aa-input-wrap">
          <div class="aa-email-row">
            <input class="aa-field" id="aa-email-local" placeholder="이메일">
            <span class="aa-at">@</span>
            <input class="aa-field" id="aa-email-domain">
            <select class="aa-field aa-email-select" id="aa-email-domain-select">
              <option value="">직접입력</option>
              <option value="naver.com">naver.com</option>
              <option value="gmail.com">gmail.com</option>
              <option value="daum.net">daum.net</option>
            </select>
          </div>
        </div>
      </div>
    </div>
    <div class="aa-btn-row">
      <button type="button" class="aa-cancel-btn" id="aa-cancel">가입취소</button>
      <button type="button" class="aa-submit-btn" id="aa-submit">다음단계</button>
    </div>`;
}

/* ============================================================
   신청곡
   ============================================================ */

let REQ_FILTER = "";
let REQ_INST_FILTER = ""; // 2026-10-16 추가: 게시판 악기 분류 필터

function renderRequestsPage(el) {
  const user = getCurrentUser();
  const prefill = BUYER_ROUTE.params.prefill || "";
  let list = Object.values(STATE.requests);
  if (REQ_INST_FILTER) list = list.filter(r => r.instrument === REQ_INST_FILTER);
  if (REQ_FILTER === "mine") list = list.filter(r => user && r.buyerIds.includes(user.id));
  else if (REQ_FILTER) list = list.filter(r => r.status === REQ_FILTER);
  list.sort((a, b) => (a.status === "완료") - (b.status === "완료") || b.buyerIds.length - a.buyerIds.length);

  el.innerHTML = `
    <div class="breadcrumb"><button data-go="home">홈</button> › 신청곡</div>
    <h1 class="page-title">신청곡</h1>
    <p class="muted" style="margin:0 0 16px;line-height:1.6;">찾는 악보가 없으면 누구나 무료로 자유롭게 올릴 수 있는 게시판이에요. 신청이 많은 곡부터 채보해서 악보로 만들어요.</p>

    <div class="two-col req-layout">
      <div class="panel req-form-panel" style="display:flex;flex-direction:column;gap:8px;">
        <h2 style="margin:0 0 4px;font-size:16px;">새 곡 신청하기</h2>
        <input class="field" id="rq-title" placeholder="곡 제목" value="${esc(prefill)}">
        <input class="field" id="rq-composer" placeholder="작곡가">
        <input class="field" id="rq-singer" placeholder="가수 / 원곡자">
        <select class="field" id="rq-inst">${INSTRUMENTS.map(i => `<option value="${esc(i)}">${esc(i)}</option>`).join("")}</select>
        <textarea class="field" id="rq-note" rows="3" placeholder="요청 메모 (선택 — 편곡 스타일, 참고 영상 등)"></textarea>
        <button class="btn btn-primary" id="rq-submit">신청하기</button>
        <p class="muted" style="margin:0;font-size:11px;">같은 곡·작곡가·가수·악기를 이미 누가 신청했다면 그 신청에 함께 이름이 올라가요.</p>
      </div>
      <div>
        <div class="chip-row" style="margin-bottom:8px;">
          <button class="chip ${REQ_INST_FILTER ? "" : "active"}" data-rq-inst="">전체 악기</button>
          ${INSTRUMENTS.map(i => `<button class="chip ${REQ_INST_FILTER === i ? "active" : ""}" data-rq-inst="${esc(i)}">${esc(i)}</button>`).join("")}
        </div>
        <div class="chip-row" style="margin-bottom:10px;">
          ${[["", "전체"], ...REQUEST_STATUS.map(s => [s, s]), ...(user ? [["mine", "내 신청"]] : [])].map(([v, l]) => `<button class="chip ${REQ_FILTER === v ? "active" : ""}" data-rq-filter="${v}">${l}</button>`).join("")}
        </div>
        <div class="panel req-list-panel">
          ${list.length ? list.map((r, i) => {
            const joined = user && r.buyerIds.includes(user.id);
            const likedBy = r.likedBy || [];
            const liked = user && likedBy.includes(user.id);
            return `
              <div class="req-item">
                <div class="req-count"><b>${r.buyerIds.length}</b><span>명</span></div>
                <div class="row-main" style="flex:1;">
                  <div class="row-title" style="cursor:default;">${esc(r.title)}</div>
                  <div class="row-sub">${esc(r.composer)} 작곡 · ${esc(r.singer)} · ${esc(r.instrument)}${joined ? " · 내가 신청함" : ""}</div>
                  ${r.note ? `<div class="row-sub" style="margin-top:2px;white-space:pre-wrap;">${esc(r.note)}</div>` : ""}
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
                  <span class="status-pill st-${esc(r.status)}">${esc(r.status)}</span>
                  <div style="display:flex;gap:6px;align-items:center;">
                    <button type="button" class="btn btn-small" data-rq-like="${r.id}" style="color:${liked ? "var(--hot)" : "var(--text)"};">추천 ${likedBy.length}</button>
                    ${r.status === "완료" && r.fulfilledScoreId
                      ? `<button class="btn btn-small" data-score-id="${r.fulfilledScoreId}">악보 보기</button>`
                      : joined ? "" : `<button class="btn btn-small" data-join="${r.id}">신청하기</button>`}
                  </div>
                </div>
              </div>`;
          }).join("") : `<p class="muted" style="margin:0;">해당하는 신청곡이 없어요.</p>`}
        </div>
      </div>
    </div>
  `;

  bindCards(el);
  el.querySelectorAll("[data-rq-filter]").forEach(b => b.addEventListener("click", () => { REQ_FILTER = b.dataset.rqFilter; renderBuyer(); }));
  el.querySelectorAll("[data-rq-inst]").forEach(b => b.addEventListener("click", () => { REQ_INST_FILTER = b.dataset.rqInst; renderBuyer(); }));
  document.getElementById("rq-submit")?.addEventListener("click", () => {
    const data = {
      title: document.getElementById("rq-title").value,
      composer: document.getElementById("rq-composer").value,
      singer: document.getElementById("rq-singer").value,
      instrument: document.getElementById("rq-inst").value,
      note: document.getElementById("rq-note").value
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
      const res = submitSongRequest(getCurrentUser().id, { title: r.title, composer: r.composer, singer: r.singer, instrument: r.instrument });
      if (!res.ok) { toast(res.message, true); return; }
      toast(`"${r.title}" 신청에 함께했어요`);
      renderBuyer();
      renderHeaderAuth();
    });
  }));
  el.querySelectorAll("[data-rq-like]").forEach(b => b.addEventListener("click", () => {
    requireLogin(() => {
      const res = toggleRequestLike(getCurrentUser().id, b.dataset.rqLike);
      if (!res.ok) { toast(res.message, true); return; }
      renderBuyer();
    });
  }));
}

/* ============================================================
   고객센터 (FAQ · 1:1 문의)
   ============================================================ */

function renderSupportPage(el, p) {
  if (p && p.tab) { SUPPORT_TAB = p.tab; }
  const user = getCurrentUser();

  el.innerHTML = `
    <div class="breadcrumb"><button data-go="home">홈</button> › 고객센터</div>
    <h1 class="page-title">고객센터</h1>
    <div class="chip-row" style="margin-bottom:16px;">
      <button class="chip ${SUPPORT_TAB === "faq" ? "active" : ""}" data-support-tab="faq">자주 묻는 질문</button>
      <button class="chip ${SUPPORT_TAB === "qna" ? "active" : ""}" data-support-tab="qna">1:1 문의</button>
    </div>
    <div id="support-body"></div>
  `;

  bindCards(el);
  el.querySelectorAll("[data-support-tab]").forEach(b => b.addEventListener("click", () => {
    SUPPORT_TAB = b.dataset.supportTab;
    renderBuyer();
  }));

  const body = document.getElementById("support-body");
  if (SUPPORT_TAB === "qna") renderSupportQna(body, user);
  else renderSupportFaq(body);
}

function renderSupportFaq(body) {
  const cats = ["", ...[...new Set(FAQ_LIST.map(f => f.cat))]];
  const list = SUPPORT_FAQ_CAT ? FAQ_LIST.filter(f => f.cat === SUPPORT_FAQ_CAT) : FAQ_LIST;

  body.innerHTML = `
    <div class="chip-row" style="margin-bottom:12px;">
      ${cats.map(c => `<button class="chip ${SUPPORT_FAQ_CAT === c ? "active" : ""}" data-faq-cat="${esc(c)}">${c ? esc(c) : "전체"}</button>`).join("")}
    </div>
    <div class="panel faq-panel">
      ${list.map(f => {
        const open = SUPPORT_FAQ_OPEN === f.id;
        return `
          <div style="border-top:1px solid var(--border);">
            <button type="button" data-faq-toggle="${f.id}" style="all:unset;cursor:pointer;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;width:100%;padding:14px 0;">
              <span style="font-weight:600;font-size:14px;">Q. ${esc(f.q)}</span>
              <span class="muted" style="flex-shrink:0;">${open ? "▲" : "▼"}</span>
            </button>
            ${open ? `<div class="muted" style="padding:0 0 14px;font-size:13px;line-height:1.6;">A. ${esc(f.a())}</div>` : ""}
          </div>`;
      }).join("")}
    </div>
  `;

  body.querySelectorAll("[data-faq-cat]").forEach(b => b.addEventListener("click", () => {
    SUPPORT_FAQ_CAT = b.dataset.faqCat;
    SUPPORT_FAQ_OPEN = null;
    renderBuyer();
  }));
  body.querySelectorAll("[data-faq-toggle]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.faqToggle;
    SUPPORT_FAQ_OPEN = SUPPORT_FAQ_OPEN === id ? null : id;
    renderBuyer();
  }));
}

function renderSupportQna(body, user) {
  if (!user) {
    body.innerHTML = `
      <div class="panel">
        <p class="muted" style="margin:0;">로그인하면 1:1 문의를 쓰고, 내 문의 내역과 답변을 볼 수 있어요.</p>
        <button class="btn btn-primary" id="qna-login-btn" style="margin-top:10px;">로그인</button>
      </div>`;
    document.getElementById("qna-login-btn")?.addEventListener("click", () => requireLogin(() => renderBuyer()));
    return;
  }

  const uniqScores = [...new Map(
    Object.values(STATE.purchases)
      .filter(p => p.buyerId === user.id)
      .map(p => STATE.scores[p.scoreId])
      .filter(Boolean)
      .map(s => [s.id, s])
  ).values()];

  const mine = getMyInquiries(user.id);

  body.innerHTML = `
    <div class="panel" style="margin-bottom:12px;">
      <button class="btn btn-primary" id="qna-new-btn">${SUPPORT_FORM_OPEN ? "접기" : "문의하기"}</button>
      ${SUPPORT_FORM_OPEN ? `
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;">
          <select class="field" id="qna-category">${INQUIRY_CATEGORIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select>
          <select class="field" id="qna-score">
            <option value="">관련 악보 선택 안 함</option>
            ${uniqScores.map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join("")}
          </select>
          <input class="field" id="qna-title" placeholder="제목">
          <textarea class="field" id="qna-content" rows="4" placeholder="문의 내용을 적어주세요" style="font-family:inherit;resize:vertical;"></textarea>
          <p class="muted" style="margin:0;font-size:11px;">이 문의는 본인과 관리자만 볼 수 있고, 악보를 골랐다면 그 악보의 판매자도 볼 수 있어요.</p>
          <button class="btn btn-primary" id="qna-submit">보내기</button>
        </div>` : ""}
    </div>
    <div class="panel">
      <h3 style="margin:0 0 10px;font-size:14px;">내 문의 내역</h3>
      ${mine.length ? mine.map(q => {
        const open = SUPPORT_QNA_OPEN === q.id;
        const score = q.scoreId && STATE.scores[q.scoreId];
        return `
          <div style="border-top:1px solid var(--border);padding:12px 0;">
            <button type="button" data-qna-toggle="${q.id}" style="all:unset;cursor:pointer;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;width:100%;">
              <span style="min-width:0;">
                <span class="status-pill st-${q.status === "답변완료" ? "완료" : "접수"}">${esc(q.status)}</span>
                <b style="margin-left:6px;font-size:14px;">${esc(q.title)}</b>
                <span class="muted" style="font-size:12px;display:block;margin-top:2px;">${esc(q.category)}${score ? ` · ${esc(score.title)}` : ""} · ${formatDate(q.createdAt)}</span>
              </span>
              <span class="muted" style="flex-shrink:0;">${open ? "▲" : "▼"}</span>
            </button>
            ${open ? `
              <div style="margin-top:10px;font-size:13px;line-height:1.6;">
                <div style="white-space:pre-wrap;">${esc(q.content)}</div>
                ${q.answer ? `
                  <div style="margin-top:10px;padding:10px;border-radius:8px;background:var(--bg);">
                    <b style="font-size:12px;color:var(--primary);">${q.answer.by === "seller" ? "판매자 답변" : "관리자 답변"} · ${formatDate(q.answer.answeredAt)}</b>
                    <div style="margin-top:4px;white-space:pre-wrap;">${esc(q.answer.text)}</div>
                  </div>` : `<p class="muted" style="margin:10px 0 0;">아직 답변 대기 중이에요.</p>`}
              </div>` : ""}
          </div>`;
      }).join("") : `<p class="muted" style="margin:0;">아직 문의한 내역이 없어요.</p>`}
    </div>
  `;

  document.getElementById("qna-new-btn")?.addEventListener("click", () => {
    SUPPORT_FORM_OPEN = !SUPPORT_FORM_OPEN;
    renderBuyer();
  });
  document.getElementById("qna-submit")?.addEventListener("click", () => {
    const data = {
      category: document.getElementById("qna-category").value,
      scoreId: document.getElementById("qna-score").value || null,
      title: document.getElementById("qna-title").value,
      content: document.getElementById("qna-content").value
    };
    const res = submitInquiry(user.id, data);
    if (!res.ok) { toast(res.message, true); return; }
    toast("문의를 보냈어요. 답변이 오면 여기서 확인할 수 있어요.");
    SUPPORT_FORM_OPEN = false;
    renderBuyer();
  });
  body.querySelectorAll("[data-qna-toggle]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.qnaToggle;
    SUPPORT_QNA_OPEN = SUPPORT_QNA_OPEN === id ? null : id;
    renderBuyer();
  }));
}
