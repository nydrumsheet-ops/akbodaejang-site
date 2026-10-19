/* ============================================================
   common.js — 악보대장(가칭) 뼈대 · 로그인 · 결제 · 정산 · 통합
   총괄/ 모드 전용 파일. 다른 모드(구매자/판매자/관리자)는
   이 파일의 함수를 호출만 하고 직접 수정하지 않습니다.

   2026-10-18 큰 변경: store_state 단일 JSON 한 덩어리 대신, 정식 테이블
   (users/scores/purchases/... 12개)을 기준으로 데이터를 읽고 쓴다.
   화면(buyer.js/seller.js/admin.js)에서 보는 STATE 모양은 예전과 완전히
   똑같이 유지해서, 그 세 파일은 거의 고치지 않아도 되게 만들었다.
   - load(): 12개 테이블에서 읽어 예전과 같은 모양(STATE)으로 조립한다.
   - save(): STATE를 통째로 보내지 않고, 직전 스냅샷(STATE_BASELINE)과
     비교해서 "바뀐 부분만" 찾아 해당 테이블에 정확히 반영한다(diff 저장).
   - 다만 "구매"와 "환불"만은 판매자 적립금·악보 판매건수처럼 본인이 아닌
     다른 사람의 데이터도 함께 바뀌어야 해서, 보안 규칙(RLS)상 일반 저장으로는
     안 되고 서버의 전용 함수(RPC: rpc_purchase_score / rpc_refund_purchase)를
     통해 처리한다. 이 두 함수는 비동기(async)로 바뀌었고, 이걸 부르는
     buyer.js 쪽 버튼 3곳에만 await가 추가되어 있다.
   ============================================================ */

const STORAGE_KEY = "madi.store.v1"; // 공유 서버에서 못 받아올 때 쓰는 이 브라우저용 백업 캐시
const SESSION_KEY = "madi.session.v1";
const RECENT_KEY = "madi.recent.v1"; // 최근 본 악보 (브라우저별 편의 기능, 서비스 데이터 아님)
const PENDING_SIGNUP_KEY = "madi.pendingSignup.v1"; // 회원가입 중 입력한 이름·역할 (이메일 인증 전까지 임시 보관)

/* 공유 서버(Supabase) 연결 정보. publishable key 는 공개되어도 되는 키다. */
const SUPABASE_URL = "https://qvnprznzritqopwqmqlq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Gf-vX_Cm_8sFZ_oGep5Azg_DtU0_yFK";
const SITE_URL = "https://akbodaejang-site.vercel.app"; // 로그인 이메일(인증·재설정)이 돌아올 주소

/* 이 이메일로 가입(또는 이미 가입)하면 관리자 권한이 자동으로 붙는다. (2026-10-13 추가)
   관리자를 더 추가/제거하려면 이 배열만 고치면 된다 — 다른 코드는 손댈 필요 없음. */
const ADMIN_EMAILS = ["nydrumsheet@gmail.com"];

function getAdminEmails() {
  return (STATE && Array.isArray(STATE.adminEmails)) ? STATE.adminEmails : ADMIN_EMAILS;
}

function isAdminEmail(email) {
  return getAdminEmails().includes((email || "").toLowerCase());
}

/* 관리자 계정 등록. 이메일만 미리 등록해두면, 그 이메일로 이미 가입돼 있으면 즉시 권한이 붙고
   아직 가입 전이면 나중에 그 이메일로 가입할 때 자동으로 관리자가 된다. */
function addAdminEmail(email) {
  const e = (email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(e)) return { ok: false, message: "올바른 이메일 주소를 입력해주세요." };
  if (!Array.isArray(STATE.adminEmails)) STATE.adminEmails = [...ADMIN_EMAILS];
  if (STATE.adminEmails.includes(e)) return { ok: false, message: "이미 관리자로 등록된 이메일입니다." };
  STATE.adminEmails.push(e);
  const user = findUserByEmail(e);
  if (user) user.isAdmin = true;
  save();
  return { ok: true, alreadyMember: !!user };
}

/* 관리자 지정 해제. 본인(지금 로그인한 관리자) 또는 마지막 남은 관리자는 해제할 수 없다 —
   관리자가 0명이 되어 아무도 관리자 화면에 못 들어가는 상황을 막기 위함. */
function removeAdminEmail(email) {
  const e = (email || "").trim().toLowerCase();
  if (!Array.isArray(STATE.adminEmails) || !STATE.adminEmails.includes(e)) {
    return { ok: false, message: "등록되지 않은 이메일입니다." };
  }
  const me = getCurrentUser();
  if (me && (me.email || "").toLowerCase() === e) {
    return { ok: false, message: "본인의 관리자 권한은 직접 해제할 수 없습니다." };
  }
  if (STATE.adminEmails.length <= 1) {
    return { ok: false, message: "마지막 남은 관리자는 해제할 수 없습니다." };
  }
  STATE.adminEmails = STATE.adminEmails.filter(x => x !== e);
  const user = findUserByEmail(e);
  if (user) user.isAdmin = false;
  save();
  return { ok: true };
}

const POLICY = {
  commission: {
    rate: 0.25   // 전체 공통 수수료 25% (아티스트 정산 75%) — 일반/창작·오리지널 구분 폐지 (2026-10-16)
  },
  discount: {
    minRate: 0.01, // 할인율 최소 1%
    maxRate: 0.90  // 할인율 최대 90% (2026-10-16 판매자 직접 할인 기능 추가)
  },
  point: {
    unit: 1,
    expiryYears: 5
  },
  chargeTiers: [
    { amount: 5000,  bonus: 0.00 },
    { amount: 10000, bonus: 0.05 },
    { amount: 30000, bonus: 0.07 },
    { amount: 50000, bonus: 0.10 }
  ],
  firstChargeBonus: 0.15, // ※ [미확정] 적용 방식, 공통규칙.md 참고
  // request: 포인트 납부 신청곡 제도는 폐지하고 무료 커뮤니티 게시판으로 전환했다 (2026-10-16)
  settlement: {
    minWithdraw: 20000,
    payoutDay: 10
  },
  refund: {
    windowDays: 7
  },
  preview: {
    bars: 8
  }
};

const INSTRUMENTS = ["드럼", "기타", "피아노", "베이스", "바이올린", "보컬"];
const DIFFICULTIES = ["초급", "중급", "고급"]; // 홈화면 큰 카테고리 3개 (변경 금지)
/* Score.difficulty 에 실제로 저장되는 5단계 값 (2026-10-18 추가).
   "초중급"은 "중급" 카테고리 안의 세부 단계, "프로"는 "고급" 카테고리 안의 세부 단계다.
   DIFFICULTIES(3개)는 홈화면 카테고리 이름 그대로 유지하고, 각 카테고리 화면 안에서
   세부 단계를 보여줄 때만 이 5단계 값과 DIFFICULTY_GROUP 을 사용한다. */
const SCORE_DIFFICULTIES = ["초급", "초중급", "중급", "프로", "고급"];
/* 5단계 세부값 → 홈화면 3개 카테고리 매핑. difficultyGroup() 을 통해서만 사용한다. */
const DIFFICULTY_GROUP = { "초급": "초급", "초중급": "중급", "중급": "중급", "프로": "고급", "고급": "고급" };
function difficultyGroup(d) {
  return DIFFICULTY_GROUP[d] || d;
}
/* 카테고리(초급/중급/고급) 안에서 보여줄 세부 단계 목록. 초급 카테고리는 세부 단계가 없다. */
const DIFFICULTY_SUBTIERS = { "초급": [], "중급": ["초중급", "중급"], "고급": ["프로", "고급"] };
const SCORE_STATUS = ["등록", "심사중", "승인", "반려"];
const WITHDRAW_STATUS = ["요청", "지급완료"];
const REQUEST_STATUS = ["접수", "채보중", "완료"];
const INQUIRY_STATUS = ["답변대기", "답변완료"];
const INQUIRY_CATEGORIES = ["결제·포인트", "환불", "악보·심사", "정산", "계정", "기타"];

let STATE = null;
let STATE_BASELINE = null; // 직전 load()/save() 성공 시점의 STATE 스냅샷 — save()가 이것과 비교해서 바뀐 것만 찾는다
let CURRENT_USER_ID = null;
let CURRENT_VIEW = "buyer";
let PENDING_ROLE = "buyer"; // 회원가입 폼이 지금 어떤 역할로 맞춰져 있는지. 기본값은 구매자
let AFTER_LOGIN = null;     // 로그인 모달을 띄운 동작 (로그인 끝나면 이어서 실행)
let SB_CLIENT = null;       // Supabase 클라이언트 (지연 생성, 로그인·테이블 읽기/쓰기 전부 이걸로 한다)

/* ---------- 기본 유틸 ---------- */

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowISO() {
  return new Date().toISOString();
}

function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPoint(n) {
  return `${Number(n || 0).toLocaleString("ko-KR")}P`;
}

function formatWon(n) {
  return `${Number(n || 0).toLocaleString("ko-KR")}원`;
}

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/* ---------- Supabase 클라이언트 ----------
   index.html 에서 불러온 supabase-js 라이브러리(window.supabase)로 클라이언트를 한 번만 만든다.
   로그인(Auth)과 테이블 읽기/쓰기 전부 이 클라이언트 하나로 한다 — 로그인하면 이 클라이언트가
   자동으로 그 사람의 토큰을 테이블 요청에도 실어 보내므로, 보안 규칙(RLS)이 올바르게 적용된다.
   라이브러리가 아직(또는 끝내) 로드되지 않았으면 null 을 돌려주고, 호출한 쪽에서 안내 문구를 보여준다. */

