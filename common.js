/* ============================================================
   common.js — 악보대장(가칭) 뼈대 · 로그인 · 결제 · 정산 · 통합
   총괄/ 모드 전용 파일. 다른 모드(구매자/판매자/관리자)는
   이 파일의 함수를 호출만 하고 직접 수정하지 않습니다.
   ============================================================ */

const STORAGE_KEY = "madi.store.v1";
const SESSION_KEY = "madi.session.v1";
const RECENT_KEY = "madi.recent.v1"; // 최근 본 악보 (브라우저별 편의 기능, 서비스 데이터 아님)

const POLICY = {
  commission: {
    normal: 0.25,   // 일반 편곡 25% (아티스트 정산 75%)
    original: 0.20  // 창작·오리지널 편곡 20%  ※ [미확정] 수치, 공통규칙.md 참고
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
  request: {
    pointCost: 1000
  },
  settlement: {
    minWithdraw: 20000,
    payoutDay: 10
  },
  refund: {
    windowDays: 7
  },
  preview: {
    bars: 8
  },
  adminPassword: "akbo2026" // 관리자 화면 입장 비밀번호. 나중에 원하는 값으로 바꿔도 된다.
};

const INSTRUMENTS = ["드럼", "기타", "피아노", "베이스", "바이올린", "보컬"];
const DIFFICULTIES = ["초급", "중급", "고급"];
const SCORE_STATUS = ["등록", "심사중", "승인", "반려"];
const WITHDRAW_STATUS = ["요청", "지급완료"];
const REQUEST_STATUS = ["접수", "채보중", "완료"];
const INQUIRY_STATUS = ["답변대기", "답변완료"];
const INQUIRY_CATEGORIES = ["결제·포인트", "환불", "악보·심사", "정산", "계정", "기타"];

let STATE = null;
let CURRENT_USER_ID = null;
let CURRENT_VIEW = "buyer";
let PENDING_ROLE = "buyer"; // 로그인 폼이 지금 어떤 역할로 맞춰져 있는지. 기본값은 구매자
let ADMIN_PREVIEW = false;  // 로그인 없이 관리자 화면만 미리보는 모드
let AFTER_LOGIN = null;     // 로그인 모달을 띄운 동작 (로그인 끝나면 이어서 실행)

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

/* ---------- 저장 / 불러오기 (서비스 데이터) ---------- */

const COLLECTIONS = ["users", "scores", "purchases", "requests", "charges", "withdrawals", "reviews", "inquiries"];

function emptyState() {
  const s = {};
  for (const key of COLLECTIONS) s[key] = {};
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    STATE = raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error("[common] 저장된 데이터를 읽지 못했습니다.", e);
    STATE = null;
  }
  if (!STATE) STATE = emptyState();
  for (const key of COLLECTIONS) {
    if (!STATE[key]) STATE[key] = {};
  }
  // 예전에 저장된 데이터에 새 칸(찜·장바구니·구독·악보소개)이 없으면 빈 값으로 채운다
  for (const u of Object.values(STATE.users)) {
    if (!Array.isArray(u.wishlist)) u.wishlist = [];
    if (!Array.isArray(u.cart)) u.cart = [];
    if (!Array.isArray(u.following)) u.following = [];
  }
  for (const s of Object.values(STATE.scores)) {
    if (s.difficulty === "상급") s.difficulty = "고급";
    if (s.difficulty === "입문") s.difficulty = "초급";
    if (s.instrument === "리코더" || s.instrument === "칼림바" || s.instrument === "우쿨렐레") { delete STATE.scores[s.id]; continue; }
    if (typeof s.description !== "string") s.description = "";
    if (!Array.isArray(s.tags)) s.tags = [];
    if (typeof s.thumbnailUrl !== "string" || !s.thumbnailUrl.trim()) s.thumbnailUrl = null;
  }
  // 삭제된 카테고리(리코더·칼림바·우쿨렐레) 악보를 가리키는 기록 정리
  for (const key of COLLECTIONS) {
    for (const [id, r] of Object.entries(STATE[key])) {
      if (r && r.scoreId && !STATE.scores[r.scoreId]) delete STATE[key][id];
    }
  }
  for (const u of Object.values(STATE.users)) {
    u.wishlist = u.wishlist.filter(id => STATE.scores[id]);
    u.cart = u.cart.filter(id => STATE.scores[id]);
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE));
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
    wishlist: [], cart: [], following: []
  };
  if (role === "seller" || role === "both") {
    user.sellerInfo = { bankName: "", bankAccount: "", accountHolder: name, settleBalance: 0 };
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
  sellers[0].sellerInfo = { bankName: "국민은행", bankAccount: "000-0000-0001", accountHolder: "데모 드럼스튜디오", settleBalance: 0 };
  sellers[1].sellerInfo = { bankName: "신한은행", bankAccount: "000-0000-0002", accountHolder: "데모 그루브랩", settleBalance: 0 };
  sellers[2].sellerInfo = { bankName: "우리은행", bankAccount: "000-0000-0003", accountHolder: "데모 기타하우스", settleBalance: 0 };
  // sellers[3] 은 계좌 미등록 예시로 둔다 (지급 목록에서 빠지는 모습 확인용)

  const list = [
    // [판매자index, 제목, 악기, 난이도, 가격, 오리지널, 영상, 며칠전]
    [0, "8비트 기본 그루브 연습곡", "드럼", "초급", 1500, true, true, 1],
    [0, "16비트 하이햇 연습곡", "드럼", "초급", 2000, true, true, 2],
    [1, "펑크 고스트노트 그루브", "드럼", "중급", 3000, true, true, 3],
    [1, "셔플 블루스 리듬 연습곡", "드럼", "중급", 2500, true, false, 4],
    [0, "더블킥 빌드업 연습곡", "드럼", "고급", 4000, true, true, 5],
    [1, "보사노바 리듬 패턴", "드럼", "중급", 2500, true, true, 6],
    [0, "필인 모음집 Vol.1", "드럼", "초급", 3500, true, true, 8],
    [1, "메탈 블라스트비트 연습곡", "드럼", "고급", 4500, true, false, 9],
    [0, "발라드 6/8 그루브 연습곡", "드럼", "초급", 1500, true, true, 11],
    [2, "통기타 스트로크 입문 연습곡", "기타", "초급", 1500, true, true, 2],
    [2, "핑거스타일 아르페지오 연습곡", "기타", "중급", 3000, true, false, 7],
    [2, "베이스 루트음 워킹 연습곡", "베이스", "초급", 2000, true, true, 10],
    [3, "피아노 왼손 반주 패턴 연습곡", "피아노", "초급", 2000, true, false, 3]
  ];

  const scoreIds = [];
  for (const [si, title, instrument, difficulty, price, isOriginal, hasVideo, ago] of list) {
    const id = uid("score");
    const seller = sellers[si];
    STATE.scores[id] = {
      id, sellerId: seller.id, title, artist: "악보대장 데모 연습곡", instrument, difficulty,
      price, isOriginal, hasVideo, videoUrl: hasVideo ? "https://www.youtube.com" : null, fileUrl: "demo.pdf",
      previewInfo: `첫 ${POLICY.preview.bars}마디 미리보기`, status: "승인", rejectReason: null,
      createdAt: daysAgoISO(ago), approvedAt: daysAgoISO(ago),
      salesCount: 0, viewCount: Math.floor(Math.random() * 300) + 20,
      description: `${instrument} ${difficulty} 단계 연습용 데모 악보입니다. 실제 판매 악보가 아니라 화면 확인을 위한 예시입니다.`
    };
    scoreIds.push(id);
  }

  // 심사 대기 예시 2개
  for (const [title, instrument] of [["데모 심사대기 드럼 악보", "드럼"], ["데모 심사대기 기타 악보", "기타"]]) {
    const id = uid("score");
    STATE.scores[id] = {
      id, sellerId: sellers[1].id, title, artist: "악보대장 데모 연습곡", instrument, difficulty: "중급",
      price: 2000, isOriginal: false, hasVideo: false, videoUrl: null, fileUrl: "demo.pdf",
      previewInfo: `첫 ${POLICY.preview.bars}마디 미리보기`, status: "심사중", rejectReason: null,
      createdAt: nowISO(), approvedAt: null, salesCount: 0, viewCount: 0, description: ""
    };
  }

  // 인기 순위가 비어 보이지 않게 데모 구매자 몇 명이 산 기록을 만든다
  const demoBuyers = [];
  for (let i = 1; i <= 6; i++) {
    demoBuyers.push(makeUser(`데모 구매자${i}`, `demo-buyer${i}@example.com`, "buyer", { points: 0, createdAt: daysAgoISO(25 + i) }));
  }
  sellers.forEach((u, i) => { u.createdAt = daysAgoISO(45 - i * 3); });
  buyer.createdAt = daysAgoISO(2);
  const salesPlan = [6, 5, 5, 3, 4, 2, 4, 1, 3, 4, 2, 2, 1, 1];
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

  // 신청곡 예시
  const reqs = [
    ["데모 신청곡 A", "데모 가수", "드럼", [buyer.id, ...demoBuyers.slice(0, 3).map(b => b.id)]],
    ["데모 신청곡 B", "데모 가수", "드럼", [buyer.id, demoBuyers[4].id]],
    ["데모 신청곡 C", "데모 밴드", "기타", [demoBuyers[3].id]]
  ];
  for (const [title, artist, instrument, buyerIds] of reqs) {
    const id = uid("request");
    STATE.requests[id] = { id, buyerIds, title, artist, instrument, status: "접수", fulfilledScoreId: null };
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

  // 김구매도 신청곡 2건을 신청한 것으로 맞춘다 (신청금 차감 기록)
  for (const t of ["데모 신청곡 A", "데모 신청곡 B"]) {
    buyer.points -= POLICY.request.pointCost;
    buyer.pointHistory.push({ amount: -POLICY.request.pointCost, reason: `신청곡: ${t}`, at: nowISO() });
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
  return score.isOriginal ? POLICY.commission.original : POLICY.commission.normal;
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

function purchaseScore(buyerId, scoreId) {
  const buyer = STATE.users[buyerId];
  const score = STATE.scores[scoreId];
  if (!buyer || !score) return { ok: false, message: "정보를 찾을 수 없습니다." };
  if (score.status !== "승인") return { ok: false, message: "판매 중인 악보가 아닙니다." };
  if (score.sellerId === buyerId) return { ok: false, message: "본인이 등록한 악보는 구매할 수 없습니다." };
  if (buyer.points < score.price) return { ok: false, message: "포인트가 부족합니다." };
  if (hasPurchased(buyerId, scoreId)) return { ok: false, message: "이미 구매한 악보입니다." };

  const commissionRate = calcCommission(score);
  const sellerEarning = Math.round(score.price * (1 - commissionRate));

  buyer.points -= score.price;
  buyer.pointHistory.push({ amount: -score.price, reason: `악보 구매: ${score.title}`, at: nowISO() });

  const seller = STATE.users[score.sellerId];
  if (seller && seller.sellerInfo) {
    seller.sellerInfo.settleBalance += sellerEarning;
  }

  score.salesCount += 1;
  buyer.cart = (buyer.cart || []).filter(id => id !== scoreId);

  const purchaseId = uid("purchase");
  const purchasedAt = nowISO();
  const refundDeadline = new Date(Date.now() + POLICY.refund.windowDays * 86400000).toISOString();

  STATE.purchases[purchaseId] = {
    id: purchaseId, buyerId, scoreId, sellerId: score.sellerId,
    price: score.price, commissionRate, sellerEarning,
    purchasedAt, downloaded: false, downloadedAt: null,
    refunded: false, refundedAt: null, refundDeadline
  };

  save();
  return { ok: true, purchaseId };
}

/* 장바구니 전체 구매: 합계 포인트가 모자라면 한 건도 사지 않는다 */
function purchaseCart(buyerId) {
  const buyer = STATE.users[buyerId];
  if (!buyer) return { ok: false, message: "사용자를 찾을 수 없습니다." };
  const items = (buyer.cart || [])
    .map(id => STATE.scores[id])
    .filter(s => s && s.status === "승인" && !hasPurchased(buyerId, s.id) && s.sellerId !== buyerId);
  if (items.length === 0) return { ok: false, message: "장바구니에 구매할 악보가 없습니다." };
  const total = items.reduce((sum, s) => sum + s.price, 0);
  if (buyer.points < total) {
    return { ok: false, message: `포인트가 ${formatPoint(total - buyer.points)} 부족합니다.` };
  }
  let count = 0;
  for (const s of items) {
    const r = purchaseScore(buyerId, s.id);
    if (r.ok) count += 1;
  }
  buyer.cart = [];
  save();
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

function recordView(scoreId) {
  const score = STATE.scores[scoreId];
  if (!score) return;
  score.viewCount += 1;
  save();
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

/* 관리자 포인트 수동 조정 (고객 보상·오류 정정). 사유가 회원 포인트 내역에 남는다 */
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

function refundPurchase(purchaseId) {
  const purchase = STATE.purchases[purchaseId];
  if (!purchase) return { ok: false, message: "구매 내역을 찾을 수 없습니다." };
  if (purchase.refunded) return { ok: false, message: "이미 환불되었습니다." };
  if (purchase.price === 0) return { ok: false, message: "무료로 받은 악보는 환불 대상이 아닙니다." };
  if (purchase.downloaded) return { ok: false, message: "파일을 이미 열람하여 환불할 수 없습니다." };
  if (new Date() > new Date(purchase.refundDeadline)) {
    return { ok: false, message: "환불 가능 기간(7일)이 지났습니다." };
  }

  const buyer = STATE.users[purchase.buyerId];
  const seller = STATE.users[purchase.sellerId];
  const score = STATE.scores[purchase.scoreId];

  if (buyer) {
    buyer.points += purchase.price;
    buyer.pointHistory.push({
      amount: purchase.price,
      reason: `환불: ${score ? score.title : purchase.scoreId}`,
      at: nowISO()
    });
  }
  if (seller && seller.sellerInfo) {
    seller.sellerInfo.settleBalance -= purchase.sellerEarning;
  }
  if (score) score.salesCount = Math.max(0, score.salesCount - 1);

  purchase.refunded = true;
  purchase.refundedAt = nowISO();

  save();
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

/* 예전 방식으로 신청만 해둔(아직 "요청" 상태) 출금도 함께 지급한다 */
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

function submitScore(sellerId, data) {
  const scoreId = uid("score");
  const tags = Array.isArray(data.tags)
    ? [...new Set(data.tags.map(t => String(t).trim()).filter(Boolean))].slice(0, 5)
    : [];
  STATE.scores[scoreId] = {
    id: scoreId, sellerId,
    title: data.title, artist: data.artist, instrument: data.instrument, difficulty: data.difficulty,
    price: data.price, isOriginal: !!data.isOriginal, hasVideo: !!data.hasVideo,
    videoUrl: data.videoUrl || null, fileUrl: data.fileUrl || null,
    previewInfo: `첫 ${POLICY.preview.bars}마디 미리보기`,
    status: "등록", rejectReason: null, createdAt: nowISO(), approvedAt: null,
    salesCount: 0, viewCount: 0,
    description: (data.description || "").trim(),
    tags,
    thumbnailUrl: (data.thumbnailUrl || "").trim() || null
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

function submitSongRequest(buyerId, data) {
  const buyer = STATE.users[buyerId];
  if (!buyer) return { ok: false, message: "사용자를 찾을 수 없습니다." };
  const title = (data.title || "").trim();
  const artist = (data.artist || "").trim();
  if (!title || !artist || !INSTRUMENTS.includes(data.instrument)) {
    return { ok: false, message: "곡 제목, 가수, 악기를 모두 입력해주세요." };
  }

  const existing = Object.values(STATE.requests).find(
    r => r.title === title && r.artist === artist && r.instrument === data.instrument && r.status !== "완료"
  );
  if (existing && existing.buyerIds.includes(buyerId)) {
    return { ok: false, message: "이미 신청한 곡입니다." };
  }
  if (buyer.points < POLICY.request.pointCost) return { ok: false, message: "포인트가 부족합니다." };

  buyer.points -= POLICY.request.pointCost;
  buyer.pointHistory.push({ amount: -POLICY.request.pointCost, reason: `신청곡: ${title}`, at: nowISO() });

  if (existing) {
    existing.buyerIds.push(buyerId);
    save();
    return { ok: true, requestId: existing.id, joined: true };
  }

  const requestId = uid("request");
  STATE.requests[requestId] = {
    id: requestId, buyerIds: [buyerId], title, artist,
    instrument: data.instrument, status: "접수", fulfilledScoreId: null
  };
  save();
  return { ok: true, requestId, joined: false };
}

function setRequestStatus(requestId, status) {
  const r = STATE.requests[requestId];
  if (!r) return { ok: false, message: "신청곡을 찾을 수 없습니다." };
  if (!REQUEST_STATUS.includes(status) || status === "완료") return { ok: false, message: "상태 값이 올바르지 않습니다." };
  r.status = status;
  save();
  return { ok: true };
}

/* 신청곡 완료: 연결한 악보를 신청자 전원에게 무료(0P)로 지급한다 */
function fulfillRequest(requestId, scoreId) {
  const r = STATE.requests[requestId];
  const score = STATE.scores[scoreId];
  if (!r || !score) return { ok: false, message: "정보를 찾을 수 없습니다." };
  if (score.status !== "승인") return { ok: false, message: "승인된 악보만 연결할 수 있습니다." };
  if (r.status === "완료") return { ok: false, message: "이미 완료된 신청곡입니다." };
  let given = 0;
  for (const buyerId of r.buyerIds) {
    if (!STATE.users[buyerId] || hasPurchased(buyerId, scoreId)) continue;
    const pid = uid("purchase");
    STATE.purchases[pid] = {
      id: pid, buyerId, scoreId, sellerId: score.sellerId,
      price: 0, commissionRate: calcCommission(score), sellerEarning: 0,
      purchasedAt: nowISO(), downloaded: false, downloadedAt: null,
      refunded: false, refundedAt: null,
      refundDeadline: new Date(Date.now() + POLICY.refund.windowDays * 86400000).toISOString()
    };
    given += 1;
  }
  r.status = "완료";
  r.fulfilledScoreId = scoreId;
  save();
  return { ok: true, given, total: r.buyerIds.length };
}

/* ============================================================
   로그인 / 회원가입 — 이름 + 이메일만 사용 (비밀번호 없음)
   같은 이메일로 반대 역할을 또 선택하면 role 을 "both" 로 승격한다.
   ============================================================ */

function findUserByEmail(email) {
  return Object.values(STATE.users).find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

function updateLoginRoleUI() {
  const title = document.getElementById("login-form-title");
  const switchLink = document.getElementById("role-switch-link");
  if (PENDING_ROLE === "seller") {
    if (title) title.textContent = "아티스트로 시작하기";
    if (switchLink) switchLink.innerHTML = `구매자이신가요? <b>구매자로 시작하기</b>`;
  } else {
    if (title) title.textContent = "구매자로 시작하기";
    if (switchLink) switchLink.innerHTML = `아티스트이신가요? <b>아티스트로 시작하기</b>`;
  }
}

function switchLoginRole() {
  PENDING_ROLE = PENDING_ROLE === "seller" ? "buyer" : "seller";
  updateLoginRoleUI();
  const errorEl = document.getElementById("login-error");
  if (errorEl) errorEl.textContent = "";
}

function resetLoginForm() {
  PENDING_ROLE = "buyer";
  updateLoginRoleUI();
  const nameInput = document.getElementById("login-name");
  const emailInput = document.getElementById("login-email");
  const errorEl = document.getElementById("login-error");
  if (nameInput) nameInput.value = "";
  if (emailInput) emailInput.value = "";
  if (errorEl) errorEl.textContent = "";
}

/* 로그인은 화면을 막지 않는다. 계정이 필요한 버튼을 누르는 순간에만
   이 모달이 뜨고, afterLogin 으로 넘긴 동작은 로그인 직후 이어서 실행된다. */

function openLoginModal(role, afterLogin) {
  PENDING_ROLE = role === "seller" ? "seller" : "buyer";
  AFTER_LOGIN = typeof afterLogin === "function" ? afterLogin : null;
  updateLoginRoleUI();
  const errorEl = document.getElementById("login-error");
  if (errorEl) errorEl.textContent = "";
  document.getElementById("login-modal")?.classList.add("open");
  setTimeout(() => document.getElementById("login-name")?.focus(), 30);
}

function closeLoginModal() {
  document.getElementById("login-modal")?.classList.remove("open");
  resetLoginForm();
}

function submitLogin() {
  const nameInput = document.getElementById("login-name");
  const emailInput = document.getElementById("login-email");
  const errorEl = document.getElementById("login-error");
  const name = nameInput ? nameInput.value.trim() : "";
  const email = emailInput ? emailInput.value.trim() : "";

  if (!name || !email) {
    if (errorEl) errorEl.textContent = "이름과 이메일을 모두 입력해주세요.";
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (errorEl) errorEl.textContent = "이메일 형식을 확인해주세요.";
    return;
  }

  let user = findUserByEmail(email);

  if (user) {
    if (PENDING_ROLE === "seller" && user.role === "buyer") {
      user.role = "both";
      user.sellerInfo = user.sellerInfo || { bankName: "", bankAccount: "", accountHolder: name, settleBalance: 0 };
    }
    if (PENDING_ROLE === "buyer" && user.role === "seller") {
      user.role = "both";
    }
  } else {
    user = makeUser(name, email, PENDING_ROLE);
  }

  save();
  saveSession(user.id);
  CURRENT_USER_ID = user.id;
  const enteringRole = PENDING_ROLE;
  const after = AFTER_LOGIN;
  AFTER_LOGIN = null;
  closeLoginModal();
  if (after) {
    showView("buyer");
    after();
  } else {
    showView(enteringRole === "seller" ? "seller" : "buyer");
  }
}

/* 계정이 필요한 동작 앞에 붙인다. 로그인 안 했으면 모달을 띄우고, 로그인 후 이어서 실행 */
function requireLogin(action) {
  if (getCurrentUser()) { action(); return; }
  openLoginModal("buyer", action);
}

function logout() {
  clearSession();
  CURRENT_USER_ID = null;
  ADMIN_PREVIEW = false;
  if (typeof goBuyer === "function") goBuyer("home");
  showView("buyer");
}

function enterAdminPreview() {
  ADMIN_PREVIEW = true;
  showView("admin");
}

/* 관리자 화면 입장 전에 비밀번호를 확인한다.
   취소를 누르면 아무 일도 일어나지 않고, 틀리면 안내만 뜨고 그대로 남는다. */
function tryEnterAdminPreview() {
  const pw = prompt("관리자 비밀번호를 입력하세요.");
  if (pw === null) return; // 취소
  if (pw !== POLICY.adminPassword) {
    alert("비밀번호가 올바르지 않습니다.");
    return;
  }
  clearSession();
  CURRENT_USER_ID = null;
  enterAdminPreview();
  window.scrollTo({ top: 0 });
}

function getCurrentUser() {
  return STATE.users[CURRENT_USER_ID] || null;
}

/* ---------- 화면 전환 (라우터) ----------
   스토어(buyer)는 누구나 볼 수 있다. 판매자·관리자는 스토어 탭이 같이 보인다.
   탭(nav)은 2개 이상일 때만 보인다. */

function visibleViewsForCurrentUser() {
  if (ADMIN_PREVIEW) return ["buyer", "admin"];
  const user = getCurrentUser();
  if (!user) return ["buyer"];
  if (user.role === "both" || user.role === "seller") return ["buyer", "seller"];
  return ["buyer"];
}

function showView(viewName) {
  CURRENT_VIEW = viewName;
  for (const name of ["buyer", "seller", "admin"]) {
    const el = document.getElementById(`view-${name}`);
    if (el) el.style.display = name === viewName ? "block" : "none";
  }
  renderNav();
  renderAll();
}

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

  if (ADMIN_PREVIEW) {
    bar.innerHTML = `
      <span class="auth-link">관리자 미리보기 중</span>
      <button id="logout-btn" class="auth-btn">나가기</button>
    `;
  } else if (!user) {
    bar.innerHTML = `
      ${cartBtn}
      <button id="header-login-btn" class="auth-btn">로그인</button>
      <button id="header-artist-btn" class="auth-btn auth-btn-primary">아티스트 되기</button>
      <button id="header-admin-btn" class="auth-btn" title="테스트 기간에만 보이는 버튼">관리자</button>
    `;
    document.getElementById("header-login-btn")?.addEventListener("click", () => openLoginModal("buyer"));
    document.getElementById("header-artist-btn")?.addEventListener("click", () => openLoginModal("seller"));
  } else {
    bar.innerHTML = `
      ${cartBtn}
      <button id="header-my-btn" class="icon-btn" aria-label="마이페이지">
        <span class="icon-btn-glyph"><i class="ico ico-user"></i></span><span class="icon-btn-label">${esc(user.name)}님 · ${formatPoint(user.points)}</span>
      </button>
      <button id="logout-btn" class="auth-btn">로그아웃</button>
      <button id="header-admin-btn" class="auth-btn" title="테스트 기간에만 보이는 버튼">관리자</button>
    `;
    document.getElementById("header-my-btn")?.addEventListener("click", () => {
      if (typeof goBuyer === "function") goBuyer("mypage");
    });
  }

  document.getElementById("header-cart-btn")?.addEventListener("click", () => {
    requireLogin(() => { if (typeof goBuyer === "function") goBuyer("cart"); });
  });
  document.getElementById("logout-btn")?.addEventListener("click", logout);
  // 테스트 기간용: 정식 오픈 전에는 관리자 계정 로그인으로 바꿔야 한다
  document.getElementById("header-admin-btn")?.addEventListener("click", tryEnterAdminPreview);
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

function initCommon() {
  load();
  seedIfEmpty();

  updateLoginRoleUI();
  document.getElementById("role-switch-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    switchLoginRole();
  });
  document.getElementById("login-submit")?.addEventListener("click", submitLogin);
  document.getElementById("login-email")?.addEventListener("keydown", (e) => { if (e.key === "Enter") submitLogin(); });
  document.getElementById("login-modal-close")?.addEventListener("click", closeLoginModal);
  document.getElementById("login-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "login-modal") closeLoginModal();
  });
  document.getElementById("admin-preview-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    tryEnterAdminPreview();
  });
  document.getElementById("footer-support-link")?.addEventListener("click", () => {
    if (typeof goBuyer === "function") { showView("buyer"); goBuyer("support"); }
  });

  initHeaderSearch();

  const session = loadSession();
  if (session && STATE.users[session.userId]) {
    CURRENT_USER_ID = session.userId;
  }
  showView("buyer");
}

document.addEventListener("DOMContentLoaded", initCommon);
