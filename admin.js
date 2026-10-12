/* ============================================================
   admin.js — 관리자 화면
   "관리자" 요청일 때 이 파일을 고칩니다 (총괄은 모든 파일 가능).

   위쪽 탭으로 나뉜다:
   운영지표 / 악보 심사 / 정산 지급 / 신청곡 / 회원관리 / 데모 데이터
   ============================================================ */

let ADMIN_REJECT_TARGET_ID = null;
let ADMIN_TAB = "metrics";
let ADMIN_METRIC_DAYS = 30;          // 운영지표 기간: 1(오늘) / 7 / 30 / 0(전체)
let ADMIN_MEMBER_QUERY = "";
let ADMIN_MEMBER_ROLE = "";
let ADMIN_MEMBER_SORT = "recent";
let ADMIN_MEMBER_OPEN = null;        // 펼쳐서 보고 있는 회원 id

const ADMIN_PANEL = "background:var(--card);border:1px solid var(--border);border-radius:16px;padding:18px;margin-bottom:16px;box-shadow:var(--shadow);";

function renderAdmin() {
  const el = document.getElementById("view-admin");
  if (!el) return;

  const pendingReview = Object.values(STATE.scores).filter(s => s.status === "등록" || s.status === "심사중").length;
  const openRequests = Object.values(STATE.requests).filter(r => r.status !== "완료").length;
  const payout = getPayoutBatch();
  const tabs = [
    ["metrics", "운영지표", ""],
    ["review", "악보 심사", pendingReview],
    ["payout", "정산 지급", payout.items.length],
    ["requests", "신청곡", openRequests],
    ["members", "회원관리", ""],
    ["demo", "데모 데이터", ""]
  ];

  el.innerHTML = `
    <div class="chip-row" style="margin-bottom:16px;gap:8px;">
      ${tabs.map(([k, label, n]) => `
        <button class="chip ${ADMIN_TAB === k ? "active" : ""}" data-admin-tab="${k}" style="padding:9px 14px;font-size:13px;">
          ${label}${n ? ` <b style="margin-left:4px;">${n}</b>` : ""}
        </button>`).join("")}
    </div>
    <div id="admin-tab-body"></div>
  `;
  el.querySelectorAll("[data-admin-tab]").forEach(b => b.addEventListener("click", () => {
    ADMIN_TAB = b.dataset.adminTab;
    renderAdmin();
  }));

  const body = document.getElementById("admin-tab-body");

  if (ADMIN_TAB === "review") {
    body.innerHTML = `
      <div style="${ADMIN_PANEL}">
        <h2 style="margin:0 0 4px;font-size:17px;">악보 심사</h2>
        <p style="margin:0 0 12px;font-size:13px;color:var(--muted);">등록되었거나 심사중인 악보를 승인하거나 반려합니다. 반려 시 사유가 판매자에게 전달됩니다.</p>
        <div id="admin-review-msg" style="font-size:13px;margin:0 0 10px;"></div>
        <div id="admin-review-list"></div>
      </div>`;
    renderAdminReviewList();
  } else if (ADMIN_TAB === "payout") {
    body.innerHTML = `
      <div style="${ADMIN_PANEL}">
        <h2 style="margin:0 0 4px;font-size:17px;">이번 달 정산 지급</h2>
        <p style="margin:0 0 12px;font-size:13px;color:var(--muted);line-height:1.6;">
          적립금 ${formatWon(POLICY.settlement.minWithdraw)} 이상 + 계좌가 등록된 판매자가 자동으로 올라와요. 매달 ${POLICY.settlement.payoutDay}일에
          ① 엑셀 받기(또는 표 복사) → ② 은행 기업뱅킹 "대량이체"에 올려 송금 → ③ 전체 지급 완료, 이 순서로 하면 끝이에요.
        </p>
        <div id="admin-withdraw-msg" style="font-size:13px;margin:0 0 10px;"></div>
        <div id="admin-payout-batch"></div>
        <h3 style="margin:18px 0 8px;font-size:14px;">지급 완료 내역 (최근 10건)</h3>
        <div id="admin-withdraw-done"></div>
      </div>`;
    renderAdminPayoutBatch();
  } else if (ADMIN_TAB === "requests") {
    body.innerHTML = `
      <div style="${ADMIN_PANEL}">
        <h2 style="margin:0 0 4px;font-size:17px;">신청곡 관리</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:12px 0 16px;">
          ${[
            ["1", "구매자가 신청", `구매자가 스토어 › 신청곡에서 곡 제목·가수·악기를 적고 ${formatPoint(POLICY.request.pointCost)}를 냅니다. 같은 곡이면 기존 신청에 이름이 더해져 "신청 n명"이 늘어나요.`],
            ["2", "채보 진행", `신청 많은 순으로 위에 보여요. 신청곡을 눌러 열고 "채보중"을 누르세요. 구매자 신청곡 화면에도 상태가 바로 바뀌어 보여요.`],
            ["3", "완성 · 무료 지급", `판매자가 그 곡을 등록하고 심사에서 승인되면, 신청곡을 열어 그 악보를 고르고 "완료 · 무료 지급"을 누르세요. 신청자 전원의 내 악보함에 0P로 들어가요.`]
          ].map(([n, t, d]) => `
            <div style="padding:14px;border-radius:12px;background:var(--band);">
              <div style="font-size:12px;font-weight:800;color:var(--primary);">STEP ${n}</div>
              <div style="font-weight:700;margin:4px 0;">${t}</div>
              <div style="font-size:12px;color:var(--muted);line-height:1.6;">${d}</div>
            </div>`).join("")}
        </div>
        
        <div id="admin-request-msg" style="font-size:13px;margin:0 0 10px;"></div>
        <div id="admin-request-list"></div>
      </div>`;
    renderAdminRequests();
  } else if (ADMIN_TAB === "members") {
    renderAdminMembers(body);
  } else if (ADMIN_TAB === "demo") {
    body.innerHTML = `
      <div style="${ADMIN_PANEL}">
        <h2 style="margin:0 0 4px;font-size:17px;">데모 데이터</h2>
        <p style="margin:0 0 12px;font-size:13px;color:var(--muted);">화면 확인용 예시 악보·구매·충전·후기·신청곡으로 전부 다시 채웁니다. 지금 이 브라우저에 저장된 모든 데이터(가입자, 구매 내역 등)가 지워집니다.</p>
        <button id="admin-reset-demo"
          style="padding:10px 14px;font-size:13px;border:1px solid var(--danger);border-radius:8px;background:#fff;color:var(--danger);cursor:pointer;">
          데모 데이터로 다시 채우기
        </button>
      </div>`;
    const resetBtn = document.getElementById("admin-reset-demo");
    resetBtn?.addEventListener("click", () => {
      if (resetBtn.dataset.confirm !== "1") {
        resetBtn.dataset.confirm = "1";
        resetBtn.textContent = "정말 지울까요? 한 번 더 누르면 초기화됩니다";
        resetBtn.style.background = "var(--danger)";
        resetBtn.style.color = "#fff";
        return;
      }
      resetDemoData();
      ADMIN_TAB = "metrics";
      renderAll();
      if (typeof toast === "function") toast("데모 데이터로 다시 채웠어요");
    });
  } else {
    renderAdminMetrics(body);
  }
}