function getSb() {
  if (!SB_CLIENT && window.supabase && typeof window.supabase.createClient === "function") {
    SB_CLIENT = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return SB_CLIENT;
}

/* ---------- 테이블 행 ⇄ 화면 객체 변환 ----------
   화면(buyer.js 등)이 보는 STATE 모양(camelCase, 중첩 구조)은 예전 그대로 유지하고,
   실제 테이블 칼럼(snake_case)과 이 함수들로만 주고받는다. */

const COLLECTIONS = ["users", "scores", "purchases", "requests", "charges", "withdrawals", "reviews", "inquiries"];

function emptyState() {
  const s = {};
  for (const key of COLLECTIONS) s[key] = {};
  return s;
}

function cloneState(s) {
  return JSON.parse(JSON.stringify(s));
}

function rowFromUser(u) {
  const info = u.sellerInfo || null;
  return {
    id: u.id, name: u.name, email: u.email, role: u.role,
    points: Math.round(u.points || 0), is_first_charge: !!u.isFirstCharge,
    created_at: u.createdAt,
    wishlist: u.wishlist || [], cart: u.cart || [], following: u.following || [],
    supabase_user_id: u.supabaseUserId || null,
    is_admin: !!u.isAdmin,
    seller_bank_name: info ? (info.bankName || "") : null,
    seller_bank_account: info ? (info.bankAccount || "") : null,
    seller_account_holder: info ? (info.accountHolder || "") : null,
    seller_settle_balance: info ? Math.round(info.settleBalance || 0) : 0,
    seller_display_name: info ? (info.displayName || u.name) : null
  };
}
function userFromRow(r) {
  const u = {
    id: r.id, name: r.name, email: r.email, role: r.role,
    points: r.points, pointHistory: [], isFirstCharge: r.is_first_charge,
    createdAt: r.created_at, wishlist: r.wishlist || [], cart: r.cart || [], following: r.following || [],
    supabaseUserId: r.supabase_user_id, isAdmin: r.is_admin
  };
  if (r.role === "seller" || r.role === "both") {
    u.sellerInfo = {
      bankName: r.seller_bank_name || "", bankAccount: r.seller_bank_account || "",
      accountHolder: r.seller_account_holder || "", settleBalance: r.seller_settle_balance || 0,
      displayName: r.seller_display_name || r.name
    };
  }
  return u;
}

function rowFromScore(s) {
  const d = s.discount;
  return {
    id: s.id, seller_id: s.sellerId, title: s.title, artist: s.artist, instrument: s.instrument,
    difficulty: s.difficulty, price: Math.round(s.price || 0), has_video: !!s.hasVideo,
    video_url: s.videoUrl || null, file_url: s.fileUrl || null, preview_info: s.previewInfo || null,
    preview_url: s.previewUrl || null,
    status: s.status, reject_reason: s.rejectReason || null, created_at: s.createdAt,
    approved_at: s.approvedAt || null, sales_count: s.salesCount || 0, view_count: s.viewCount || 0,
    description: s.description || "", tags: s.tags || [], thumbnail_url: s.thumbnailUrl || null,
    discount_rate: d ? d.rate : null, discount_start: d ? d.startAt : null, discount_end: d ? d.endAt : null
  };
}
function scoreFromRow(r) {
  return {
    id: r.id, sellerId: r.seller_id, title: r.title, artist: r.artist, instrument: r.instrument,
    difficulty: r.difficulty, price: r.price, hasVideo: r.has_video, videoUrl: r.video_url,
    fileUrl: r.file_url, previewInfo: r.preview_info, previewUrl: r.preview_url || null,
    status: r.status, rejectReason: r.reject_reason,
    createdAt: r.created_at, approvedAt: r.approved_at, salesCount: r.sales_count, viewCount: r.view_count,
    description: r.description || "", tags: r.tags || [], thumbnailUrl: r.thumbnail_url,
    discount: (r.discount_rate != null && r.discount_start && r.discount_end)
      ? { rate: r.discount_rate, startAt: r.discount_start, endAt: r.discount_end } : null
  };
}

function rowFromPurchase(p) {
  return {
    id: p.id, buyer_id: p.buyerId, score_id: p.scoreId, seller_id: p.sellerId, price: Math.round(p.price || 0),
    commission_rate: p.commissionRate, seller_earning: Math.round(p.sellerEarning || 0), purchased_at: p.purchasedAt,
    downloaded: !!p.downloaded, downloaded_at: p.downloadedAt || null, refunded: !!p.refunded,
    refunded_at: p.refundedAt || null, refund_deadline: p.refundDeadline
  };
}
function purchaseFromRow(r) {
  return {
    id: r.id, buyerId: r.buyer_id, scoreId: r.score_id, sellerId: r.seller_id, price: r.price,
    commissionRate: r.commission_rate, sellerEarning: r.seller_earning, purchasedAt: r.purchased_at,
    downloaded: r.downloaded, downloadedAt: r.downloaded_at, refunded: r.refunded, refundedAt: r.refunded_at,
    refundDeadline: r.refund_deadline
  };
}

function rowFromRequest(r) {
  return {
    id: r.id, title: r.title, composer: r.composer || "", singer: r.singer || "", instrument: r.instrument,
    note: r.note || "", status: r.status, fulfilled_score_id: r.fulfilledScoreId || null, created_at: r.createdAt
  };
}
function requestFromRow(row) {
  return {
    id: row.id, title: row.title, composer: row.composer || "", singer: row.singer || "", instrument: row.instrument,
    note: row.note || "", status: row.status, fulfilledScoreId: row.fulfilled_score_id, createdAt: row.created_at,
    buyerIds: [], likedBy: []
  };
}

function rowFromCharge(c) {
  return {
    id: c.id, user_id: c.userId, amount: Math.round(c.amount || 0), tier_bonus: c.tierBonus || 0,
    applied_bonus: c.appliedBonus || 0, points_gained: Math.round(c.pointsGained || 0), charged_at: c.chargedAt
  };
}
function chargeFromRow(r) {
  return {
    id: r.id, userId: r.user_id, amount: r.amount, tierBonus: r.tier_bonus, appliedBonus: r.applied_bonus,
    pointsGained: r.points_gained, chargedAt: r.charged_at
  };
}

function rowFromWithdrawal(w) {
  return { id: w.id, seller_id: w.sellerId, amount: Math.round(w.amount || 0), status: w.status, requested_at: w.requestedAt, paid_at: w.paidAt || null };
}
function withdrawalFromRow(r) {
  return { id: r.id, sellerId: r.seller_id, amount: r.amount, status: r.status, requestedAt: r.requested_at, paidAt: r.paid_at };
}

function rowFromReview(rv) {
  return { id: rv.id, score_id: rv.scoreId, buyer_id: rv.buyerId, rating: rv.rating, felt_difficulty: rv.feltDifficulty || null, text: rv.text, created_at: rv.createdAt };
}
function reviewFromRow(r) {
  return { id: r.id, scoreId: r.score_id, buyerId: r.buyer_id, rating: r.rating, feltDifficulty: r.felt_difficulty || "", text: r.text, createdAt: r.created_at };
}

function rowFromInquiry(q) {
  return {
    id: q.id, buyer_id: q.buyerId, category: q.category, title: q.title, content: q.content, status: q.status,
    score_id: q.scoreId || null, seller_id: q.sellerId || null,
    answer: q.answer ? q.answer.text : null, answered_by: q.answer ? q.answer.by : null,
    created_at: q.createdAt, answered_at: q.answer ? q.answer.answeredAt : null
  };
}
function inquiryFromRow(r) {
  return {
    id: r.id, buyerId: r.buyer_id, category: r.category, title: r.title, content: r.content, status: r.status,
    scoreId: r.score_id, sellerId: r.seller_id,
    answer: r.answer ? { by: r.answered_by, text: r.answer, answeredAt: r.answered_at } : null,
    createdAt: r.created_at
  };
}

/* ---------- 불러오기 (12개 테이블 → 화면용 STATE 조립) ---------- */

async function loadFromSupabaseTables() {
  const sb = getSb();
  if (!sb) return null;
  const [uR, sR, pR, rR, cR, wR, rvR, iR, phR, rbR, rlR] = await Promise.all([
    sb.from("users").select("*"),
    sb.from("scores").select("*"),
    sb.from("purchases").select("*"),
    sb.from("requests").select("*"),
    sb.from("charges").select("*"),
    sb.from("withdrawals").select("*"),
    sb.from("reviews").select("*"),
    sb.from("inquiries").select("*"),
    sb.from("point_history").select("*").order("at"),
    sb.from("request_buyers").select("*").order("joined_at"),
    sb.from("request_likes").select("*").order("liked_at")
  ]);
  for (const r of [uR, sR, pR, rR, cR, wR, rvR, iR, phR, rbR, rlR]) {
    if (r.error) throw r.error;
  }

  const state = emptyState();
  for (const row of uR.data) state.users[row.id] = userFromRow(row);
  for (const row of sR.data) state.scores[row.id] = scoreFromRow(row);
  for (const row of pR.data) state.purchases[row.id] = purchaseFromRow(row);
  for (const row of rR.data) state.requests[row.id] = requestFromRow(row);
  for (const row of cR.data) state.charges[row.id] = chargeFromRow(row);
  for (const row of wR.data) state.withdrawals[row.id] = withdrawalFromRow(row);
  for (const row of rvR.data) state.reviews[row.id] = reviewFromRow(row);
  for (const row of iR.data) state.inquiries[row.id] = inquiryFromRow(row);

  for (const row of phR.data) {
    const u = state.users[row.user_id];
    if (u) u.pointHistory.push({ amount: row.amount, reason: row.reason, at: row.at });
  }
  for (const row of rbR.data) {
    const r = state.requests[row.request_id];
    if (r) r.buyerIds.push(row.user_id);
  }
  for (const row of rlR.data) {
    const r = state.requests[row.request_id];
    if (r) r.likedBy.push(row.user_id);
  }
  return state;
}

async function load() {
  let remote = null;
  try {
    remote = await loadFromSupabaseTables();
  } catch (e) {
    console.error("[common] 공유 서버에서 데이터를 불러오지 못했습니다. 이 브라우저의 데이터로 시작합니다.", e);
    remote = null;
  }
  if (remote) {
    STATE = remote;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE)); } catch (e) { /* 저장 공간이 막힌 브라우저는 그냥 넘어간다 */ }
  } else {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      STATE = raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error("[common] 저장된 데이터를 읽지 못했습니다.", e);
      STATE = null;
    }
  }
  if (!STATE) STATE = emptyState();
  for (const key of COLLECTIONS) {
    if (!STATE[key]) STATE[key] = {};
  }
  // 예전에 저장된 데이터에 새 칸(찜·장바구니·구독·악보소개)이 없으면 빈 값으로 채운다 (레거시 대비, 테이블 경로에선 대부분 이미 채워져 있다)
  for (const u of Object.values(STATE.users)) {
    if (!Array.isArray(u.wishlist)) u.wishlist = [];
    if (!Array.isArray(u.cart)) u.cart = [];
    if (!Array.isArray(u.following)) u.following = [];
    if (typeof u.supabaseUserId === "undefined") u.supabaseUserId = null;
    if (typeof u.isAdmin !== "boolean") u.isAdmin = isAdminEmail(u.email);
    else if (isAdminEmail(u.email)) u.isAdmin = true;
    if (u.sellerInfo && (typeof u.sellerInfo.displayName !== "string" || !u.sellerInfo.displayName.trim())) {
      u.sellerInfo.displayName = u.name;
    }
  }
  for (const s of Object.values(STATE.scores)) {
    if (typeof s.description !== "string") s.description = "";
    if (!Array.isArray(s.tags)) s.tags = [];
    if (typeof s.thumbnailUrl !== "string" || !s.thumbnailUrl.trim()) s.thumbnailUrl = null;
    if (typeof s.discount === "undefined") s.discount = null;
  }
  for (const r of Object.values(STATE.requests)) {
    if (typeof r.composer !== "string") r.composer = "";
    if (typeof r.note !== "string") r.note = "";
    if (typeof r.createdAt !== "string") r.createdAt = nowISO();
    if (!Array.isArray(r.likedBy)) r.likedBy = [];
    if (!Array.isArray(r.buyerIds)) r.buyerIds = [];
  }
  for (const u of Object.values(STATE.users)) {
    u.wishlist = u.wishlist.filter(id => STATE.scores[id]);
    u.cart = u.cart.filter(id => STATE.scores[id]);
  }

  STATE_BASELINE = cloneState(STATE); // 다음 save() 가 이것과 비교해서 바뀐 것만 찾는다
}

/* ---------- 저장 (바뀐 부분만 찾아서 해당 테이블에 반영) ----------
   화면 쪽(buyer.js 등)은 예전처럼 STATE 를 직접 고친 뒤 save() 를 그냥 부르면 된다.
   save() 는 즉시 이 브라우저 캐시에 저장하고, 실제 서버 반영(diff 비교 후 테이블 쓰기)은
   화면을 기다리게 하지 않도록 백그라운드로 보낸다. 어떤 테이블 쓰기가 보안 규칙(RLS)에
   막혀 실패하더라도(예: 본인 소유가 아닌 데이터) 그 부분만 콘솔에 에러로 남기고 나머지는
   계속 진행한다 — 예전 방식과 같은 수준의 "최선을 다해 저장, 실패해도 화면은 안 멈춤" 원칙. */

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE)); } catch (e) { /* 무시 */ }
  syncToSupabase();
}

async function tryStep(label, fn) {
  try {
    await fn();
  } catch (e) {
    console.error(`[common] 공유 서버 저장 중 일부 실패 (${label}). 이 변경은 다음 저장 때까지 반영되지 않을 수 있습니다.`, e);
  }
}

async function deleteMissing(sb, table, baseMap, curMap) {
  const removedIds = Object.keys(baseMap).filter(id => !curMap[id]);
  if (!removedIds.length) return;
  const { error } = await sb.from(table).delete().in("id", removedIds);
  if (error) throw error;
}

async function upsertChanged(sb, table, baseMap, curMap, toRow) {
  const rows = [];
  for (const id of Object.keys(curMap)) {
    const b = baseMap[id];
    const row = toRow(curMap[id]);
    if (!b || JSON.stringify(toRow(b)) !== JSON.stringify(row)) rows.push(row);
  }
  if (!rows.length) return;
  const { error } = await sb.from(table).upsert(rows);
  if (error) throw error;
}

async function insertNewPointHistory(sb, baseUsers, curUsers) {
  const rows = [];
  for (const id of Object.keys(curUsers)) {
    const bHist = (baseUsers[id] && baseUsers[id].pointHistory) || [];
    const cHist = curUsers[id].pointHistory || [];
    for (let i = bHist.length; i < cHist.length; i++) {
      const h = cHist[i];
      rows.push({ user_id: id, amount: h.amount, reason: h.reason, at: h.at });
    }
  }
  if (!rows.length) return;
  const { error } = await sb.from("point_history").insert(rows);
  if (error) throw error;
}

async function insertNewRequestBuyers(sb, baseRequests, curRequests) {
  const rows = [];
  for (const id of Object.keys(curRequests)) {
    const bIds = (baseRequests[id] && baseRequests[id].buyerIds) || [];
    const cIds = curRequests[id].buyerIds || [];
    for (const u of cIds) if (!bIds.includes(u)) rows.push({ request_id: id, user_id: u });
  }
  if (!rows.length) return;
  const { error } = await sb.from("request_buyers").insert(rows);
  if (error) throw error;
}