/* ============================================================
   운영지표
   ============================================================ */

function inPeriod(iso, days) {
  if (!days) return true;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return new Date(iso) >= start;
}

function adminMetrics(days) {
  const sales = Object.values(STATE.purchases).filter(p => !p.refunded && p.price > 0 && inPeriod(p.purchasedAt, days));
  const refunds = Object.values(STATE.purchases).filter(p => p.refunded && p.refundedAt && inPeriod(p.refundedAt, days));
  const charges = Object.values(STATE.charges).filter(c => inPeriod(c.chargedAt, days));
  const signups = Object.values(STATE.users).filter(u => inPeriod(u.createdAt, days));
  const revenue = sales.reduce((s, p) => s + p.price, 0);
  const fee = sales.reduce((s, p) => s + (p.price - p.sellerEarning), 0);
  return {
    sales, revenue, fee,
    sellerShare: revenue - fee,
    chargeWon: charges.reduce((s, c) => s + c.amount, 0),
    chargeCount: charges.length,
    signups: signups.length,
    newSellers: signups.filter(u => u.sellerInfo).length,
    refundCount: refunds.length,
    refundP: refunds.reduce((s, p) => s + p.price, 0),
    pointsOutstanding: Object.values(STATE.users).reduce((s, u) => s + (u.points || 0), 0),
    pendingReview: Object.values(STATE.scores).filter(s => s.status === "등록" || s.status === "심사중").length,
    openRequests: Object.values(STATE.requests).filter(r => r.status !== "완료").length
  };
}