async function syncRequestLikes(sb, baseRequests, curRequests) {
  const inserts = [], deletes = [];
  for (const id of Object.keys(curRequests)) {
    const bLiked = (baseRequests[id] && baseRequests[id].likedBy) || [];
    const cLiked = curRequests[id].likedBy || [];
    for (const u of cLiked) if (!bLiked.includes(u)) inserts.push({ request_id: id, user_id: u });
  }
  for (const id of Object.keys(baseRequests)) {
    if (!curRequests[id]) continue; // 신청곡 자체가 삭제된 경우는 cascade 로 함께 정리된다
    const bLiked = baseRequests[id].likedBy || [];
    const cLiked = curRequests[id].likedBy || [];
    for (const u of bLiked) if (!cLiked.includes(u)) deletes.push({ request_id: id, user_id: u });
  }
  for (const d of deletes) {
    const { error } = await sb.from("request_likes").delete().match(d);
    if (error) throw error;
  }
  if (inserts.length) {
    const { error } = await sb.from("request_likes").insert(inserts);
    if (error) throw error;
  }
}

async function syncToSupabase() {
  const sb = getSb();
  if (!sb) return;
  const base = STATE_BASELINE || emptyState();

  // 삭제는 자식 → 부모 순서로 (외래키 때문에), 각 단계는 실패해도 다음 단계로 진행한다
  await tryStep("purchases 삭제", () => deleteMissing(sb, "purchases", base.purchases, STATE.purchases));
  await tryStep("reviews 삭제", () => deleteMissing(sb, "reviews", base.reviews, STATE.reviews));
  await tryStep("charges 삭제", () => deleteMissing(sb, "charges", base.charges, STATE.charges));
  await tryStep("withdrawals 삭제", () => deleteMissing(sb, "withdrawals", base.withdrawals, STATE.withdrawals));
  await tryStep("inquiries 삭제", () => deleteMissing(sb, "inquiries", base.inquiries, STATE.inquiries));
  await tryStep("request_likes 동기화", () => syncRequestLikes(sb, base.requests, STATE.requests));
  await tryStep("requests 삭제", () => deleteMissing(sb, "requests", base.requests, STATE.requests));
  await tryStep("scores 삭제", () => deleteMissing(sb, "scores", base.scores, STATE.scores));
  await tryStep("users 삭제", () => deleteMissing(sb, "users", base.users, STATE.users));

  // 저장/수정은 부모 → 자식 순서로
  await tryStep("users 저장", () => upsertChanged(sb, "users", base.users, STATE.users, rowFromUser));
  await tryStep("scores 저장", () => upsertChanged(sb, "scores", base.scores, STATE.scores, rowFromScore));
  await tryStep("requests 저장", () => upsertChanged(sb, "requests", base.requests, STATE.requests, rowFromRequest));
  await tryStep("purchases 저장", () => upsertChanged(sb, "purchases", base.purchases, STATE.purchases, rowFromPurchase));
  await tryStep("charges 저장", () => upsertChanged(sb, "charges", base.charges, STATE.charges, rowFromCharge));
  await tryStep("withdrawals 저장", () => upsertChanged(sb, "withdrawals", base.withdrawals, STATE.withdrawals, rowFromWithdrawal));
  await tryStep("reviews 저장", () => upsertChanged(sb, "reviews", base.reviews, STATE.reviews, rowFromReview));
  await tryStep("inquiries 저장", () => upsertChanged(sb, "inquiries", base.inquiries, STATE.inquiries, rowFromInquiry));

  await tryStep("포인트내역 추가", () => insertNewPointHistory(sb, base.users, STATE.users));
  await tryStep("신청곡 참여자 추가", () => insertNewRequestBuyers(sb, base.requests, STATE.requests));

  STATE_BASELINE = cloneState(STATE);
}

/* ---------- 로그인 세션 (누가 지금 로그인해 있는지만 별도 저장) ---------- */

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveSession(userId) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId }));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/* ---------- 최근 본 악보 (브라우저별) ---------- */

function getRecentViewed() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(id => STATE.scores[id]) : [];
  } catch (e) {
    return [];
  }
}

function pushRecentViewed(scoreId) {
  try {
    const list = getRecentViewed().filter(id => id !== scoreId);
    list.unshift(scoreId);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12)));
  } catch (e) { /* 저장이 막힌 브라우저에서는 그냥 넘어간다 */ }
}

/* ---------- 데모 데이터 ----------
   실제 악보가 아니라 화면 확인용 연습곡 데이터다. 곡명·아티스트는 전부
   "데모"로 표시해서 실제 상품처럼 보이지 않게 한다. */

function makeUser(name, email, role, extra) {
  const id = uid("user");
  const user = {
    id, name, email, role,
    points: 0, pointHistory: [], isFirstCharge: true, createdAt: nowISO(),
    wishlist: [], cart: [], following: [],
    supabaseUserId: null,
    isAdmin: isAdminEmail(email)
  };
  if (role === "seller" || role === "both") {
    user.sellerInfo = { bankName: "", bankAccount: "", accountHolder: name, settleBalance: 0, displayName: name };
  }
  Object.assign(user, extra || {});
  STATE.users[id] = user;
  return user;
}

function daysAgoISO(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function seedDemoData() {
  const buyer = makeUser("김구매", "buyer@example.com", "buyer", {
    points: 5000, pointHistory: [{ amount: 5000, reason: "데모 초기 지급", at: nowISO() }]
  });
  const sellers = [
    makeUser("데모 드럼스튜디오", "seller@example.com", "both"),
    makeUser("데모 그루브랩", "groove@example.com", "seller"),
    makeUser("데모 기타하우스", "guitar@example.com", "seller"),
    makeUser("데모 건반노트", "keys@example.com", "seller")
  ];
  sellers[0].sellerInfo = { bankName: "국민은행", bankAccount: "000-0000-0001", accountHolder: "데모 드럼스튜디오", settleBalance: 0, displayName: sellers[0].name };
  sellers[1].sellerInfo = { bankName: "신한은행", bankAccount: "000-0000-0002", accountHolder: "데모 그루브랩", settleBalance: 0, displayName: sellers[1].name };
  sellers[2].sellerInfo = { bankName: "우리은행", bankAccount: "000-0000-0003", accountHolder: "데모 기타하우스", settleBalance: 0, displayName: sellers[2].name };
  // sellers[3] 은 계좌 미등록 예시로 둔다 (지급 목록에서 빠지는 모습 확인용)

  const list = [
    // [판매자index, 제목, 악기, 난이도, 가격, 영상, 며칠전]
    [0, "8비트 기본 그루브 연습곡", "드럼", "초급", 1500, true, 1],
    [0, "16비트 하이햇 연습곡", "드럼", "초급", 2000, true, 2],
    [1, "펑크 고스트노트 그루브", "드럼", "중급", 3000, true, 3],
    [1, "셔플 블루스 리듬 연습곡", "드럼", "중급", 2500, false, 4],
    [0, "더블킥 빌드업 연습곡", "드럼", "고급", 4000, true, 5],
    [1, "보사노바 리듬 패턴", "드럼", "중급", 2500, true, 6],
    [0, "필인 모음집 Vol.1", "드럼", "초급", 3500, true, 8],
    [1, "메탈 블라스트비트 연습곡", "드럼", "고급", 4500, false, 9],
    [0, "발라드 6/8 그루브 연습곡", "드럼", "초급", 1500, true, 11],
    [2, "통기타 스트로크 입문 연습곡", "기타", "초급", 1500, true, 2],
    [2, "핑거스타일 아르페지오 연습곡", "기타", "중급", 3000, false, 7],
    [2, "베이스 루트음 워킹 연습곡", "베이스", "초급", 2000, true, 10],
    [3, "피아노 왼손 반주 패턴 연습곡", "피아노", "초급", 2000, false, 3],
    [0, "초중급 필인 응용 연습곡", "드럼", "초중급", 2200, true, 6],
    [1, "프로 더블페달 패턴 연습곡", "드럼", "프로", 5000, true, 7]
  ];

  const scoreIds = [];
  for (const [si, title, instrument, difficulty, price, hasVideo, ago] of list) {
    const id = uid("score");
    const seller = sellers[si];
    STATE.scores[id] = {
      id, sellerId: seller.id, title, artist: "악보대장 데모 연습곡", instrument, difficulty,
      price, hasVideo, videoUrl: hasVideo ? "https://www.youtube.com" : null, fileUrl: "demo.pdf",
      previewInfo: `첫 ${POLICY.preview.bars}마디 미리보기`, status: "승인", rejectReason: null,
      createdAt: daysAgoISO(ago), approvedAt: daysAgoISO(ago),
      salesCount: 0, viewCount: Math.floor(Math.random() * 300) + 20,
      description: `${instrument} ${difficulty} 단계 연습용 데모 악보입니다. 실제 판매 악보가 아니라 화면 확인을 위한 예시입니다.`,
      tags: [], thumbnailUrl: null, discount: null
    };
    scoreIds.push(id);
  }

  // 심사 대기 예시 2개
  for (const [title, instrument] of [["데모 심사대기 드럼 악보", "드럼"], ["데모 심사대기 기타 악보", "기타"]]) {
    const id = uid("score");
    STATE.scores[id] = {
      id, sellerId: sellers[1].id, title, artist: "악보대장 데모 연습곡", instrument, difficulty: "중급",
      price: 2000, hasVideo: false, videoUrl: null, fileUrl: "demo.pdf",
      previewInfo: `첫 ${POLICY.preview.bars}마디 미리보기`, status: "심사중", rejectReason: null,
      createdAt: nowISO(), approvedAt: null, salesCount: 0, viewCount: 0, description: "",
      tags: [], thumbnailUrl: null, discount: null
    };
  }

  // 인기 순위가 비어 보이지 않게 데모 구매자 몇 명이 산 기록을 만든다
  const demoBuyers = [];
  for (let i = 1; i <= 6; i++) {
    demoBuyers.push(makeUser(`데모 구매자${i}`, `demo-buyer${i}@example.com`, "buyer", { points: 0, createdAt: daysAgoISO(25 + i) }));
  }
  sellers.forEach((u, i) => { u.createdAt = daysAgoISO(45 - i * 3); });
  buyer.createdAt = daysAgoISO(2);
  const salesPlan = [6, 5, 5, 3, 4, 2, 4, 1, 3, 4, 2, 2, 1, 1, 1];
  salesPlan.forEach((n, idx) => {
    const score = STATE.scores[scoreIds[idx]];
    if (!score) return;
    for (let k = 0; k < n; k++) {
      const b = demoBuyers[k % demoBuyers.length];
      const rate = calcCommission(score);
      const earning = Math.round(score.price * (1 - rate));
      const pid = uid("purchase");
      const at = daysAgoISO((k * 3 + idx) % 25);
      STATE.purchases[pid] = {
        id: pid, buyerId: b.id, scoreId: score.id, sellerId: score.sellerId,
        price: score.price, commissionRate: rate, sellerEarning: earning,
        purchasedAt: at, downloaded: true, downloadedAt: at,
        refunded: false, refundedAt: null,
        refundDeadline: new Date(new Date(at).getTime() + POLICY.refund.windowDays * 86400000).toISOString()
      };
      score.salesCount += 1;
      const seller = STATE.users[score.sellerId];
      if (seller.sellerInfo) seller.sellerInfo.settleBalance += earning;
      if (k < 2) {
        const rid = uid("review");
        STATE.reviews[rid] = {
          id: rid, scoreId: score.id, buyerId: b.id,
          rating: k === 0 ? 5 : 4, feltDifficulty: score.difficulty,
          text: k === 0 ? "데모 리뷰입니다. 연습하기 좋아요." : "데모 리뷰입니다. 영상이랑 같이 보니 이해가 잘 돼요.",
          createdAt: at
        };
      }
    }
  });

  // 신청곡 예시 (2026-10-16: 무료 커뮤니티 게시판 — 작곡가·가수 분리, note 선택)
  const reqs = [
    ["데모 신청곡 A", "데모 작곡가", "데모 가수", "드럼", "", [buyer.id, ...demoBuyers.slice(0, 3).map(b => b.id)]],
    ["데모 신청곡 B", "데모 작곡가", "데모 가수", "드럼", "", [buyer.id, demoBuyers[4].id]],
    ["데모 신청곡 C", "데모 작곡팀", "데모 밴드", "기타", "원곡 코드로 부탁드려요", [demoBuyers[3].id]]
  ];
  for (const [title, composer, singer, instrument, note, buyerIds] of reqs) {
    const id = uid("request");
    STATE.requests[id] = { id, buyerIds, likedBy: [], title, composer, singer, note, instrument, status: "접수", fulfilledScoreId: null, createdAt: nowISO() };
  }

  // 데모 구매자들의 충전 기록 (산 만큼 충전했다고 보고 포인트 잔액을 맞춘다)
  for (const b of demoBuyers) {
    const spent = Object.values(STATE.purchases).filter(p => p.buyerId === b.id).reduce((sum, p) => sum + p.price, 0);
    const tier = POLICY.chargeTiers.find(t => t.amount * (1 + calcChargeBonus(b, t.amount)) >= spent) || POLICY.chargeTiers[POLICY.chargeTiers.length - 1];
    const bonus = calcChargeBonus(b, tier.amount);
    const gained = Math.round(tier.amount * (1 + bonus));
    const at = new Date(new Date(b.createdAt).getTime() + 3600000).toISOString();
    const cid = uid("charge");
    STATE.charges[cid] = { id: cid, userId: b.id, amount: tier.amount, tierBonus: calcChargeBonus({ ...b, isFirstCharge: false }, tier.amount), appliedBonus: bonus, pointsGained: gained, chargedAt: at };
    b.pointHistory.push({ amount: gained, reason: `충전 (${formatWon(tier.amount)}, 보너스 ${Math.round(bonus * 100)}%)`, at });
    for (const p of Object.values(STATE.purchases).filter(x => x.buyerId === b.id)) {
      const sc = STATE.scores[p.scoreId];
      b.pointHistory.push({ amount: -p.price, reason: `악보 구매: ${sc.title}`, at: p.purchasedAt });
    }
    b.pointHistory.sort((x, y) => new Date(x.at) - new Date(y.at));
    b.points = gained - spent;
    b.isFirstCharge = false;
  }

  buyer.following = [sellers[0].id];
  demoBuyers[0].following = [sellers[0].id, sellers[1].id];
  demoBuyers[1].following = [sellers[0].id];
}

function seedIfEmpty() {
  if (Object.keys(STATE.users).length > 0) return;
  seedDemoData();
  save();
}

function resetDemoData() {
  STATE = emptyState();
  seedDemoData();
  save();
  clearSession();
  try { localStorage.removeItem(RECENT_KEY); } catch (e) { /* 무시 */ }
  CURRENT_USER_ID = null;
  return { ok: true };
}

/* ---------- 정책 계산 ---------- */

function calcCommission(score) {
  return POLICY.commission.rate;
}

/* ---------- 할인 (2026-10-16 추가: 판매자가 본인 악보에 직접 할인율·기간을 설정/해제) ---------- */

/* 지금 시점에 실제로 적용 중인 할인이면 { rate, startAt, endAt } 을 돌려주고, 아니면 null */
function activeDiscount(score) {
  const d = score.discount;
  if (!d) return null;
  const now = Date.now();
  if (now < new Date(d.startAt).getTime() || now > new Date(d.endAt).getTime()) return null;
  return d;
}

/* 지금 실제로 구매자가 내는 가격 (할인 중이 아니면 원래 가격) */
function effectivePrice(score) {
  const d = activeDiscount(score);
  if (!d) return score.price;
  return Math.max(0, Math.round(score.price * (1 - d.rate)));
}

function setScoreDiscount(sellerId, scoreId, rate, startAt, endAt) {
  const score = STATE.scores[scoreId];
  if (!score) return { ok: false, message: "악보를 찾을 수 없습니다." };
  if (score.sellerId !== sellerId) return { ok: false, message: "본인이 등록한 악보만 할인을 설정할 수 있습니다." };

  const r = Number(rate) / 100;
  if (!Number.isFinite(r) || r < POLICY.discount.minRate || r > POLICY.discount.maxRate) {
    return { ok: false, message: `할인율은 ${Math.round(POLICY.discount.minRate * 100)}~${Math.round(POLICY.discount.maxRate * 100)}% 사이로 입력해주세요.` };
  }
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { ok: false, message: "시작일과 종료일을 올바르게 입력해주세요." };
  }
  if (start.getTime() >= end.getTime()) {
    return { ok: false, message: "종료일은 시작일보다 뒤여야 합니다." };
  }

  score.discount = { rate: r, startAt: start.toISOString(), endAt: end.toISOString() };
  save();
  return { ok: true };
}

function clearScoreDiscount(sellerId, scoreId) {
  const score = STATE.scores[scoreId];
  if (!score) return { ok: false, message: "악보를 찾을 수 없습니다." };
  if (score.sellerId !== sellerId) return { ok: false, message: "본인이 등록한 악보만 해제할 수 있습니다." };
  if (!score.discount) return { ok: false, message: "적용 중인 할인이 없습니다." };
  score.discount = null;
  save();
  return { ok: true };
}

function calcChargeBonus(user, amount) {
  const eligible = [...POLICY.chargeTiers].filter(t => amount >= t.amount);
  const tierBonus = eligible.length ? eligible[eligible.length - 1].bonus : 0;
  return user.isFirstCharge ? Math.max(POLICY.firstChargeBonus, tierBonus) : tierBonus;
}

/* ---------- 조회용 계산 (화면에서 공통으로 쓰는 값) ---------- */

function hasPurchased(userId, scoreId) {
  return Object.values(STATE.purchases).some(
    p => p.buyerId === userId && p.scoreId === scoreId && !p.refunded
  );
}

function getScoreRating(scoreId) {
  const list = Object.values(STATE.reviews).filter(r => r.scoreId === scoreId);
  if (list.length === 0) return { avg: 0, count: 0 };
  const avg = list.reduce((s, r) => s + r.rating, 0) / list.length;
  return { avg: Math.round(avg * 10) / 10, count: list.length };
}

function getFollowerCount(sellerId) {
  return Object.values(STATE.users).filter(u => (u.following || []).includes(sellerId)).length;
}

function getSellerStats(sellerId) {
  const scores = Object.values(STATE.scores).filter(s => s.sellerId === sellerId && s.status === "승인");
  const sales = scores.reduce((sum, s) => sum + s.salesCount, 0);
  return { scoreCount: scores.length, sales, followers: getFollowerCount(sellerId) };
}

/* 기간 인기순: days 가 있으면 그 기간 안의 구매 건수, 없으면 누적 판매량 */
function getPopularScores(days, instrument) {
  const since = days ? Date.now() - days * 86400000 : 0;
  const counts = {};
  for (const p of Object.values(STATE.purchases)) {
    if (p.refunded || p.price === 0) continue;
    if (days && new Date(p.purchasedAt).getTime() < since) continue;
    counts[p.scoreId] = (counts[p.scoreId] || 0) + 1;
  }
  return Object.values(STATE.scores)
    .filter(s => s.status === "승인" && (!instrument || s.instrument === instrument))
    .map(s => ({ score: s, count: days ? (counts[s.id] || 0) : s.salesCount }))
    .sort((a, b) => (b.count - a.count) || (b.score.viewCount - a.score.viewCount) || (new Date(b.score.createdAt) - new Date(a.score.createdAt)))
    .map(x => x.score);
}

/* ============================================================
   결제 · 포인트 · 정산 로직 — 총괄/ 에서만 수정
   ============================================================ */

function chargePoints(userId, amount) {
  const user = STATE.users[userId];
  if (!user) return { ok: false, message: "사용자를 찾을 수 없습니다." };
  if (!amount || amount <= 0) return { ok: false, message: "충전 금액이 올바르지 않습니다." };

  const bonus = calcChargeBonus(user, amount);
  const points = Math.round(amount * (1 + bonus));

  user.points += points;
  user.pointHistory.push({
    amount: points,
    reason: `충전 (${formatWon(amount)}, 보너스 ${Math.round(bonus * 100)}%)`,
    at: nowISO()
  });

  const chargeId = uid("charge");
  STATE.charges[chargeId] = {
    id: chargeId, userId, amount,
    tierBonus: calcChargeBonus({ ...user, isFirstCharge: false }, amount),
    appliedBonus: bonus, pointsGained: points, chargedAt: nowISO()
  };

  user.isFirstCharge = false;
  save();
  return { ok: true, pointsGained: points, chargeId };
}

/* 2026-10-18 변경: 구매자 포인트 차감은 "본인 것"이라 문제없지만, 판매자 적립금 증가·
   악보 판매건수 증가는 "남의 데이터"를 고치는 일이라 테이블별 보안 규칙(RLS)으로는
   일반 저장(save())으로 반영할 수 없다. 그래서 서버의 전용 함수(rpc_purchase_score)가
   이 전체 과정을 하나의 트랜잭션으로 처리하고, 처리 후 최신 데이터를 다시 불러온다(load()).
   그래서 이 함수는 이제 비동기(async)다 — 부르는 쪽(buyer.js)에서 await 로 기다린 뒤
   res.ok 를 확인해야 한다. */
async function purchaseScore(buyerId, scoreId) {
  const sb = getSb();
  if (!sb) return { ok: false, message: "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요." };
  let data, error;
  try {
    ({ data, error } = await sb.rpc("rpc_purchase_score", { p_buyer_id: buyerId, p_score_id: scoreId }));
  } catch (e) {
    error = e;
  }
  if (error) {
    console.error("[common] 구매 처리 중 오류", error);
    return { ok: false, message: "구매 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요." };
  }
  if (!data || !data.ok) {
    return { ok: false, message: (data && data.message) || "구매에 실패했습니다." };
  }
  await load(); // 서버에서 계산된 최신 포인트·판매건수·적립금을 다시 받아와 STATE 에 반영
  return { ok: true, purchaseId: data.purchaseId };
}

/* 장바구니 전체 구매: 합계 포인트가 모자라면 한 건도 사지 않는다.
   항목마다 purchaseScore() 를 순서대로 기다렸다가(await) 처리한다. */
async function purchaseCart(buyerId) {
  const buyer = STATE.users[buyerId];
  if (!buyer) return { ok: false, message: "사용자를 찾을 수 없습니다." };
  const items = (buyer.cart || [])
    .map(id => STATE.scores[id])
    .filter(s => s && s.status === "승인" && !hasPurchased(buyerId, s.id) && s.sellerId !== buyerId);
  if (items.length === 0) return { ok: false, message: "장바구니에 구매할 악보가 없습니다." };
  const total = items.reduce((sum, s) => sum + effectivePrice(s), 0); // 2026-10-16: 할인가 기준 합계
  if (buyer.points < total) {
    return { ok: false, message: `포인트가 ${formatPoint(total - buyer.points)} 부족합니다.` };
  }
  let count = 0;
  for (const s of items) {
    const r = await purchaseScore(buyerId, s.id);
    if (r.ok) count += 1;
  }
  const freshBuyer = STATE.users[buyerId];
  if (freshBuyer) {
    freshBuyer.cart = [];
    save();
  }
  return { ok: true, count, total };
}

function addToCart(userId, scoreId) {
  const user = STATE.users[userId];
  const score = STATE.scores[scoreId];
  if (!user || !score) return { ok: false, message: "정보를 찾을 수 없습니다." };
  if (score.status !== "승인") return { ok: false, message: "판매 중인 악보가 아닙니다." };
  if (hasPurchased(userId, scoreId)) return { ok: false, message: "이미 구매한 악보입니다." };
  if (score.sellerId === userId) return { ok: false, message: "본인이 등록한 악보입니다." };
  if (user.cart.includes(scoreId)) return { ok: false, message: "이미 장바구니에 있습니다." };
  user.cart.push(scoreId);
  save();
  return { ok: true };
}

function removeFromCart(userId, scoreId) {
  const user = STATE.users[userId];
  if (!user) return { ok: false, message: "사용자를 찾을 수 없습니다." };
  user.cart = user.cart.filter(id => id !== scoreId);
  save();
  return { ok: true };
}

function toggleWishlist(userId, scoreId) {
  const user = STATE.users[userId];
  if (!user || !STATE.scores[scoreId]) return { ok: false, message: "정보를 찾을 수 없습니다." };
  const has = user.wishlist.includes(scoreId);
  user.wishlist = has ? user.wishlist.filter(id => id !== scoreId) : [scoreId, ...user.wishlist];
  save();
  return { ok: true, added: !has };
}

function toggleFollow(userId, sellerId) {
  const user = STATE.users[userId];
  if (!user || !STATE.users[sellerId]) return { ok: false, message: "정보를 찾을 수 없습니다." };
  if (userId === sellerId) return { ok: false, message: "본인은 구독할 수 없습니다." };
  const has = user.following.includes(sellerId);
  user.following = has ? user.following.filter(id => id !== sellerId) : [...user.following, sellerId];
  save();
  return { ok: true, added: !has };
}