function statTile(label, value, sub) {
  return `
    <div style="padding:14px;border-radius:14px;background:var(--card);border:1px solid var(--border);min-width:0;">
      <div style="font-size:12px;color:var(--muted);">${label}</div>
      <div style="font-size:20px;font-weight:800;margin-top:4px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${value}</div>
      ${sub ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">${sub}</div>` : ""}
    </div>`;
}
function renderAdminMetrics(body) {
  const days = ADMIN_METRIC_DAYS;
  const m = adminMetrics(days);
  const payout = getPayoutBatch();
  const periodLabel = { 1: "오늘", 7: "최근 7일", 30: "최근 30일", 0: "전체 기간" }[days];

  // 일별 매출 (최근 14일 또는 30일)
  const span = days === 7 || days === 1 ? 14 : 30;
  const daily = [];
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const list = Object.values(STATE.purchases).filter(p => !p.refunded && p.price > 0 && new Date(p.purchasedAt) >= d && new Date(p.purchasedAt) < next);
    daily.push({ d, total: list.reduce((s, p) => s + p.price, 0), count: list.length });
  }
  const maxDaily = Math.max(1, ...daily.map(x => x.total));

  // 많이 팔린 악보 · 판매자 · 악기별
  const byScore = {}, bySeller = {}, byInst = {};
  for (const p of m.sales) {
    byScore[p.scoreId] = (byScore[p.scoreId] || 0) + 1;
    bySeller[p.sellerId] = (bySeller[p.sellerId] || 0) + p.price;
    const s = STATE.scores[p.scoreId];
    if (s) byInst[s.instrument] = (byInst[s.instrument] || 0) + p.price;
  }
  const topScores = Object.entries(byScore).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topSellers = Object.entries(bySeller).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const instRows = INSTRUMENTS.map(i => [i, byInst[i] || 0]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  const maxInst = Math.max(1, ...instRows.map(x => x[1]));

  const W = 600, H = 160, gap = 2, bw = (W - gap * (daily.length - 1)) / daily.length;
  const bars = daily.map((x, i) => {
    const h = x.total ? Math.max(4, (x.total / maxDaily) * (H - 8)) : 0;
    const label = `${x.d.getMonth() + 1}/${x.d.getDate()} · ${formatPoint(x.total)} · ${x.count}건`;
    return `<g class="adm-bar">
      <rect x="${(i * (bw + gap)).toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${H}" fill="transparent"><title>${label}</title></rect>
      ${h ? `<path d="M${(i * (bw + gap)).toFixed(1)} ${H} V${(H - h + 4).toFixed(1)} q0 -4 4 -4 h${(bw - 8).toFixed(1)} q4 0 4 4 V${H} Z" fill="var(--primary)"><title>${label}</title></path>` : ""}
    </g>`;
  }).join("");

  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
      <h2 style="margin:0;font-size:19px;">운영지표 <span style="font-size:13px;color:var(--muted);font-weight:500;">${periodLabel}</span></h2>
      <div class="chip-row">
        ${[[1, "오늘"], [7, "7일"], [30, "30일"], [0, "전체"]].map(([d, l]) => `<button class="chip ${days === d ? "active" : ""}" data-metric-days="${d}">${l}</button>`).join("")}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;">
      ${statTile("악보 매출", formatPoint(m.revenue), `${m.sales.length}건 판매`)}
      ${statTile("플랫폼 수수료 수익", formatWon(m.fee), `판매자 몫 ${formatWon(m.sellerShare)}`)}
      ${statTile("포인트 충전", formatWon(m.chargeWon), `${m.chargeCount}건`)}
      ${statTile("신규 가입", `${m.signups}명`, `그중 판매자 ${m.newSellers}명`)}
      ${statTile("환불", `${m.refundCount}건`, formatPoint(m.refundP))}
      ${statTile("회원 보유 포인트", formatPoint(m.pointsOutstanding), "아직 안 쓴 포인트 합계")}
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;">
      ${[
        ["review", `심사 대기 ${m.pendingReview}건`, m.pendingReview],
        ["payout", `이번 달 지급 대상 ${payout.items.length}명 · ${formatWon(payout.total)}`, payout.items.length],
        ["requests", `진행 중 신청곡 ${m.openRequests}건`, m.openRequests]
      ].map(([tab, text, n]) => `
        <button data-goto-tab="${tab}" style="padding:9px 12px;border-radius:999px;border:1px solid ${n ? "#ffd9c7" : "var(--border)"};background:${n ? "#fff6f1" : "var(--card)"};font-size:12px;cursor:pointer;color:var(--text);">
          ${n ? "● " : ""}${text} ›
        </button>`).join("")}
    </div>

    <div style="${ADMIN_PANEL}margin-top:16px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;">
        <h3 style="margin:0;font-size:15px;">일별 악보 매출 (최근 ${span}일)</h3>
        <span style="font-size:12px;color:var(--muted);">막대에 마우스를 올리면 날짜·금액·건수가 보여요</span>
      </div>
      <div style="margin-top:12px;position:relative;">
        <svg viewBox="0 0 ${W} ${H + 20}" style="width:100%;height:auto;display:block;" role="img" aria-label="일별 악보 매출 막대 그래프">
          <line x1="0" x2="${W}" y1="${H}" y2="${H}" stroke="var(--border)" stroke-width="1"/>
          ${bars}
          <text x="0" y="${H + 15}" font-size="11" fill="var(--muted)">${daily[0].d.getMonth() + 1}/${daily[0].d.getDate()}</text>
          <text x="${W}" y="${H + 15}" font-size="11" fill="var(--muted)" text-anchor="end">오늘</text>
        </svg>
        <div style="font-size:12px;color:var(--muted);margin-top:4px;">가장 많이 판 날: ${(() => { const best = daily.reduce((a, b) => b.total > a.total ? b : a, daily[0]); return best.total ? `${best.d.getMonth() + 1}/${best.d.getDate()} · ${formatPoint(best.total)}` : "아직 없음"; })()}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;">
      <div style="${ADMIN_PANEL}">
        <h3 style="margin:0 0 10px;font-size:15px;">많이 팔린 악보</h3>
        ${topScores.length ? topScores.map(([id, n], i) => {
          const s = STATE.scores[id];
          return `<div style="display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-top:${i ? "1px solid var(--border)" : "none"};font-size:13px;">
            <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${i + 1}. ${esc(s ? s.title : "삭제된 악보")}</span>
            <b style="white-space:nowrap;">${n}건</b></div>`;
        }).join("") : `<p style="margin:0;font-size:13px;color:var(--muted);">이 기간에 판매가 없어요.</p>`}
      </div>
      <div style="${ADMIN_PANEL}">
        <h3 style="margin:0 0 10px;font-size:15px;">매출 많은 판매자</h3>
        ${topSellers.length ? topSellers.map(([id, total], i) => {
          const u = STATE.users[id];
          return `<div style="display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-top:${i ? "1px solid var(--border)" : "none"};font-size:13px;">
            <span>${i + 1}. ${esc(u ? u.name : "탈퇴 회원")}</span><b style="white-space:nowrap;">${formatPoint(total)}</b></div>`;
        }).join("") : `<p style="margin:0;font-size:13px;color:var(--muted);">이 기간에 판매가 없어요.</p>`}
      </div>
      <div style="${ADMIN_PANEL}">
        <h3 style="margin:0 0 10px;font-size:15px;">악기별 매출</h3>
        ${instRows.length ? instRows.map(([inst, total]) => `
          <div style="margin:8px 0;" title="${esc(inst)} ${formatPoint(total)}">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;"><span>${esc(inst)}</span><span style="color:var(--muted);">${formatPoint(total)} · ${Math.round(total / Math.max(1, m.revenue) * 100)}%</span></div>
            <div style="height:8px;border-radius:4px;background:var(--band);"><div style="height:8px;border-radius:4px;background:var(--primary);width:${(total / maxInst * 100).toFixed(1)}%;"></div></div>
          </div>`).join("") : `<p style="margin:0;font-size:13px;color:var(--muted);">이 기간에 판매가 없어요.</p>`}
      </div>
    </div>
    <p style="font-size:11px;color:var(--muted);margin:0;">지금 숫자는 이 브라우저에 저장된 데이터 기준이에요. 공용 서버를 연결하면 전체 회원 기준으로 바뀝니다.</p>
  `;

  body.querySelectorAll("[data-metric-days]").forEach(b => b.addEventListener("click", () => {
    ADMIN_METRIC_DAYS = Number(b.dataset.metricDays);
    renderAdmin();
  }));
  body.querySelectorAll("[data-goto-tab]").forEach(b => b.addEventListener("click", () => {
    ADMIN_TAB = b.dataset.gotoTab;
    renderAdmin();
  }));
}

/* ============================================================
   회원관리
   ============================================================ */

function memberSummary(u) {
  const bought = Object.values(STATE.purchases).filter(p => p.buyerId === u.id && !p.refunded);
  const spent = bought.reduce((s, p) => s + p.price, 0);
  const charged = Object.values(STATE.charges).filter(c => c.userId === u.id).reduce((s, c) => s + c.amount, 0);
  const st = u.sellerInfo ? getSellerStats(u.id) : null;
  return { boughtCount: bought.length, spent, charged, st };
}

function roleLabelOf(role) {
  return role === "both" ? "구매자·판매자" : role === "seller" ? "판매자" : "구매자";
}