/* 2026-10-18 변경: 조회수 증가는 비로그인 방문자도 할 수 있어야 하는데, 테이블별 보안 규칙상
   "본인 소유 악보만 수정 가능"이라 일반 저장(save())으로는 남의 악보 조회수를 못 올린다.
   그래서 조회수 전용 서버 함수(increment_view_count)를 따로 불러서 처리하고, 전체 저장
   경로(save())는 건드리지 않는다 — 화면은 즉시 +1 된 숫자를 보여준다(낙관적 업데이트). */
function recordView(scoreId) {
  const score = STATE.scores[scoreId];
  if (!score) return;
  score.viewCount += 1;
  if (STATE_BASELINE && STATE_BASELINE.scores[scoreId]) {
    STATE_BASELINE.scores[scoreId].viewCount = score.viewCount; // 다음 save() 가 이 변화까지 다시 시도하지 않도록 기준점도 맞춰둔다
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE)); } catch (e) { /* 무시 */ }
  const sb = getSb();
  if (sb) {
    sb.rpc("increment_view_count", { p_score_id: scoreId }).then(({ error }) => {
      if (error) console.error("[common] 조회수 반영 실패", error);
    });
  }
  pushRecentViewed(scoreId);
}

function submitReview(buyerId, scoreId, data) {
  if (!hasPurchased(buyerId, scoreId)) return { ok: false, message: "구매한 악보에만 리뷰를 쓸 수 있습니다." };
  const rating = Number(data.rating);
  if (!(rating >= 1 && rating <= 5)) return { ok: false, message: "별점을 선택해주세요." };
  const text = (data.text || "").trim();
  if (text.length < 5) return { ok: false, message: "리뷰는 5글자 이상 써주세요." };
  const exists = Object.values(STATE.reviews).some(r => r.buyerId === buyerId && r.scoreId === scoreId);
  if (exists) return { ok: false, message: "이미 이 악보에 리뷰를 남기셨습니다." };
  const id = uid("review");
  STATE.reviews[id] = {
    id, scoreId, buyerId, rating,
    feltDifficulty: DIFFICULTIES.includes(data.feltDifficulty) ? data.feltDifficulty : "",
    text, createdAt: nowISO()
  };
  save();
  return { ok: true, reviewId: id };
}

/* 관리자 포인트 수동 조정 (고객 보상·오류 정정). 사유가 회원 포인트 내역에 남는다.
   관리자는 보안 규칙(RLS)에서 모든 회원 데이터를 고칠 수 있게 허용되어 있어 일반 저장으로 처리된다. */
function adjustPoints(userId, amount, reason) {
  const user = STATE.users[userId];
  if (!user) return { ok: false, message: "회원을 찾을 수 없습니다." };
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n) || n === 0) return { ok: false, message: "조정할 포인트를 입력해주세요. (차감은 -1000처럼)" };
  const why = (reason || "").trim();
  if (!why) return { ok: false, message: "사유를 꼭 적어주세요." };
  if (user.points + n < 0) return { ok: false, message: `보유 포인트(${formatPoint(user.points)})보다 많이 차감할 수 없습니다.` };
  user.points += n;
  user.pointHistory.push({ amount: n, reason: `관리자 조정: ${why}`, at: nowISO() });
  save();
  return { ok: true };
}

/* 2026-10-18 변경: 환불도 구매와 마찬가지로 판매자 적립금·악보 판매건수처럼 남의 데이터를
   함께 고쳐야 해서 서버 전용 함수(rpc_refund_purchase)로 처리한다. 비동기(async)로 바뀌었다. */
async function refundPurchase(purchaseId) {
  const sb = getSb();
  if (!sb) return { ok: false, message: "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요." };
  let data, error;
  try {
    ({ data, error } = await sb.rpc("rpc_refund_purchase", { p_purchase_id: purchaseId }));
  } catch (e) {
    error = e;
  }
  if (error) {
    console.error("[common] 환불 처리 중 오류", error);
    return { ok: false, message: "환불 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요." };
  }
  if (!data || !data.ok) {
    return { ok: false, message: (data && data.message) || "환불에 실패했습니다." };
  }
  await load();
  return { ok: true };
}

function downloadPurchase(purchaseId) {
  const purchase = STATE.purchases[purchaseId];
  if (!purchase) return { ok: false, message: "구매 내역을 찾을 수 없습니다." };
  if (purchase.refunded) return { ok: false, message: "환불된 구매는 다운로드할 수 없습니다." };
  if (!purchase.downloaded) {
    purchase.downloaded = true;
    purchase.downloadedAt = nowISO();
    save();
  }
  return { ok: true };
}

function requestWithdrawal(sellerId, amount) {
  const seller = STATE.users[sellerId];
  if (!seller || !seller.sellerInfo) return { ok: false, message: "판매자 정보를 찾을 수 없습니다." };
  if (amount < POLICY.settlement.minWithdraw) {
    return { ok: false, message: `최소 출금 금액은 ${formatWon(POLICY.settlement.minWithdraw)}입니다.` };
  }
  if (amount > seller.sellerInfo.settleBalance) {
    return { ok: false, message: "적립금이 부족합니다." };
  }

  seller.sellerInfo.settleBalance -= amount;

  const withdrawalId = uid("withdraw");
  STATE.withdrawals[withdrawalId] = {
    id: withdrawalId, sellerId, amount, status: "요청",
    requestedAt: nowISO(), paidAt: null
  };

  save();
  return { ok: true, withdrawalId };
}

/* ============================================================
   자동 정산 (2026-10-01 결정)
   판매자는 출금 신청을 하지 않는다. 매달 POLICY.settlement.payoutDay 일에
   적립금이 POLICY.settlement.minWithdraw 이상이고 계좌가 등록된 판매자 전원을
   지급 목록에 올린다. 관리자는 목록을 엑셀로 받아 은행 대량이체 후
   "전체 지급 완료" 한 번만 누른다.
   ============================================================ */

function nextPayoutDate(from) {
  const d = from ? new Date(from) : new Date();
  const day = POLICY.settlement.payoutDay;
  let target = new Date(d.getFullYear(), d.getMonth(), day);
  if (d.getDate() > day) target = new Date(d.getFullYear(), d.getMonth() + 1, day);
  return target;
}

function hasBankInfo(user) {
  const i = user && user.sellerInfo;
  return !!(i && i.bankName && i.bankAccount && i.accountHolder);
}

/* 예전 방식으로 신청만 해둔("요청" 상태) 출금도 함께 지급한다 */
function getPayoutBatch() {
  const items = [];
  const excluded = [];
  for (const u of Object.values(STATE.users)) {
    if (!u.sellerInfo) continue;
    const pending = Object.values(STATE.withdrawals).filter(w => w.sellerId === u.id && w.status === "요청");
    const pendingSum = pending.reduce((s, w) => s + w.amount, 0);
    const balance = Math.max(0, u.sellerInfo.settleBalance);
    const total = pendingSum + balance;
    if (total <= 0) continue;
    if (total < POLICY.settlement.minWithdraw) {
      excluded.push({ seller: u, total, reason: `${formatWon(POLICY.settlement.minWithdraw - total)} 더 모이면 지급` });
      continue;
    }
    if (!hasBankInfo(u)) {
      excluded.push({ seller: u, total, reason: "정산 계좌 미등록" });
      continue;
    }
    items.push({
      sellerId: u.id, name: u.name,
      bankName: u.sellerInfo.bankName, bankAccount: u.sellerInfo.bankAccount, accountHolder: u.sellerInfo.accountHolder,
      balance, pendingIds: pending.map(w => w.id), total
    });
  }
  items.sort((a, b) => b.total - a.total);
  return { items, excluded, total: items.reduce((s, x) => s + x.total, 0) };
}

/* 엑셀에서 바로 열리는 CSV (한글 깨짐 방지 BOM 포함) */
function payoutBatchCSV(batch) {
  const cell = (v) => `"${String(v).replaceAll('"', '""')}"`;
  const rows = [["은행", "계좌번호", "예금주", "금액", "판매자", "메모"]];
  for (const x of batch.items) {
    rows.push([x.bankName, x.bankAccount, x.accountHolder, x.total, x.name, "악보대장 정산"]);
  }
  return "﻿" + rows.map(r => r.map(cell).join(",")).join("\r\n");
}

function completePayoutBatch() {
  const batch = getPayoutBatch();
  if (batch.items.length === 0) return { ok: false, message: "이번 달 지급 대상이 없습니다." };
  const at = nowISO();
  for (const x of batch.items) {
    for (const id of x.pendingIds) {
      STATE.withdrawals[id].status = "지급완료";
      STATE.withdrawals[id].paidAt = at;
    }
    if (x.balance > 0) {
      const id = uid("withdraw");
      STATE.withdrawals[id] = { id, sellerId: x.sellerId, amount: x.balance, status: "지급완료", requestedAt: at, paidAt: at };
      STATE.users[x.sellerId].sellerInfo.settleBalance -= x.balance;
    }
  }
  save();
  return { ok: true, count: batch.items.length, total: batch.total };
}

function payoutWithdrawal(withdrawalId) {
  const w = STATE.withdrawals[withdrawalId];
  if (!w) return { ok: false, message: "출금 요청을 찾을 수 없습니다." };
  if (w.status === "지급완료") return { ok: false, message: "이미 지급되었습니다." };

  w.status = "지급완료";
  w.paidAt = nowISO();

  save();
  return { ok: true };
}

/* ---------- 악보 파일 업로드·다운로드 (Supabase Storage, 2026-10-18 추가) ----------
   저장 경로 규칙: "{판매자 아이디}/{악보 아이디}.pdf" — Storage 보안 정책(RLS)이 이
   경로 규칙을 그대로 보고 "이 파일은 이 판매자 것"이라고 판단하므로 경로 형식을
   임의로 바꾸면 안 된다. */

async function uploadScoreFile(sellerId, scoreId, file) {
  const sb = getSb();
  if (!sb) return { ok: false, message: "서버 연결 준비 중입니다. 잠시 후 다시 시도해주세요." };
  if (!file) return { ok: false, message: "악보 파일을 선택해주세요." };
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!isPdf) return { ok: false, message: "PDF 파일만 업로드할 수 있습니다." };
  const MAX_BYTES = 30 * 1024 * 1024; // 30MB (Storage 버킷 설정과 동일)
  if (file.size > MAX_BYTES) return { ok: false, message: "파일 크기는 30MB를 넘을 수 없습니다." };

  const path = `${sellerId}/${scoreId}.pdf`;
  let error = null;
  try {
    const res = await sb.storage.from("scores").upload(path, file, { upsert: true, contentType: "application/pdf" });
    error = res.error;
  } catch (e) {
    error = e;
  }
  if (error) {
    console.error("[common] 악보 파일 업로드 오류", error);
    return { ok: false, message: "파일 업로드 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요." };
  }
  return { ok: true, path };
}

/* ---------- 악보 미리보기 이미지 (PDF 첫 페이지 → PNG, 2026-10-19 추가) ----------
   판매자가 PDF를 올리면, 그 PDF의 첫 페이지 상단 일부를 이미지로 떠서 미리보기용으로
   별도 저장한다. 구매자 상세 화면에서는 이 이미지가 있으면 그걸 보여주고,
   없으면(아직 이 기능 전에 등록된 악보) 기존 가짜 오선지 그림을 그대로 보여준다.
   pdf.js 가 로드되어 있지 않거나 실패하면 null 을 반환하며, 이 경우 등록 자체는
   계속 진행된다(미리보기 이미지는 선택 사항, 필수 아님). */
async function generateScorePreviewImage(file) {
  if (!window.pdfjsLib) {
    console.warn("[common] pdf.js 가 로드되지 않아 미리보기 이미지를 만들 수 없습니다.");
    return null;
  }
  if (!file) return null;
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    // 화면에서 보기 좋은 해상도로 렌더링(너무 크면 용량이 커지므로 적당히 제한)
    const baseViewport = page.getViewport({ scale: 1 });
    const targetWidth = 1000;
    const scale = Math.min(2.5, targetWidth / baseViewport.width);
    const viewport = page.getViewport({ scale });

    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = Math.ceil(viewport.width);
    fullCanvas.height = Math.ceil(viewport.height);
    const ctx = fullCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    // "첫 N마디 미리보기" 취지에 맞춰, 첫 페이지 전체가 아니라 상단 일부만 자른다.
    const cropRatio = 0.42; // 첫 페이지 상단 42% 정도만 사용
    const cropHeight = Math.max(1, Math.round(fullCanvas.height * cropRatio));
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = fullCanvas.width;
    cropCanvas.height = cropHeight;
    const cropCtx = cropCanvas.getContext("2d");
    cropCtx.drawImage(fullCanvas, 0, 0, fullCanvas.width, cropHeight, 0, 0, fullCanvas.width, cropHeight);

    const blob = await new Promise(resolve => cropCanvas.toBlob(resolve, "image/png", 0.92));
    if (!blob) return null;
    return blob;
  } catch (e) {
    console.error("[common] 미리보기 이미지 생성 오류", e);
    return null;
  }
}