function renderAdminMembers(body) {
  const q = ADMIN_MEMBER_QUERY.trim().toLowerCase();
  let list = Object.values(STATE.users);
  if (q) list = list.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  if (ADMIN_MEMBER_ROLE === "seller") list = list.filter(u => u.role === "seller" || u.role === "both");
  else if (ADMIN_MEMBER_ROLE === "buyer") list = list.filter(u => u.role === "buyer" || u.role === "both");
  const rows = list.map(u => ({ u, sum: memberSummary(u) }));
  if (ADMIN_MEMBER_SORT === "points") rows.sort((a, b) => b.u.points - a.u.points);
  else if (ADMIN_MEMBER_SORT === "spent") rows.sort((a, b) => b.sum.spent - a.sum.spent);
  else if (ADMIN_MEMBER_SORT === "sales") rows.sort((a, b) => (b.sum.st ? b.sum.st.sales : -1) - (a.sum.st ? a.sum.st.sales : -1));
  else rows.sort((a, b) => new Date(b.u.createdAt) - new Date(a.u.createdAt));

  const all = Object.values(STATE.users);
  body.innerHTML = `
    <div style="${ADMIN_PANEL}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <h2 style="margin:0;font-size:17px;">회원관리</h2>
        <span style="font-size:12px;color:var(--muted);">전체 ${all.length}명 · 판매자 ${all.filter(u => u.sellerInfo).length}명</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <input id="mem-q" class="field" style="flex:1;min-width:180px;" placeholder="이름 또는 이메일 검색" value="${esc(ADMIN_MEMBER_QUERY)}">
        <select id="mem-sort" class="field" style="width:auto;">
          ${[["recent", "가입 최신순"], ["points", "보유 포인트순"], ["spent", "구매 금액순"], ["sales", "판매 건수순"]].map(([v, l]) => `<option value="${v}" ${ADMIN_MEMBER_SORT === v ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </div>
      <div class="chip-row" style="margin-bottom:12px;">
        ${[["", "전체"], ["buyer", "구매자"], ["seller", "판매자"]].map(([v, l]) => `<button class="chip ${ADMIN_MEMBER_ROLE === v ? "active" : ""}" data-mem-role="${v}">${l}</button>`).join("")}
      </div>
      <div id="admin-member-msg" style="font-size:13px;margin:0 0 8px;"></div>
      ${rows.length ? rows.map(({ u, sum }) => memberRowHTML(u, sum)).join("") : `<p style="margin:0;font-size:13px;color:var(--muted);">조건에 맞는 회원이 없어요.</p>`}
    </div>
  `;

  const qInput = document.getElementById("mem-q");
  qInput?.addEventListener("input", () => {
    ADMIN_MEMBER_QUERY = qInput.value;
    const pos = qInput.selectionStart;
    renderAdmin();
    const again = document.getElementById("mem-q");
    if (again) { again.focus(); again.setSelectionRange(pos, pos); }
  });
  document.getElementById("mem-sort")?.addEventListener("change", (e) => { ADMIN_MEMBER_SORT = e.target.value; renderAdmin(); });
  body.querySelectorAll("[data-mem-role]").forEach(b => b.addEventListener("click", () => { ADMIN_MEMBER_ROLE = b.dataset.memRole; renderAdmin(); }));
  body.querySelectorAll("[data-mem-open]").forEach(b => b.addEventListener("click", () => {
    ADMIN_MEMBER_OPEN = ADMIN_MEMBER_OPEN === b.dataset.memOpen ? null : b.dataset.memOpen;
    renderAdmin();
  }));
  body.querySelectorAll("[data-mem-adjust]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.memAdjust;
    const amount = Number(document.getElementById(`adj-amt-${id}`).value);
    const reason = document.getElementById(`adj-reason-${id}`).value;
    const res = adjustPoints(id, amount, reason);
    if (!res.ok) { showAdminMsg("admin-member-msg", res.message, true); return; }
    renderAll();
    showAdminMsg("admin-member-msg", `${STATE.users[id].name}님 포인트를 ${amount > 0 ? "+" : ""}${formatPoint(amount)} 조정했어요.`, false);
  }));
}
function memberRowHTML(u, sum) {
  const open = ADMIN_MEMBER_OPEN === u.id;
  const roleColor = u.sellerInfo ? "background:#eef1ff;color:#3d56d6;" : "background:var(--primary-soft);color:var(--primary);";
  let detail = "";
  if (open) {
    const history = [...u.pointHistory].reverse().slice(0, 8);
    const purchases = Object.values(STATE.purchases).filter(p => p.buyerId === u.id).sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt)).slice(0, 8);
    const myScores = u.sellerInfo ? Object.values(STATE.scores).filter(s => s.sellerId === u.id) : [];
    detail = `
      <div style="margin-top:10px;padding:14px;border-radius:12px;background:var(--band);display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;font-size:12px;">
        <div>
          <div style="font-weight:700;margin-bottom:6px;">포인트 내역 (최근 8건)</div>
          ${history.length ? history.map(h => `<div style="display:flex;justify-content:space-between;gap:6px;padding:3px 0;"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${formatDate(h.at)} ${esc(h.reason)}</span><b style="white-space:nowrap;">${h.amount >= 0 ? "+" : ""}${formatPoint(h.amount)}</b></div>`).join("") : `<span style="color:var(--muted);">없음</span>`}
        </div>
        <div>
          <div style="font-weight:700;margin-bottom:6px;">구매 내역 (최근 8건)</div>
          ${purchases.length ? purchases.map(p => { const s = STATE.scores[p.scoreId]; return `<div style="display:flex;justify-content:space-between;gap:6px;padding:3px 0;"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${formatDate(p.purchasedAt)} ${esc(s ? s.title : "삭제된 악보")}</span><span style="white-space:nowrap;color:${p.refunded ? "var(--danger)" : "var(--text)"};">${p.refunded ? "환불" : p.price === 0 ? "무료" : formatPoint(p.price)}${p.downloaded ? " · 받음" : ""}</span></div>`; }).join("") : `<span style="color:var(--muted);">없음</span>`}
        </div>
        ${u.sellerInfo ? `
          <div>
            <div style="font-weight:700;margin-bottom:6px;">판매자 정보</div>
            <div style="padding:3px 0;">등록 악보 ${myScores.length}개 (승인 ${myScores.filter(s => s.status === "승인").length})</div>
            <div style="padding:3px 0;">적립금 ${formatWon(u.sellerInfo.settleBalance)}</div>
            <div style="padding:3px 0;">계좌 ${hasBankInfo(u) ? `${esc(u.sellerInfo.bankName)} ${esc(u.sellerInfo.bankAccount)} (${esc(u.sellerInfo.accountHolder)})` : `<span style="color:var(--danger);">미등록</span>`}</div>
          </div>` : ""}
        <div>
          <div style="font-weight:700;margin-bottom:6px;">포인트 수동 조정</div>
          <div style="color:var(--muted);margin-bottom:6px;">고객 문의 보상·오류 정정용. 사유는 회원 포인트 내역에 그대로 남아요.</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <input id="adj-amt-${u.id}" class="field" type="number" step="100" placeholder="예: 1000 또는 -1000" style="width:150px;">
            <input id="adj-reason-${u.id}" class="field" placeholder="사유 (필수)" style="flex:1;min-width:120px;">
            <button data-mem-adjust="${u.id}" class="btn btn-small btn-primary">적용</button>
          </div>
        </div>
      </div>`;
  }
  return `
    <div style="padding:12px 0;border-top:1px solid var(--border);">
      <button data-mem-open="${u.id}" style="all:unset;cursor:pointer;display:flex;align-items:center;gap:10px;width:100%;">
        <span class="avatar" style="width:36px;height:36px;font-size:13px;${typeof avatarStyle === "function" ? avatarStyle(u.name) : ""}">${esc(String(u.name).replace(/^데모\s*/, "").slice(0, 1))}</span>
        <span style="flex:1;min-width:0;">
          <span style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <b style="font-size:14px;">${esc(u.name)}</b>
            <span style="font-size:10px;padding:2px 8px;border-radius:999px;font-weight:700;${roleColor}">${roleLabelOf(u.role)}</span>
          </span>
          <span style="display:block;font-size:12px;color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${esc(u.email)} · 가입 ${formatDate(u.createdAt)} · 보유 ${formatPoint(u.points)} · 구매 ${sum.boughtCount}건${sum.st ? ` · 판매 ${sum.st.sales}건` : ""}
          </span>
        </span>
        <span style="font-size:12px;color:var(--muted);">${open ? "접기 ▲" : "자세히 ▼"}</span>
      </button>
      ${detail}
    </div>`;
}

/* ---------- 신청곡 관리 ---------- */

let ADMIN_REQ_FILTER = "";      // "" | 접수 | 채보중 | 완료
let ADMIN_REQ_OPEN = null;      // 펼쳐 보고 있는 신청곡 id
let ADMIN_REQ_PICK = null;      // 완료 처리용으로 고른 악보 id
let ADMIN_REQ_SEARCH = "";

function renderAdminRequests() {
  const listEl = document.getElementById("admin-request-list");
  if (!listEl) return;

  const all = Object.values(STATE.requests);
  const count = (st) => all.filter(r => r.status === st).length;
  const people = all.reduce((sum, r) => sum + r.buyerIds.length, 0);

  let list = ADMIN_REQ_FILTER ? all.filter(r => r.status === ADMIN_REQ_FILTER) : all;
  list = list.sort((a, b) => (a.status === "완료") - (b.status === "완료") || b.buyerIds.length - a.buyerIds.length);

  const stepper = (status) => {
    const idx = REQUEST_STATUS.indexOf(status);
    return `<span style="display:inline-flex;align-items:center;gap:4px;" aria-label="진행 단계 ${idx + 1}/3">
      ${REQUEST_STATUS.map((st, i) => `
        <span style="width:${i === idx ? 22 : 8}px;height:8px;border-radius:4px;background:${i <= idx ? "var(--primary)" : "var(--border)"};"></span>`).join("")}
    </span>`;
  };

  listEl.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:12px;">
      ${[["접수", count("접수")], ["채보중", count("채보중")], ["완료", count("완료")], ["신청한 사람(누적)", `${people}명`]].map(([l, v]) => `
        <div style="padding:12px;border-radius:12px;background:var(--band);">
          <div style="font-size:11px;color:var(--muted);">${l}</div>
          <div style="font-size:18px;font-weight:800;margin-top:2px;">${v}</div>
        </div>`).join("")}
    </div>

    <div class="chip-row" style="margin-bottom:12px;">
      ${[["", `전체 ${all.length}`], ...REQUEST_STATUS.map(st => [st, `${st} ${count(st)}`])].map(([v, l]) =>
        `<button class="chip ${ADMIN_REQ_FILTER === v ? "active" : ""}" data-req-filter="${v}">${l}</button>`).join("")}
    </div>

    ${list.length === 0 ? `<p style="font-size:13px;color:var(--muted);margin:0;">해당하는 신청곡이 없습니다.</p>` : list.map((r, i) => {
      const open = ADMIN_REQ_OPEN === r.id;
      const linked = r.fulfilledScoreId && STATE.scores[r.fulfilledScoreId];
      return `
        <div style="border:1px solid ${open ? "var(--primary)" : "var(--border)"};border-radius:14px;margin-bottom:10px;overflow:hidden;background:var(--card);">
          <button data-req-open="${r.id}" style="all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:12px;width:100%;padding:14px;">
            <span style="width:44px;text-align:center;flex-shrink:0;">
              <b style="display:block;font-size:18px;">${r.buyerIds.length}</b>
              <span style="font-size:10px;color:var(--muted);">명 신청</span>
            </span>
            <span style="flex:1;min-width:0;">
              <b style="display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.title)}</b>
              <span style="display:block;font-size:12px;color:var(--muted);margin-top:2px;">${esc(r.artist)} · ${esc(r.instrument)}${linked ? ` · 연결: ${esc(linked.title)}` : ""}</span>
              <span style="display:flex;align-items:center;gap:8px;margin-top:6px;">
                ${stepper(r.status)}
                <span class="status-pill st-${esc(r.status)}">${esc(r.status)}</span>
              </span>
            </span>
            <span style="font-size:12px;color:var(--muted);flex-shrink:0;">${open ? "접기 ▲" : "열기 ▼"}</span>
          </button>
          ${open ? requestDetailHTML(r) : ""}
        </div>`;
    }).join("")}
  `;

  listEl.querySelectorAll("[data-req-filter]").forEach(b => b.addEventListener("click", () => {
    ADMIN_REQ_FILTER = b.dataset.reqFilter;
    renderAdminRequests();
  }));
  listEl.querySelectorAll("[data-req-open]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.reqOpen;
    ADMIN_REQ_OPEN = ADMIN_REQ_OPEN === id ? null : id;
    ADMIN_REQ_PICK = null;
    ADMIN_REQ_SEARCH = "";
    renderAdminRequests();
  }));
  listEl.querySelectorAll("[data-req-status]").forEach(b => b.addEventListener("click", () => {
    const res = setRequestStatus(ADMIN_REQ_OPEN, b.dataset.reqStatus);
    if (!res.ok) { showAdminMsg("admin-request-msg", res.message, true); return; }
    renderAll();
    showAdminMsg("admin-request-msg", `"${STATE.requests[ADMIN_REQ_OPEN].title}" 상태를 ${b.dataset.reqStatus}(으)로 바꿨어요. 구매자 신청곡 화면에도 바로 보여요.`, false);
  }));
  listEl.querySelectorAll("[data-req-pick]").forEach(b => b.addEventListener("click", () => {
    ADMIN_REQ_PICK = ADMIN_REQ_PICK === b.dataset.reqPick ? null : b.dataset.reqPick;
    renderAdminRequests();
  }));
  const search = document.getElementById("req-score-search");
  search?.addEventListener("input", () => {
    ADMIN_REQ_SEARCH = search.value;
    const pos = search.selectionStart;
    renderAdminRequests();
    const again = document.getElementById("req-score-search");
    if (again) { again.focus(); again.setSelectionRange(pos, pos); }
  });
  document.getElementById("req-fulfill")?.addEventListener("click", () => {
    if (!ADMIN_REQ_PICK) { showAdminMsg("admin-request-msg", "완성된 악보를 먼저 골라주세요.", true); return; }
    const res = fulfillRequest(ADMIN_REQ_OPEN, ADMIN_REQ_PICK);
    if (!res.ok) { showAdminMsg("admin-request-msg", res.message, true); return; }
    const skipped = res.total - res.given;
    ADMIN_REQ_PICK = null;
    renderAll();
    showAdminMsg("admin-request-msg",
      `완료 처리했어요. 신청자 ${res.given}명의 내 악보함에 무료로 넣었어요.${skipped > 0 ? ` (이미 그 악보를 가진 ${skipped}명은 제외)` : ""}`, false);
  });
  listEl.querySelectorAll("[data-req-view]").forEach(b => b.addEventListener("click", () => {
    if (typeof goBuyer === "function") goBuyer("detail", { id: b.dataset.reqView });
  }));
}
function requestDetailHTML(r) {
  const requesters = r.buyerIds.map(id => STATE.users[id]).filter(Boolean);
  const box = "padding:14px;border-radius:12px;background:var(--band);";
  const requesterList = `
    <div style="${box}">
      <div style="font-weight:700;font-size:13px;margin-bottom:8px;">신청한 사람 ${requesters.length}명 <span style="font-weight:400;color:var(--muted);">· 받은 신청금 ${formatPoint(requesters.length * POLICY.request.pointCost)}</span></div>
      ${requesters.length ? requesters.map(u => {
        const got = r.fulfilledScoreId && Object.values(STATE.purchases).some(p => p.buyerId === u.id && p.scoreId === r.fulfilledScoreId && !p.refunded);
        return `<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;font-size:12px;border-top:1px solid var(--border);">
          <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><b>${esc(u.name)}</b> <span style="color:var(--muted);">${esc(u.email)}</span></span>
          ${r.status === "완료" ? `<span style="white-space:nowrap;color:${got ? "var(--primary)" : "var(--muted)"};">${got ? "✓ 악보 받음" : "-"}</span>` : ""}
        </div>`;
      }).join("") : `<span style="font-size:12px;color:var(--muted);">신청자 정보가 없어요.</span>`}
    </div>`;

  if (r.status === "완료") {
    const s = STATE.scores[r.fulfilledScoreId];
    return `
      <div style="padding:0 14px 14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;">
        <div style="${box}">
          <div style="font-weight:700;font-size:13px;margin-bottom:8px;">✓ 완료된 신청곡</div>
          ${s ? `
            <div style="font-size:13px;"><b>${esc(s.title)}</b></div>
            <div style="font-size:12px;color:var(--muted);margin:2px 0 10px;">${esc(sellerNameOf(s.sellerId))} · ${esc(s.instrument)} · ${esc(s.difficulty)} · ${formatPoint(s.price)}</div>
            <button data-req-view="${s.id}" class="btn btn-small">스토어에서 악보 보기</button>`
          : `<div style="font-size:12px;color:var(--muted);">연결된 악보가 삭제됐어요.</div>`}
        </div>
        ${requesterList}
      </div>`;
  }

  const q = ADMIN_REQ_SEARCH.trim().toLowerCase();
  let candidates = Object.values(STATE.scores)
    .filter(s => s.status === "승인" && s.instrument === r.instrument)
    .sort((a, b) => new Date(b.approvedAt || b.createdAt) - new Date(a.approvedAt || a.createdAt));
  if (q) candidates = candidates.filter(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q) || sellerNameOf(s.sellerId).toLowerCase().includes(q));

  return `
    <div style="padding:0 14px 14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;">
      <div style="${box}">
        <div style="font-weight:700;font-size:13px;margin-bottom:8px;">① 진행 상태 바꾸기</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${["접수", "채보중"].map(st => `
            <button data-req-status="${st}" class="btn btn-small ${r.status === st ? "btn-primary" : ""}" ${r.status === st ? "disabled" : ""}>${r.status === st ? "✓ " : ""}${st}</button>`).join("")}
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:8px;line-height:1.5;">채보를 시작하면 "채보중"으로 바꿔주세요. 완료는 아래 ②에서 악보를 연결하면 돼요.</div>
      </div>
      ${requesterList}
      <div style="${box}grid-column:1/-1;">
        <div style="font-weight:700;font-size:13px;margin-bottom:4px;">② 완성된 악보 연결하고 완료하기</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px;">스토어에 승인된 ${esc(r.instrument)} 악보 중에서 고르세요. 아직 없으면 판매자 등록 → 악보 심사 승인 후 다시 오세요.</div>
        <input id="req-score-search" class="field" placeholder="악보 제목·가수·판매자로 찾기" value="${esc(ADMIN_REQ_SEARCH)}" style="margin-bottom:8px;">
        <div style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:10px;background:var(--card);">
          ${candidates.length ? candidates.map(s => {
            const on = ADMIN_REQ_PICK === s.id;
            return `<button data-req-pick="${s.id}" style="all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border-bottom:1px solid var(--border);background:${on ? "var(--primary-soft)" : "transparent"};">
              <span style="width:18px;height:18px;border-radius:50%;border:2px solid ${on ? "var(--primary)" : "var(--border)"};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">${on ? `<span style="width:8px;height:8px;border-radius:50%;background:var(--primary);"></span>` : ""}</span>
              <span style="flex:1;min-width:0;">
                <b style="display:block;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.title)}</b>
                <span style="display:block;font-size:11px;color:var(--muted);">${esc(s.artist)} · ${esc(sellerNameOf(s.sellerId))} · ${esc(s.difficulty)} · 승인 ${formatDate(s.approvedAt || s.createdAt)}</span>
              </span>
            </button>`;
          }).join("") : `<div style="padding:14px;font-size:12px;color:var(--muted);">${q ? "검색 결과가 없어요." : `승인된 ${esc(r.instrument)} 악보가 아직 없어요.`}</div>`}
        </div>
        <button id="req-fulfill" class="btn btn-primary" style="width:100%;margin-top:10px;" ${ADMIN_REQ_PICK ? "" : "disabled"}>
          ${ADMIN_REQ_PICK ? `선택한 악보로 완료 · 신청자 ${r.buyerIds.length}명에게 무료 지급` : "위에서 악보를 먼저 골라주세요"}
        </button>
      </div>
    </div>`;
}

function sellerNameOf(id) {
  const u = STATE.users[id];
  return u ? u.name : "알 수 없음";
}

function showAdminMsg(elId, text, isError) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? "var(--danger)" : "var(--primary)";
}

/* ---------- 악보 심사 ---------- */

function renderAdminReviewList() {
  const listEl = document.getElementById("admin-review-list");
  if (!listEl) return;

  const pending = Object.values(STATE.scores)
    .filter(s => s.status === "등록" || s.status === "심사중")
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (pending.length === 0) {
    listEl.innerHTML = `<p style="font-size:13px;color:var(--muted);margin:0;">심사 대기 중인 악보가 없습니다.</p>`;
    return;
  }

  listEl.innerHTML = pending.map(s => {
    const seller = STATE.users[s.sellerId];
    const videoBadge = s.hasVideo
      ? `<span style="display:inline-block;margin-left:6px;padding:2px 6px;border-radius:5px;background:#eef4f0;color:var(--primary);font-size:11px;">🎬 영상</span>`
      : "";
    const originalBadge = s.isOriginal
      ? `<span style="display:inline-block;margin-left:6px;padding:2px 6px;border-radius:5px;background:#f3f0e8;color:#a3792f;font-size:11px;">오리지널</span>`
      : "";
    const isRejecting = ADMIN_REJECT_TARGET_ID === s.id;

    return `
      <div style="padding:12px 0;border-top:1px solid var(--border);">
        <div style="font-size:14px;font-weight:600;">${esc(s.title)}${videoBadge}${originalBadge}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px;">
          ${esc(s.artist)} · ${esc(s.instrument)} · ${esc(s.difficulty)} · ${formatPoint(s.price)}
          · 판매자 ${esc(seller ? seller.name : s.sellerId)} · 등록일 ${formatDate(s.createdAt)}
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button data-approve-id="${s.id}"
            style="flex:1;padding:9px;font-size:13px;border:none;border-radius:8px;background:var(--primary);color:#fff;cursor:pointer;">
            승인
          </button>
          <button data-reject-id="${s.id}"
            style="flex:1;padding:9px;font-size:13px;border:1px solid var(--danger);border-radius:8px;background:#fff;color:var(--danger);cursor:pointer;">
            반려
          </button>
        </div>
        ${isRejecting ? `
          <div style="margin-top:8px;">
            <input type="text" id="admin-reject-reason" placeholder="반려 사유를 입력하세요"
              style="width:100%;padding:9px;border:1px solid var(--border);border-radius:8px;font-size:13px;">
            <div style="display:flex;gap:8px;margin-top:6px;">
              <button id="admin-reject-confirm"
                style="flex:1;padding:9px;font-size:13px;border:none;border-radius:8px;background:var(--danger);color:#fff;cursor:pointer;">
                반려 확정
              </button>
              <button id="admin-reject-cancel"
                style="flex:1;padding:9px;font-size:13px;border:1px solid var(--border);border-radius:8px;background:var(--bg);cursor:pointer;">
                취소
              </button>
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }).join("");

  listEl.querySelectorAll("[data-approve-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const result = approveScore(btn.dataset.approveId);
      if (!result.ok) {
        showAdminMsg("admin-review-msg", result.message || "승인에 실패했습니다.", true);
        return;
      }
      renderAll();
      showAdminMsg("admin-review-msg", "승인되었습니다. 바로 구매자 목록에 노출됩니다.", false);
    });
  });

  listEl.querySelectorAll("[data-reject-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      ADMIN_REJECT_TARGET_ID = btn.dataset.rejectId;
      renderAdminReviewList();
    });
  });

  const confirmBtn = document.getElementById("admin-reject-confirm");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", () => {
      const reasonInput = document.getElementById("admin-reject-reason");
      const reason = reasonInput ? reasonInput.value.trim() : "";
      if (!reason) {
        showAdminMsg("admin-review-msg", "반려 사유를 입력해주세요.", true);
        return;
      }
      const result = rejectScore(ADMIN_REJECT_TARGET_ID, reason);
      ADMIN_REJECT_TARGET_ID = null;
      if (!result.ok) {
        showAdminMsg("admin-review-msg", result.message || "반려에 실패했습니다.", true);
        return;
      }
      renderAll();
      showAdminMsg("admin-review-msg", "반려되었습니다. 판매자에게 사유가 전달됩니다.", false);
    });
  }

  const cancelBtn = document.getElementById("admin-reject-cancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      ADMIN_REJECT_TARGET_ID = null;
      renderAdminReviewList();
    });
  }
}
/* ---------- 이번 달 정산 지급 ---------- */