/* 저장 경로 규칙: "{판매자 아이디}/{악보 아이디}.png" — scores 버킷과 동일한 방식으로
   판매자 본인 소유만 쓸 수 있게 RLS 가 경로를 본다. previews 버킷은 공개 읽기이므로
   구매 전 손님도 바로 볼 수 있다. */
async function uploadScorePreviewImage(sellerId, scoreId, blob) {
  if (!blob) return { ok: false, message: "미리보기 이미지를 만들지 못했습니다." };
  const sb = getSb();
  if (!sb) return { ok: false, message: "서버 연결 준비 중입니다. 잠시 후 다시 시도해주세요." };

  const path = `${sellerId}/${scoreId}.png`;
  let error = null;
  try {
    const res = await sb.storage.from("previews").upload(path, blob, { upsert: true, contentType: "image/png" });
    error = res.error;
  } catch (e) {
    error = e;
  }
  if (error) {
    console.error("[common] 미리보기 이미지 업로드 오류", error);
    return { ok: false, message: "미리보기 이미지 업로드 중 문제가 발생했습니다." };
  }
  const { data } = sb.storage.from("previews").getPublicUrl(path);
  if (!data || !data.publicUrl) {
    return { ok: false, message: "미리보기 이미지 주소를 가져오지 못했습니다." };
  }
  return { ok: true, url: data.publicUrl };
}

/* 구매자가 실제로 받을 수 있는 다운로드 링크(서명된 URL, 60초간 유효)를 만든다.
   누가 받을 수 있는지는 Storage 보안 정책(RLS)이 서버에서 다시 한 번 확인한다
   (본인이 올린 판매자 / 환불 안 된 구매자 / 관리자만 가능). */
async function getScoreDownloadUrl(scoreId) {
  const score = STATE.scores[scoreId];
  if (!score) return { ok: false, message: "악보를 찾을 수 없습니다." };
  if (!score.fileUrl) return { ok: false, message: "등록된 파일이 없습니다." };
  const sb = getSb();
  if (!sb) return { ok: false, message: "서버 연결 준비 중입니다. 잠시 후 다시 시도해주세요." };

  let data = null, error = null;
  try {
    const res = await sb.storage.from("scores").createSignedUrl(score.fileUrl, 60);
    data = res.data; error = res.error;
  } catch (e) {
    error = e;
  }
  if (error || !data || !data.signedUrl) {
    console.error("[common] 다운로드 링크 생성 오류", error);
    return { ok: false, message: "다운로드 링크를 만드는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요." };
  }
  return { ok: true, url: data.signedUrl };
}

function submitScore(sellerId, data) {
  const scoreId = data.id || uid("score");
  const tags = Array.isArray(data.tags)
    ? [...new Set(data.tags.map(t => String(t).trim()).filter(Boolean))].slice(0, 5)
    : [];
  // difficulty 는 5단계(SCORE_DIFFICULTIES) 값으로 저장한다. 알 수 없는 값이 오면 "중급"으로 둔다.
  const difficulty = SCORE_DIFFICULTIES.includes(data.difficulty) ? data.difficulty : "중급";
  STATE.scores[scoreId] = {
    id: scoreId, sellerId,
    title: data.title, artist: data.artist, instrument: data.instrument, difficulty,
    price: data.price, hasVideo: !!data.hasVideo,
    videoUrl: data.videoUrl || null, fileUrl: data.fileUrl || null,
    previewUrl: data.previewUrl || null,
    previewInfo: `첫 ${POLICY.preview.bars}마디 미리보기`,
    status: "등록", rejectReason: null, createdAt: nowISO(), approvedAt: null,
    salesCount: 0, viewCount: 0,
    description: (data.description || "").trim(),
    tags,
    thumbnailUrl: (data.thumbnailUrl || "").trim() || null,
    discount: null // { rate, startAt, endAt } — 판매자가 직접 설정, 등록 시점엔 없음 (2026-10-16 추가)
  };
  save();
  return { ok: true, scoreId };
}

function approveScore(scoreId) {
  const score = STATE.scores[scoreId];
  if (!score) return { ok: false, message: "악보를 찾을 수 없습니다." };
  score.status = "승인";
  score.approvedAt = nowISO();
  score.rejectReason = null;
  save();
  return { ok: true };
}

function rejectScore(scoreId, reason) {
  const score = STATE.scores[scoreId];
  if (!score) return { ok: false, message: "악보를 찾을 수 없습니다." };
  score.status = "반려";
  score.rejectReason = reason || "";
  save();
  return { ok: true };
}

/* ---------- 1:1 문의 (고객센터 QnA) ---------- */

function submitInquiry(buyerId, data) {
  const buyer = STATE.users[buyerId];
  if (!buyer) return { ok: false, message: "사용자를 찾을 수 없습니다." };
  const title = (data.title || "").trim();
  const content = (data.content || "").trim();
  if (!title || !content) return { ok: false, message: "제목과 내용을 입력해주세요." };
  const category = INQUIRY_CATEGORIES.includes(data.category) ? data.category : INQUIRY_CATEGORIES[INQUIRY_CATEGORIES.length - 1];

  let scoreId = null, sellerId = null;
  if (data.scoreId && STATE.scores[data.scoreId]) {
    scoreId = data.scoreId;
    sellerId = STATE.scores[scoreId].sellerId;
  }

  const id = uid("inquiry");
  STATE.inquiries[id] = {
    id, buyerId, scoreId, sellerId, category, title, content,
    status: "답변대기", answer: null, createdAt: nowISO()
  };
  save();
  return { ok: true, inquiryId: id };
}

function answerInquiry(inquiryId, by, answererId, text) {
  const inquiry = STATE.inquiries[inquiryId];
  if (!inquiry) return { ok: false, message: "문의를 찾을 수 없습니다." };
  const content = (text || "").trim();
  if (!content) return { ok: false, message: "답변 내용을 입력해주세요." };
  if (by === "seller" && inquiry.sellerId !== answererId) {
    return { ok: false, message: "본인 악보와 관련된 문의만 답변할 수 있습니다." };
  }
  inquiry.answer = { by, text: content, answeredAt: nowISO() };
  inquiry.status = "답변완료";
  save();
  return { ok: true };
}

function getMyInquiries(buyerId) {
  return Object.values(STATE.inquiries)
    .filter(q => q.buyerId === buyerId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getSellerInquiries(sellerId) {
  return Object.values(STATE.inquiries)
    .filter(q => q.sellerId === sellerId)
    .sort((a, b) => (a.status === "답변완료") - (b.status === "답변완료") || new Date(b.createdAt) - new Date(a.createdAt));
}

/* 2026-10-16: 포인트 납부 신청곡 제도를 폐지하고, 구매자가 무료로 자유롭게 올리는
   커뮤니티 게시판으로 바꿨다. 곡 제목·작곡가·가수·악기를 정확히 적도록 네 항목 모두 필수로 받는다.
   note(요청 메모)는 선택 입력이다. */
function submitSongRequest(buyerId, data) {
  const buyer = STATE.users[buyerId];
  if (!buyer) return { ok: false, message: "사용자를 찾을 수 없습니다." };
  const title = (data.title || "").trim();
  const composer = (data.composer || "").trim();
  const singer = (data.singer || "").trim();
  const note = (data.note || "").trim();
  if (!title || !composer || !singer || !INSTRUMENTS.includes(data.instrument)) {
    return { ok: false, message: "곡 제목, 작곡가, 가수, 악기를 모두 입력해주세요." };
  }

  const existing = Object.values(STATE.requests).find(
    r => r.title === title && r.composer === composer && r.singer === singer && r.instrument === data.instrument && r.status !== "완료"
  );
  if (existing && existing.buyerIds.includes(buyerId)) {
    return { ok: false, message: "이미 신청한 곡입니다." };
  }

  if (existing) {
    existing.buyerIds.push(buyerId);
    save();
    return { ok: true, requestId: existing.id, joined: true };
  }

  const requestId = uid("request");
  STATE.requests[requestId] = {
    id: requestId, buyerIds: [buyerId], likedBy: [], title, composer, singer, note,
    instrument: data.instrument, status: "접수", fulfilledScoreId: null, createdAt: nowISO()
  };
  save();
  return { ok: true, requestId, joined: false };
}

/* 신청곡 추천(좋아요) — 신청(buyerIds)과는 별개다. 신청하지 않은 구매자도 눌러서
   관심을 표시할 수 있고, 완성 시 무료 악보 지급 대상(buyerIds)에는 영향을 주지 않는다. (2026-10-16 추가) */
function toggleRequestLike(userId, requestId) {
  const user = STATE.users[userId];
  const r = STATE.requests[requestId];
  if (!user || !r) return { ok: false, message: "정보를 찾을 수 없습니다." };
  if (!Array.isArray(r.likedBy)) r.likedBy = [];
  const has = r.likedBy.includes(userId);
  r.likedBy = has ? r.likedBy.filter(id => id !== userId) : [...r.likedBy, userId];
  save();
  return { ok: true, added: !has };
}

function setRequestStatus(requestId, status) {
  const r = STATE.requests[requestId];
  if (!r) return { ok: false, message: "신청곡을 찾을 수 없습니다." };
  if (!REQUEST_STATUS.includes(status) || status === "완료") return { ok: false, message: "상태 값이 올바르지 않습니다." };
  r.status = status;
  save();
  return { ok: true };
}

/* 신청곡 완료: 연결한 악보를 상태에 기록만 한다.
   2026-10-16 변경: 신청자에게 악보를 무료(0P)로 지급하던 혜택을 완전히 삭제했다.
   이제 신청곡 완료는 "이 곡이 채보되어 악보로 나왔다"는 안내일 뿐이고, 신청자도
   다른 구매자와 동일하게 정가로 구매해야 한다. */
function fulfillRequest(requestId, scoreId) {
  const r = STATE.requests[requestId];
  const score = STATE.scores[scoreId];
  if (!r || !score) return { ok: false, message: "정보를 찾을 수 없습니다." };
  if (score.status !== "승인") return { ok: false, message: "승인된 악보만 연결할 수 있습니다." };
  if (r.status === "완료") return { ok: false, message: "이미 완료된 신청곡입니다." };
  r.status = "완료";
  r.fulfilledScoreId = scoreId;
  save();
  return { ok: true, total: r.buyerIds.length };
}

/* ============================================================
   로그인 / 회원가입 / 비밀번호 재설정 — Supabase Auth 사용
   기존(이름+이메일만 쓰던) 회원은 처음 로그인을 시도하면 자동으로
   "비밀번호 설정" 절차로 안내되고, 메일 인증을 마치면 기존 데이터
   (포인트·구매내역 등)를 그대로 이어서 쓰게 된다.
   ============================================================ */

function findUserByEmail(email) {
  return Object.values(STATE.users).find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

function updateLoginRoleUI() {
  const sub = document.getElementById("signup-role-sub");
  const switchLink = document.getElementById("role-switch-link");
  if (PENDING_ROLE === "seller") {
    if (sub) sub.textContent = "아티스트로 가입합니다.";
    if (switchLink) switchLink.innerHTML = `구매자이신가요? <b>구매자로 가입하기</b>`;
  } else {
    if (sub) sub.textContent = "구매자로 가입합니다.";
    if (switchLink) switchLink.innerHTML = `아티스트이신가요? <b>아티스트로 가입하기</b>`;
  }
}

function switchLoginRole() {
  PENDING_ROLE = PENDING_ROLE === "seller" ? "buyer" : "seller";
  updateLoginRoleUI();
  const errorEl = document.getElementById("signup-error");
  if (errorEl) errorEl.textContent = "";
}

function showLoginPane(pane) {
  for (const p of ["login", "signup", "forgot", "setpassword"]) {
    const el = document.getElementById(`login-pane-${p}`);
    if (el) el.style.display = p === pane ? "block" : "none";
  }
}

function resetLoginForm() {
  PENDING_ROLE = "buyer";
  updateLoginRoleUI();
  showLoginPane("login");
  for (const id of ["login-email", "login-password", "signup-name", "signup-email", "signup-password", "signup-password2", "forgot-email", "setpassword-new", "setpassword-new2"]) {
    const el = document.getElementById(id);
    if (el) el.value = "";
  }
  for (const id of ["login-error", "signup-error", "forgot-error", "setpassword-error"]) {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  }
}

/* 로그인은 화면을 막지 않는다. 계정이 필요한 버튼을 누르는 순간에만
   이 모달이 뜨고, afterLogin 으로 넘긴 동작은 로그인 직후 이어서 실행된다. */

function openLoginModal(role, afterLogin) {
  resetLoginForm();
  PENDING_ROLE = role === "seller" ? "seller" : "buyer";
  updateLoginRoleUI();
  AFTER_LOGIN = typeof afterLogin === "function" ? afterLogin : null;
  if (role === "seller") showLoginPane("signup");
  document.getElementById("login-modal")?.classList.add("open");
  setTimeout(() => {
    const target = role === "seller" ? "signup-name" : "login-email";
    document.getElementById(target)?.focus();
  }, 30);
}

function closeLoginModal() {
  document.getElementById("login-modal")?.classList.remove("open");
  resetLoginForm();
}

/* 기존(비밀번호 없이 쓰던) 회원이 로그인에 실패했을 때, 지금 입력한 비밀번호로
   새 계정을 만들어서 이어붙인다. 이메일 인증 메일을 보내고, 인증을 마치면
   handleSupabaseSignedIn 이 같은 이메일의 기존 회원 데이터를 찾아 연결한다. */
async function migrateExistingUser(email, password, errorEl) {
  const sb = getSb();
  if (!sb) {
    if (errorEl) errorEl.textContent = "로그인 기능을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
    return;
  }
  const { error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: SITE_URL } });
  if (error) {
    if (errorEl) errorEl.textContent = "비밀번호 설정 중 문제가 발생했습니다: " + error.message;
    return;
  }
  if (errorEl) errorEl.textContent = "";
  closeLoginModal();
  toast("기존 계정이시네요! 입력하신 이메일로 인증 메일을 보냈어요. 메일의 링크를 눌러 로그인을 완료해주세요.");
}

async function submitLogin() {
  const emailInput = document.getElementById("login-email");
  const passwordInput = document.getElementById("login-password");
  const errorEl = document.getElementById("login-error");
  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value : "";
  if (errorEl) errorEl.textContent = "";

  if (!email || !password) {
    if (errorEl) errorEl.textContent = "이메일과 비밀번호를 모두 입력해주세요.";
    return;
  }

  const sb = getSb();
  if (!sb) {
    if (errorEl) errorEl.textContent = "로그인 기능을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
    return;
  }

  const submitBtn = document.getElementById("login-submit");
  if (submitBtn) submitBtn.disabled = true;
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (submitBtn) submitBtn.disabled = false;

  if (!error && data && data.session) {
    // 로그인 성공 처리는 onAuthStateChange 의 SIGNED_IN 이벤트(handleSupabaseSignedIn)에서 한다
    return;
  }

  // 로그인 실패 — 비밀번호 없이 쓰던 기존 회원인지 확인한다
  const existing = findUserByEmail(email);
  if (existing && !existing.supabaseUserId) {
    await migrateExistingUser(email, password, errorEl);
    return;
  }

  if (errorEl) errorEl.textContent = "이메일 또는 비밀번호가 올바르지 않습니다.";
}

async function submitSignup() {
  const nameInput = document.getElementById("signup-name");
  const emailInput = document.getElementById("signup-email");
  const pwInput = document.getElementById("signup-password");
  const pw2Input = document.getElementById("signup-password2");
  const errorEl = document.getElementById("signup-error");
  const name = nameInput ? nameInput.value.trim() : "";
  const email = emailInput ? emailInput.value.trim() : "";
  const password = pwInput ? pwInput.value : "";
  const password2 = pw2Input ? pw2Input.value : "";
  if (errorEl) errorEl.textContent = "";

  if (!name || !email || !password) {
    if (errorEl) errorEl.textContent = "이름, 이메일, 비밀번호를 모두 입력해주세요.";
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (errorEl) errorEl.textContent = "이메일 형식을 확인해주세요.";
    return;
  }
  if (password.length < 6) {
    if (errorEl) errorEl.textContent = "비밀번호는 6자 이상이어야 합니다.";
    return;
  }
  if (password !== password2) {
    if (errorEl) errorEl.textContent = "비밀번호가 서로 다릅니다.";
    return;
  }
  if (findUserByEmail(email)) {
    if (errorEl) errorEl.textContent = "이미 가입된 이메일입니다. 로그인해주세요.";
    return;
  }

  const sb = getSb();
  if (!sb) {
    if (errorEl) errorEl.textContent = "회원가입 기능을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
    return;
  }

  const submitBtn = document.getElementById("signup-submit");
  if (submitBtn) submitBtn.disabled = true;
  const { error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: SITE_URL } });
  if (submitBtn) submitBtn.disabled = false;

  if (error) {
    if (errorEl) {
      errorEl.textContent = /already|registered|exists/i.test(error.message)
        ? "이미 가입된 이메일입니다. 로그인해주세요."
        : "회원가입 중 문제가 발생했습니다: " + error.message;
    }
    return;
  }

  try {
    localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify({ email, name, role: PENDING_ROLE }));
  } catch (e) { /* 저장이 막힌 브라우저에서는 그냥 넘어간다 (기본값 buyer 로 가입된다) */ }

  closeLoginModal();
  toast("인증 메일을 보냈어요! 메일의 링크를 눌러 가입을 완료해주세요.");
}