function renderAdminPayoutBatch() {
  const wrap = document.getElementById("admin-payout-batch");
  const doneEl = document.getElementById("admin-withdraw-done");
  if (!wrap || !doneEl) return;

  const batch = getPayoutBatch();
  const d = nextPayoutDate();
  const dateText = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;

  if (batch.items.length === 0) {
    wrap.innerHTML = `<p style="font-size:13px;color:var(--muted);margin:0 0 8px;">다음 지급일(${dateText})에 지급할 판매자가 아직 없어요.</p>`;
  } else {
    wrap.innerHTML = `
      <div style="padding:12px;border-radius:10px;background:#eef4f0;margin-bottom:10px;font-size:13px;">
        다음 지급일 <b>${dateText}</b> · 대상 <b>${batch.items.length}명</b> · 합계 <b>${formatWon(batch.total)}</b>
      </div>
      <div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#fafbfa;color:var(--muted);text-align:left;">
            <th style="padding:8px 10px;font-weight:600;">판매자</th>
            <th style="padding:8px 10px;font-weight:600;">은행 · 계좌</th>
            <th style="padding:8px 10px;font-weight:600;">예금주</th>
            <th style="padding:8px 10px;font-weight:600;text-align:right;">금액</th>
          </tr></thead>
          <tbody>
            ${batch.items.map(x => `
              <tr style="border-top:1px solid var(--border);">
                <td style="padding:9px 10px;">${esc(x.name)}</td>
                <td style="padding:9px 10px;white-space:nowrap;">${esc(x.bankName)} ${esc(x.bankAccount)}</td>
                <td style="padding:9px 10px;">${esc(x.accountHolder)}</td>
                <td style="padding:9px 10px;text-align:right;font-weight:700;white-space:nowrap;">${formatWon(x.total)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
        <button id="payout-csv" style="padding:10px 14px;font-size:13px;font-weight:600;border:1px solid #bfe6cf;border-radius:8px;background:var(--primary-soft);color:var(--primary-dark);cursor:pointer;">⬇ ① 엑셀 파일 받기</button>
        <button id="payout-copy" style="padding:10px 14px;font-size:13px;font-weight:600;border:1px solid #bfe6cf;border-radius:8px;background:var(--primary-soft);color:var(--primary-dark);cursor:pointer;">📋 표 복사 (엑셀에 붙여넣기)</button>
        <button id="payout-done" style="padding:10px 14px;font-size:13px;font-weight:600;border:none;border-radius:8px;background:var(--primary);color:#fff;cursor:pointer;">✓ ③ 송금했어요 · 전체 지급 완료</button>
      </div>
    `;
  }

  if (batch.excluded.length) {
    wrap.innerHTML += `
      <div style="margin-top:12px;font-size:12px;color:var(--muted);">
        이번에 빠지는 판매자: ${batch.excluded.map(e => `${esc(e.seller.name)} ${formatWon(e.total)} (${esc(e.reason)})`).join(" · ")}
      </div>`;
  }

  document.getElementById("payout-csv")?.addEventListener("click", () => {
    const blob = new Blob([payoutBatchCSV(batch)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `madi_payout_${dateText.replaceAll(".", "")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showAdminMsg("admin-withdraw-msg", "엑셀 파일을 받았어요. 파일이 안 받아지면 옆의 '표 복사'를 눌러 엑셀에 붙여넣으세요.", false);
  });

  document.getElementById("payout-copy")?.addEventListener("click", () => {
    const text = [["은행", "계좌번호", "예금주", "금액", "판매자"].join("\t"),
      ...batch.items.map(x => [x.bankName, x.bankAccount, x.accountHolder, x.total, x.name].join("\t"))].join("\n");
    const done = () => showAdminMsg("admin-withdraw-msg", "표를 복사했어요. 엑셀을 열고 붙여넣기(Ctrl+V) 하세요.", false);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => showAdminMsg("admin-withdraw-msg", "복사가 막혀 있어요. 엑셀 파일 받기를 이용해주세요.", true));
    } else {
      showAdminMsg("admin-withdraw-msg", "복사가 막혀 있어요. 엑셀 파일 받기를 이용해주세요.", true);
    }
  });

  const doneBtn = document.getElementById("payout-done");
  doneBtn?.addEventListener("click", () => {
    if (doneBtn.dataset.confirm !== "1") {
      doneBtn.dataset.confirm = "1";
      doneBtn.textContent = `은행 송금을 마쳤나요? 한 번 더 누르면 ${batch.items.length}명 지급 완료 처리`;
      doneBtn.style.background = "var(--accent)";
      return;
    }
    const res = completePayoutBatch();
    if (!res.ok) { showAdminMsg("admin-withdraw-msg", res.message, true); return; }
    renderAll();
    showAdminMsg("admin-withdraw-msg", `${res.count}명 · ${formatWon(res.total)} 지급 완료로 처리했어요. 판매자 화면에도 '지급완료'로 보여요.`, false);
  });

  const done = Object.values(STATE.withdrawals)
    .filter(w => w.status === "지급완료")
    .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))
    .slice(0, 10);
  doneEl.innerHTML = done.length ? done.map(w => {
    const seller = STATE.users[w.sellerId];
    return `
      <div style="padding:8px 0;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-size:13px;">
        <span>${esc(seller ? seller.name : w.sellerId)}</span>
        <span style="color:var(--muted);">${formatWon(w.amount)} · ${formatDate(w.paidAt)}</span>
      </div>`;
  }).join("") : `<p style="font-size:13px;color:var(--muted);margin:0;">지급 완료 내역이 없습니다.</p>`;
}