async function submitForgotPassword() {
  const emailInput = document.getElementById("forgot-email");
  const errorEl = document.getElementById("forgot-error");
  const email = emailInput ? emailInput.value.trim() : "";
  if (errorEl) errorEl.textContent = "";
  if (!email) {
    if (errorEl) errorEl.textContent = "이메일을 입력해주세요.";
    return;
  }
  const sb = getSb();
  if (!sb) {
    if (errorEl) errorEl.textContent = "기능을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
    return;
  }
  const submitBtn = document.getElementById("forgot-submit");
  if (submitBtn) submitBtn.disabled = true;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL });
  if (submitBtn) submitBtn.disabled = false;
  if (error) {
    if (errorEl) errorEl.textContent = "요청 중 문제가 발생했습니다: " + error.message;
    return;
  }
  closeLoginModal();
  toast("재설정 메일을 보냈어요. 메일함을 확인해주세요.");
}

async function submitSetPassword() {
  const pwInput = document.getElementById("setpassword-new");
  const pw2Input = document.getElementById("setpassword-new2");
  const errorEl = document.getElementById("setpassword-error");
  const password = pwInput ? pwInput.value : "";
  const password2 = pw2Input ? pw2Input.value : "";
  if (errorEl) errorEl.textContent = "";
  if (!password || password.length < 6) {
    if (errorEl) errorEl.textContent = "비밀번호는 6자 이상이어야 합니다.";
    return;
  }
  if (password !== password2) {
    if (errorEl) errorEl.textContent = "비밀번호가 서로 다릅니다.";
    return;
  }
  const sb = getSb();
  if (!sb) {
    if (errorEl) errorEl.textContent = "기능을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
    return;
  }
  const submitBtn = document.getElementById("setpassword-submit");
  if (submitBtn) submitBtn.disabled = true;
  const { error } = await sb.auth.updateUser({ password });
  if (submitBtn) submitBtn.disabled = false;
  if (error) {
    if (errorEl) errorEl.textContent = "비밀번호 설정 중 문제가 발생했습니다: " + error.message;
    return;
  }
  closeLoginModal();
  toast("비밀번호가 설정되었습니다.");
}

/* Supabase 로그인이 실제로 확정되는 순간(이메일 인증 완료 포함) 호출된다.
   같은 이메일의 기존 회원 데이터가 있으면 그대로 이어서 쓰고, 없으면
   (회원가입 때 임시로 남겨둔 이름·역할을 참고해) 새 회원으로 만든다. */
async function handleSupabaseSignedIn(session) {
  const email = session.user.email;
  const authId = session.user.id;
  let user = findUserByEmail(email);

  if (user) {
    if (!user.supabaseUserId) user.supabaseUserId = authId;
    // 관리자 지정 이메일(STATE.adminEmails)로 로그인하면 기존 회원이어도 관리자 권한을 붙여준다
    if (isAdminEmail(email)) user.isAdmin = true;
  } else {
    let name = email.split("@")[0];
    let role = "buyer";
    try {
      const raw = localStorage.getItem(PENDING_SIGNUP_KEY);
      const pending = raw ? JSON.parse(raw) : null;
      if (pending && pending.email && pending.email.toLowerCase() === email.toLowerCase()) {
        name = pending.name || name;
        role = pending.role || role;
      }
    } catch (e) { /* 무시 */ }
    user = makeUser(name, email, role);
    user.supabaseUserId = authId;
  }
  try { localStorage.removeItem(PENDING_SIGNUP_KEY); } catch (e) { /* 무시 */ }

  save();
  saveSession(user.id);
  CURRENT_USER_ID = user.id;

  const after = AFTER_LOGIN;
  AFTER_LOGIN = null;
  closeLoginModal();
  if (after) {
    showView("buyer");
    after();
  } else {
    showView(user.role === "seller" ? "seller" : "buyer");
  }
  toast(`${user.name}님 환영합니다!`);
}

/* Supabase Auth 상태 변화를 듣는다.
   - SIGNED_IN: 로그인(또는 회원가입 인증) 완료 → 위 handleSupabaseSignedIn 실행
   - PASSWORD_RECOVERY: "비밀번호를 잊으셨나요?" 메일의 링크를 눌렀을 때 → 새 비밀번호 입력창을 띄운다 */
function initSupabaseAuth() {
  const sb = getSb();
  if (!sb) {
    console.error("[common] Supabase 로그인 라이브러리를 불러오지 못했습니다. index.html 의 스크립트 태그를 확인해주세요.");
    return;
  }
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      resetLoginForm();
      showLoginPane("setpassword");
      document.getElementById("login-modal")?.classList.add("open");
    } else if (event === "SIGNED_IN" && session) {
      handleSupabaseSignedIn(session);
    }
  });
}

/* 계정이 필요한 동작 앞에 붙인다. 로그인 안 했으면 모달을 띄우고, 로그인 후 이어서 실행 */
function requireLogin(action) {
  if (getCurrentUser()) { action(); return; }
  openLoginModal("buyer", action);
}

/* 이미 로그인한 회원(구매자)이 "아티스트로 시작하기"를 눌렀을 때,
   새로 회원가입을 받지 않고 지금 쓰던 계정 그대로 판매자 권한을 더해준다. */
function becomeSeller(user) {
  if (user.role !== "seller" && user.role !== "both") user.role = "both";
  if (!user.sellerInfo) {
    user.sellerInfo = { bankName: "", bankAccount: "", accountHolder: user.name, settleBalance: 0, displayName: user.name };
  } else if (typeof user.sellerInfo.displayName !== "string" || !user.sellerInfo.displayName.trim()) {
    user.sellerInfo.displayName = user.name;
  }
  save();
  showView("seller");
  window.scrollTo({ top: 0 });
  toast("아티스트 등록이 완료됐어요! 이제 이 계정으로 악보를 등록할 수 있어요.");
}

/* 구매자에게 보이는 판매자 활동명을 바꾼다. 가입할 때 적은 실명과 달라도 되고,
   판매자 센터에서 언제든 바꿀 수 있다. 정산 계좌의 예금주명(accountHolder)과는 별개다. */
function setSellerDisplayName(userId, name) {
  const user = STATE.users[userId];
  if (!user) return { ok: false, message: "회원을 찾을 수 없습니다." };
  const trimmed = (name || "").trim();
  if (!trimmed) return { ok: false, message: "활동명을 입력해주세요." };
  if (trimmed.length > 30) return { ok: false, message: "활동명은 30자 이내로 입력해주세요." };
  if (!user.sellerInfo) {
    user.sellerInfo = { bankName: "", bankAccount: "", accountHolder: user.name, settleBalance: 0, displayName: trimmed };
  } else {
    user.sellerInfo.displayName = trimmed;
  }
  save();
  return { ok: true };
}

function logout() {
  const sb = getSb();
  if (sb) sb.auth.signOut().catch(() => {});
  clearSession();
  CURRENT_USER_ID = null;
  if (typeof goBuyer === "function") goBuyer("home");
  else showView("buyer");
}

/* 관리자 화면으로 들어간다. tryEnterAdmin() 이 로그인·권한 확인을 끝낸 뒤에만 호출된다. */
function enterAdminPreview() {
  showView("admin");
  window.scrollTo({ top: 0 });
}

/* 관리자 화면 입장 버튼을 누르면 호출된다. (2026-10-13 변경: 비밀번호 대신 실제 로그인 계정으로 확인)
   - 로그인 안 되어 있으면 로그인 모달을 띄우고, 로그인 후 자동으로 다시 이 함수를 확인한다.
   - 로그인은 되어 있지만 관리자 계정(ADMIN_EMAILS)이 아니면 안내만 뜨고 들어가지지 않는다. */
function tryEnterAdmin() {
  const user = getCurrentUser();
  if (!user) {
    openLoginModal("buyer", () => {
      if (getCurrentUser() && getCurrentUser().isAdmin) {
        enterAdminPreview();
      } else {
        toast("관리자 권한이 없는 계정입니다.", true);
      }
    });
    return;
  }
  if (!user.isAdmin) {
    toast("관리자 권한이 없는 계정입니다.", true);
    return;
  }
  enterAdminPreview();
}

function getCurrentUser() {
  return STATE.users[CURRENT_USER_ID] || null;
}

/* ---------- 화면 전환 (라우터) ----------
   스토어(buyer)는 누구나 볼 수 있다. 판매자·관리자는 스토어 탭이 같이 보인다.
   탭(nav)은 2개 이상일 때만 보인다. */

function visibleViewsForCurrentUser() {
  const user = getCurrentUser();
  if (!user) return ["buyer"];
  const views = ["buyer"];
  if (user.role === "both" || user.role === "seller") views.push("seller");
  if (user.isAdmin) views.push("admin");
  return views;
}

function showView(viewName, opts) {
  CURRENT_VIEW = viewName;
  for (const name of ["buyer", "seller", "admin"]) {
    const el = document.getElementById(`view-${name}`);
    if (el) el.style.display = name === viewName ? "block" : "none";
  }
  renderNav();
  renderAll();
  if (!(opts && opts.fromHistory)) pushNavState();
}

/* ---------- 브라우저 뒤로가기 지원 ----------
   화면이 바뀔 때마다(showView, goBuyer) 브라우저 기록에 한 칸씩 쌓아서,
   뒤로가기를 누르면 바로 전 화면으로, 계속 누르면 결국 처음 열었던 메인(홈)
   화면까지 돌아가도록 한다. opts.fromHistory 가 true 면(뒤로/앞으로가기로
   이미 호출된 경우) 다시 기록을 쌓지 않는다 — 그래야 무한히 쌓이지 않는다.
   (2026-10-13 추가) */

function currentNavState() {
  const state = { view: CURRENT_VIEW };
  if (CURRENT_VIEW === "buyer" && typeof BUYER_ROUTE !== "undefined") {
    state.buyerPage = BUYER_ROUTE.page;
    state.buyerParams = BUYER_ROUTE.params;
  }
  return state;
}

function pushNavState() {
  try { history.pushState(currentNavState(), ""); } catch (e) { /* 일부 환경(파일로 직접 열었을 때 등)에서는 history API가 막힐 수 있다 */ }
}

function applyNavState(state) {
  if (!state) {
    showView("buyer", { fromHistory: true });
    if (typeof goBuyer === "function") goBuyer("home", {}, { fromHistory: true, keepScroll: true });
    return;
  }
  showView(state.view || "buyer", { fromHistory: true });
  if (state.view === "buyer" && typeof goBuyer === "function") {
    goBuyer(state.buyerPage || "home", state.buyerParams || {}, { fromHistory: true, keepScroll: true });
  }
}

window.addEventListener("popstate", (e) => { applyNavState(e.state); });

function renderNav() {
  const navBarWrap = document.querySelector(".nav-bar");
  const nav = document.getElementById("main-nav");
  if (!nav) return;
  const labels = { buyer: "스토어", seller: "판매자 센터", admin: "관리자" };
  const visible = visibleViewsForCurrentUser();

  if (visible.length <= 1) {
    if (navBarWrap) navBarWrap.style.display = "none";
    nav.innerHTML = "";
    return;
  }
  if (navBarWrap) navBarWrap.style.display = "block";

  nav.innerHTML = visible.map(v =>
    `<button data-view="${v}" class="${v === CURRENT_VIEW ? "active" : ""}">${labels[v]}</button>`
  ).join("");

  nav.querySelectorAll("[data-view]").forEach(btn => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });
}

function renderAll() {
  if (CURRENT_VIEW === "buyer" && typeof renderBuyer === "function") renderBuyer();
  if (CURRENT_VIEW === "seller" && typeof renderSeller === "function") renderSeller();
  if (CURRENT_VIEW === "admin" && typeof renderAdmin === "function") renderAdmin();
  renderHeaderAuth();
}

function renderHeaderAuth() {
  const bar = document.getElementById("header-auth");
  if (!bar) return;

  const user = getCurrentUser();
  const cartCount = user ? user.cart.length : 0;
  const cartBtn = `
    <button id="header-cart-btn" class="icon-btn" aria-label="장바구니">
      <span class="icon-btn-glyph"><i class="ico ico-cart"></i></span><span class="icon-btn-label">장바구니</span>
      ${cartCount ? `<span class="badge">${cartCount}</span>` : ""}
    </button>`;

  if (!user) {
    // 2026-10-19: 헤더의 별도 "아티스트 되기" 버튼은 없앴다 — 회원가입 모달 안의
    // "아티스트이신가요? 아티스트로 가입하기" 링크(switchLoginRole)로 이미 들어갈 수 있어서,
    // "로그인" 버튼 하나로 통합한다. 홈 화면의 "아티스트로 시작하기" 배너·안내박스는 그대로 둔다.
    bar.innerHTML = `
      ${cartBtn}
      <button id="header-login-btn" class="auth-btn">로그인</button>
    `;
    document.getElementById("header-login-btn")?.addEventListener("click", () => openLoginModal("buyer"));
  } else {
    bar.innerHTML = `
      ${cartBtn}
      <button id="header-my-btn" class="icon-btn" aria-label="마이페이지">
        <span class="icon-btn-glyph"><i class="ico ico-user"></i></span><span class="icon-btn-label">${esc(user.name)}님 · ${formatPoint(user.points)}</span>
      </button>
      <button id="logout-btn" class="auth-btn">로그아웃</button>
      ${user.isAdmin ? `<button id="header-admin-btn" class="auth-btn">관리자 페이지</button>` : ""}
    `;
    document.getElementById("header-my-btn")?.addEventListener("click", () => {
      if (typeof goBuyer === "function") goBuyer("mypage");
    });
  }

  document.getElementById("header-cart-btn")?.addEventListener("click", () => {
    requireLogin(() => { if (typeof goBuyer === "function") goBuyer("cart"); });
  });
  document.getElementById("logout-btn")?.addEventListener("click", logout);
  document.getElementById("header-admin-btn")?.addEventListener("click", tryEnterAdmin);
}

/* ---------- 헤더 검색창 · 악기 메뉴 (index.html 의 고정 영역) ---------- */

function initHeaderSearch() {
  const input = document.getElementById("header-search");
  const form = document.getElementById("header-search-form");
  const suggest = document.getElementById("search-suggest");
  if (!input || !form || !suggest) return;

  const hideSuggest = () => { suggest.innerHTML = ""; suggest.classList.remove("open"); };

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { hideSuggest(); return; }
    const scores = Object.values(STATE.scores)
      .filter(s => s.status === "승인" && (
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        (s.tags || []).some(t => t.toLowerCase().includes(q))
      ))
      .slice(0, 5);
    const sellers = Object.values(STATE.users)
      .filter(u => u.sellerInfo && u.name.toLowerCase().includes(q))
      .slice(0, 3);
    if (scores.length === 0 && sellers.length === 0) {
      suggest.innerHTML = `<div class="suggest-empty">"${esc(input.value.trim())}" 검색 결과로 이동하려면 Enter</div>`;
    } else {
      suggest.innerHTML = [
        ...scores.map(s => `<button type="button" class="suggest-item" data-score="${s.id}"><span><i class="ico ico-music"></i></span><span class="suggest-main">${esc(s.title)}</span><span class="suggest-sub">${esc(s.instrument)} · ${esc(s.difficulty)}</span></button>`),
        ...sellers.map(u => `<button type="button" class="suggest-item" data-seller="${u.id}"><span><i class="ico ico-mic"></i></span><span class="suggest-main">${esc(u.name)}</span><span class="suggest-sub">아티스트</span></button>`)
      ].join("");
    }
    suggest.classList.add("open");
    suggest.querySelectorAll("[data-score]").forEach(b => b.addEventListener("mousedown", (e) => {
      e.preventDefault();
      hideSuggest();
      if (typeof goBuyer === "function") { showView("buyer"); goBuyer("detail", { id: b.dataset.score }); }
    }));
    suggest.querySelectorAll("[data-seller]").forEach(b => b.addEventListener("mousedown", (e) => {
      e.preventDefault();
      hideSuggest();
      if (typeof goBuyer === "function") { showView("buyer"); goBuyer("artist", { id: b.dataset.seller }); }
    }));
  });
  input.addEventListener("blur", () => setTimeout(hideSuggest, 120));
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") { hideSuggest(); input.blur(); } });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideSuggest();
    if (typeof goBuyer === "function") {
      showView("buyer");
      goBuyer("list", { q: input.value.trim() });
    }
  });

  document.querySelectorAll("[data-menu]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (typeof goBuyer !== "function") return;
      showView("buyer");
      const m = btn.dataset.menu;
      if (m === "home") goBuyer("home");
      else if (m === "video") goBuyer("list", { video: true });
      else if (m === "requests") goBuyer("requests");
      else if (m === "new") goBuyer("list", { sort: "latest" });
      else goBuyer("list", { instrument: m });
    });
  });

  document.getElementById("logo-home")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (typeof goBuyer === "function") { showView("buyer"); goBuyer("home"); }
  });
}

const INSTRUMENT_ICON_COMMON = {
  "드럼": "♪", "기타": "♪", "피아노": "♪", "베이스": "♪", "우쿨렐레": "♪", "칼림바": "♪", "리코더": "♪"
};

/* 헤더 메뉴의 '현재 위치' 표시 */
function setActiveMenu(key) {
  document.querySelectorAll("[data-menu]").forEach(b => b.classList.toggle("active", b.dataset.menu === key));
}

/* 화면 아래쪽에 잠깐 떴다 사라지는 안내 문구 */
function toast(message, isError) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("toast-error", !!isError);
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ---------- 시작 ---------- */

async function initCommon() {
  await load();
  seedIfEmpty();

  initSupabaseAuth();

  updateLoginRoleUI();
  document.getElementById("role-switch-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    switchLoginRole();
  });
  document.getElementById("login-submit")?.addEventListener("click", submitLogin);
  document.getElementById("login-password")?.addEventListener("keydown", (e) => { if (e.key === "Enter") submitLogin(); });
  document.getElementById("signup-submit")?.addEventListener("click", submitSignup);
  document.getElementById("signup-password2")?.addEventListener("keydown", (e) => { if (e.key === "Enter") submitSignup(); });
  document.getElementById("forgot-submit")?.addEventListener("click", submitForgotPassword);
  document.getElementById("forgot-email")?.addEventListener("keydown", (e) => { if (e.key === "Enter") submitForgotPassword(); });
  document.getElementById("setpassword-submit")?.addEventListener("click", submitSetPassword);
  document.getElementById("setpassword-new2")?.addEventListener("keydown", (e) => { if (e.key === "Enter") submitSetPassword(); });

  document.getElementById("go-signup-link")?.addEventListener("click", (e) => { e.preventDefault(); showLoginPane("signup"); });
  document.getElementById("go-login-link")?.addEventListener("click", (e) => { e.preventDefault(); showLoginPane("login"); });
  document.getElementById("go-forgot-link")?.addEventListener("click", (e) => { e.preventDefault(); showLoginPane("forgot"); });
  document.getElementById("forgot-back-link")?.addEventListener("click", (e) => { e.preventDefault(); showLoginPane("login"); });

  document.getElementById("login-modal-close")?.addEventListener("click", closeLoginModal);
  document.getElementById("login-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "login-modal") closeLoginModal();
  });
  document.getElementById("admin-preview-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    tryEnterAdmin();
  });
  document.getElementById("footer-support-link")?.addEventListener("click", () => {
    if (typeof goBuyer === "function") { showView("buyer"); goBuyer("support"); }
  });

  initHeaderSearch();

  const session = loadSession();
  if (session && STATE.users[session.userId]) {
    CURRENT_USER_ID = session.userId;
  }
  // 첫 화면은 기록을 "쌓지" 않고 지금 자리를 바꿔치기한다(replaceState).
  // 그래야 처음 열자마자 뒤로가기를 눌러도 빈 화면으로 가지 않는다.
  showView("buyer", { fromHistory: true });
  try { history.replaceState(currentNavState(), ""); } catch (e) {}
}

document.addEventListener("DOMContentLoaded", () => { initCommon(); });
