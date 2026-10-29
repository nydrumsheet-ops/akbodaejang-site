/* ============================================================
   admin.js — 관리자 화면
   "관리자" 요청일 때 이 파일을 고칩니다 (총괄은 모든 파일 가능).

   위쪽 탭으로 나뉜다:
   운영지표 / 악보 심사 / 정산 지급 / 신청곡 / 문의 관리 / 회원관리 / 데모 데이터
   ============================================================ */

let ADMIN_REJECT_TARGET_ID = null;
let ADMIN_ARTIST_REJECT_TARGET_ID = null;   // 2026-10-20 추가: 아티스트 신청 관리 탭의 거절 대상(악보 심사용 변수와 분리)
let ADMIN_ARTIST_FILTER = "심사대기";        // 2026-10-20 추가: 아티스트 신청 관리 상태 필터
let ADMIN_TAB = "metrics";
let ADMIN_METRIC_DAYS = 30;          // 운영지표 기간: 1(오늘) / 7 / 30 / 0(전체)
let ADMIN_MEMBER_QUERY = "";
let ADMIN_MEMBER_ROLE = "";
let ADMIN_MEMBER_SORT = "recent";
let ADMIN_MEMBER_OPEN = null;        // 펼쳐서 보고 있는 회원 id
let ADMIN_INQUIRY_FILTER = "";       // 문의 관리 상태 필터
let ADMIN_INQUIRY_OPEN = null;       // 펼쳐서 보고 있는 문의 id

const ADMIN_PANEL = "background:var(--card);border:1px solid var(--border);border-radius:16px;padding:18px;margin-bottom:16px;box-shadow:var(--shadow);";

function renderAdmin() {
  const el = document.getElementById("view-admin");
  if (!el) return;

  const pendingReview = Object.values(STATE.scores).filter(s => s.status === "등록" || s.status === "심사중").length;
  const openRequests = Object.values(STATE.requests).filter(r => r.status !== "완료").length;
  const openInquiries = Object.values(STATE.inquiries).filter(q => q.status !== "답변완료").length;
  const pendingArtistApps = getArtistApplications({ status: "심사대기" }).length;
  // 2026-10-29: 다시 그리기 전에 상단 탭 줄의 가로 스크롤 위치를 기억해 둔다(다시 그리면 0으로 돌아가 선택한 탭이 잘려 보이던 문제).
  const prevTabsScroll = document.getElementById("admin-tabs-row")?.scrollLeft || 0;
  const payout = getPayoutBatch();
  const pdfSt = pdfMappingStatus();
  const pdfSt2 = pdfMappingStatus2();
  const pdfStR = reviewMappingStatus();
  const tabs = [
    ["metrics", "운영지표", ""],
    ["review", "악보 심사", pendingReview],
    ["artistapps", "아티스트 신청 관리", pendingArtistApps],
    ["payout", "정산 지급", payout.items.length],
    ["requests", "신청곡", openRequests],
    ["inquiries", "문의 관리", openInquiries],
    ["members", "회원관리", ""],
    ["pdfupload", "PDF 일괄 업로드", pdfSt.remaining + pdfSt2.remaining + pdfStR.remaining],
    ["demo", "데모 데이터", ""]
  ];

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:16px;">
      <button id="admin-tabs-left" style="flex-shrink:0;border:none;background:transparent;color:var(--muted);font-size:20px;line-height:1;padding:4px 6px;cursor:pointer;" aria-label="탭 왼쪽으로 이동">‹</button>
      <div class="chip-row" id="admin-tabs-row" style="margin-bottom:0;gap:8px;flex:1;min-width:0;">
        ${tabs.map(([k, label, n]) => `
          <button class="chip ${ADMIN_TAB === k ? "active" : ""}" data-admin-tab="${k}" style="padding:9px 14px;font-size:13px;flex-shrink:0;">
            ${label}${n ? ` <b style="margin-left:4px;">${n}</b>` : ""}
          </button>`).join("")}
      </div>
      <button id="admin-tabs-right" style="flex-shrink:0;border:none;background:transparent;color:var(--muted);font-size:20px;line-height:1;padding:4px 6px;cursor:pointer;" aria-label="탭 오른쪽으로 이동">›</button>
    </div>
    <div id="admin-tab-body"></div>
  `;
  el.querySelectorAll("[data-admin-tab]").forEach(b => b.addEventListener("click", () => {
    ADMIN_TAB = b.dataset.adminTab;
    renderAdmin();
  }));
  document.getElementById("admin-tabs-left")?.addEventListener("click", () => {
    document.getElementById("admin-tabs-row")?.scrollBy({ left: -160, behavior: "smooth" });
  });
  document.getElementById("admin-tabs-right")?.addEventListener("click", () => {
    document.getElementById("admin-tabs-row")?.scrollBy({ left: 160, behavior: "smooth" });
  });
  // 2026-10-29: 스크롤 위치를 되살린 뒤, 선택된 탭이 일부라도 가려져 있으면 전부 보이도록 탭 줄만 옮긴다(페이지 전체는 스크롤하지 않음).
  (() => {
    const row = document.getElementById("admin-tabs-row");
    const active = row?.querySelector(".chip.active");
    if (!row) return;
    row.scrollLeft = prevTabsScroll;
    if (!active) return;
    // 아래 본문이 그려진 뒤(폭이 몇 px 바뀔 수 있음) 위치를 맞추도록 화면 갱신 직후에 계산한다.
    const fit = () => {
      if (!row.isConnected) return;
      const pad = 12;
      const left = active.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
      const right = left + active.offsetWidth;
      if (left < row.scrollLeft + pad) row.scrollLeft = Math.max(0, left - pad);
      else if (right > row.scrollLeft + row.clientWidth - pad) row.scrollLeft = right - row.clientWidth + pad;
    };
    fit();
    requestAnimationFrame(() => requestAnimationFrame(fit));
    setTimeout(fit, 120);
  })();

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
  } else if (ADMIN_TAB === "artistapps") {
    renderAdminArtistApps(body);
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
            ["1", "구매자가 신청", `구매자가 스토어 › 신청곡에서<br>곡 제목·작곡가·가수·악기를 적어 무료로 올립니다.<br>같은 곡이면 기존 신청에 이름이 더해져<br>"신청 n명"이 늘어나요.`],
            ["2", "채보 진행", `신청 많은 순으로 위에 보여요.<br>신청곡을 눌러 열고 "채보중"을 누르세요.<br>구매자 신청곡 화면에도 상태가 바로 바뀌어 보여요.`],
            ["3", "작업 완료", `판매자가 그 곡을 등록하고 심사에서 승인되면,<br>신청곡을 열어 그 악보를 고르고 "작업 완료"를 누르세요.<br>구매자 신청곡 화면에 완료로 표시되고, 신청자도<br>다른 구매자와 동일하게 정가로 구매할 수 있어요.`]
          ].map(([n, t, d]) => `
            <div style="padding:14px;border-radius:12px;background:#f5f2ee;">
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
  } else if (ADMIN_TAB === "inquiries") {
    renderAdminInquiries(body);
  } else if (ADMIN_TAB === "pdfupload") {
    renderAdminPdfUpload(body);
  } else if (ADMIN_TAB === "demo") {
    body.innerHTML = `
      <div style="${ADMIN_PANEL}">
        <h2 style="margin:0 0 4px;font-size:17px;">데모 데이터</h2>
        <p style="margin:0 0 12px;font-size:13px;color:var(--muted);">화면 확인용 예시 악보·구매·충전·후기·신청곡으로 전부 다시 채웁니다. 지금 이 브라우저에 저장된 모든 데이터(가입자, 구매 내역 등)가 지워집니다.</p>
        <button id="admin-reset-demo"
          style="padding:10px 14px;font-size:13px;border:1px solid var(--danger);border-radius:8px;background:var(--card);color:var(--danger);cursor:pointer;">
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

function statTile(label, value, sub, spark) {
  return `
    <div style="padding:14px;border-radius:14px;background:var(--card);border:1px solid var(--border);min-width:0;">
      <div style="font-size:12px;color:var(--muted);">${label}</div>
      <div style="font-size:20px;font-weight:800;margin-top:4px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${value}</div>
      ${sub ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">${sub}</div>` : ""}
      ${spark || ""}
    </div>`;
}

// 2026-10-29 추가: 숫자 카드용 스파크라인(축 없음, 흐름만). 색은 테마 대응되는 진한 강조색(--primary-dark).
function adminSparkline(values, title) {
  const W = 120, H = 28, pad = 3;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? (W - pad * 2) / (values.length - 1) : 0;
  const pts = values.map((v, i) => [pad + i * step, H - pad - (v / max) * (H - pad * 2)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:28px;display:block;margin-top:8px;" role="img" aria-label="${esc(title)}">
    <title>${esc(title)}</title>
    <path d="${line} L${lx.toFixed(1)} ${H} L${pad} ${H} Z" fill="var(--primary-soft)" stroke="none"/>
    <path d="${line}" fill="none" stroke="var(--primary-dark)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.5" fill="var(--primary-dark)"/>
  </svg>`;
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

  // 2026-10-29 추가: 월별 악보 매출 (최근 12개월, 기간 칩과 무관) — 꺾은선(영역형) 그래프
  const monthly = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(1); start.setMonth(start.getMonth() - i);
    const end = new Date(start); end.setMonth(start.getMonth() + 1);
    const list = Object.values(STATE.purchases).filter(p => !p.refunded && p.price > 0 && new Date(p.purchasedAt) >= start && new Date(p.purchasedAt) < end);
    monthly.push({ start, total: list.reduce((s, p) => s + p.price, 0), count: list.length });
  }
  const maxMonthly = Math.max(1, ...monthly.map(x => x.total));
  const LW = 600, LH = 160, LPX = 18, LTOP = 18;
  const lStep = (LW - LPX * 2) / (monthly.length - 1);
  const lPts = monthly.map((x, i) => [LPX + i * lStep, LTOP + (LH - LTOP) * (1 - x.total / maxMonthly)]);
  const lLine = lPts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const lArea = `${lLine} L${lPts[lPts.length - 1][0].toFixed(1)} ${LH} L${lPts[0][0].toFixed(1)} ${LH} Z`;
  const lDots = monthly.map((x, i) => {
    const [cx, cy] = lPts[i];
    const label = `${x.start.getFullYear()}년 ${x.start.getMonth() + 1}월${i === monthly.length - 1 ? "(진행 중)" : ""} · ${formatPoint(x.total)} · ${x.count}건`;
    return `<g class="adm-pt">
      <rect x="${(cx - lStep / 2).toFixed(1)}" y="0" width="${lStep.toFixed(1)}" height="${LH}" fill="transparent"><title>${label}</title></rect>
      <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4" fill="var(--card)" stroke="var(--primary-dark)" stroke-width="2"><title>${label}</title></circle>
      <text x="${i === monthly.length - 1 ? LW : cx.toFixed(1)}" y="${LH + 15}" font-size="11" fill="var(--muted)" text-anchor="${i === monthly.length - 1 ? "end" : "middle"}">${i === monthly.length - 1 ? "이번 달" : `${x.start.getMonth() + 1}월`}</text>
    </g>`;
  }).join("");
  const bestMonth = monthly.reduce((a, b) => b.total > a.total ? b : a, monthly[0]);

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
      ${statTile("악보 매출", formatPoint(m.revenue), `${m.sales.length}건 판매`, adminSparkline(daily.map(x => x.total), `최근 ${span}일 일별 매출 흐름`))}
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

    <div style="${ADMIN_PANEL}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;">
        <h3 style="margin:0;font-size:15px;">월별 악보 매출 (최근 12개월)</h3>
        <span style="font-size:12px;color:var(--muted);">점에 마우스를 올리면 월·금액·건수가 보여요</span>
      </div>
      <div style="margin-top:12px;">
        <svg viewBox="0 0 ${LW} ${LH + 20}" style="width:100%;height:auto;display:block;overflow:visible;" role="img" aria-label="월별 악보 매출 꺾은선 그래프">
          <line x1="0" x2="${LW}" y1="${LTOP}" y2="${LTOP}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 4"/>
          <text x="0" y="${LTOP - 5}" font-size="11" fill="var(--muted)">${formatPoint(maxMonthly === 1 && !bestMonth.total ? 0 : maxMonthly)}</text>
          <line x1="0" x2="${LW}" y1="${LH}" y2="${LH}" stroke="var(--border)" stroke-width="1"/>
          <path d="${lArea}" fill="var(--primary-soft)" stroke="none"/>
          <path d="${lLine}" fill="none" stroke="var(--primary-dark)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
          ${lDots}
        </svg>
        <div style="font-size:12px;color:var(--muted);margin-top:4px;">가장 많이 판 달: ${bestMonth.total ? `${bestMonth.start.getFullYear()}년 ${bestMonth.start.getMonth() + 1}월 · ${formatPoint(bestMonth.total)}` : "아직 없음"}</div>
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
            <div style="height:8px;border-radius:4px;background:var(--primary-soft);"><div style="height:8px;border-radius:4px;background:var(--primary-dark);width:${(total / maxInst * 100).toFixed(1)}%;"></div></div>
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
  const adminEmails = getAdminEmails();
  const myEmail = (getCurrentUser()?.email || "").toLowerCase();
  body.innerHTML = `
    <div style="${ADMIN_PANEL}">
      <h2 style="margin:0 0 4px;font-size:17px;">관리자 계정 관리</h2>
      <p style="margin:0 0 12px;font-size:13px;color:var(--muted);line-height:1.6;">
        이메일을 등록해두면 그 이메일로 이미 가입돼 있을 경우 즉시 관리자가 되고, 아직 가입 전이면 나중에 그 이메일로 가입할 때 자동으로 관리자가 돼요.
        본인 또는 마지막 남은 관리자는 해제할 수 없어요.
      </p>
      <div id="admin-admins-msg" style="font-size:13px;margin:0 0 10px;"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <input id="admin-admin-email" class="field" type="email" style="flex:1;min-width:220px;" placeholder="등록할 관리자 이메일">
        <button id="admin-admin-add" class="btn btn-primary" style="background:#33312e;border-color:#33312e;border-radius:11px;" onmouseover="this.style.background='#1f1e1c';this.style.borderColor='#1f1e1c'" onmouseout="this.style.background='#33312e';this.style.borderColor='#33312e'">등록</button>
      </div>
      <div>
        ${adminEmails.map(e => {
          const locked = e === myEmail || adminEmails.length <= 1;
          const u = findUserByEmail(e);
          return `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid var(--border);">
            <span style="font-size:13px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${esc(e)}${e === myEmail ? ` <span style="color:var(--muted);">(나)</span>` : ""}${!u ? ` <span style="color:var(--muted);">· 미가입</span>` : ""}
            </span>
            <button data-admin-remove="${esc(e)}" class="btn btn-small" ${locked ? "disabled" : ""}>해제</button>
          </div>`;
        }).join("")}
      </div>
    </div>
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
  document.getElementById("admin-admin-add")?.addEventListener("click", () => {
    const input = document.getElementById("admin-admin-email");
    const res = addAdminEmail(input.value);
    if (!res.ok) { showAdminMsg("admin-admins-msg", res.message, true); return; }
    renderAll();
    showAdminMsg("admin-admins-msg", res.alreadyMember ? "관리자로 등록했어요. 즉시 반영됩니다." : "관리자로 등록했어요. 이 이메일로 가입하면 자동으로 관리자가 돼요.", false);
  });
  body.querySelectorAll("[data-admin-remove]").forEach(b => b.addEventListener("click", () => {
    const res = removeAdminEmail(b.dataset.adminRemove);
    if (!res.ok) { showAdminMsg("admin-admins-msg", res.message, true); return; }
    renderAll();
    showAdminMsg("admin-admins-msg", "관리자 권한을 해제했어요.", false);
  }));
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
  const roleColor = u.sellerInfo ? "background:var(--band);color:var(--text);" : "background:var(--primary-soft);color:var(--primary);";
  let detail = "";
  if (open) {
    const history = [...u.pointHistory].reverse().slice(0, 8);
    const purchases = Object.values(STATE.purchases).filter(p => p.buyerId === u.id).sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt)).slice(0, 8);
    const myScores = u.sellerInfo ? Object.values(STATE.scores).filter(s => s.sellerId === u.id) : [];
    detail = `
      <div class="mem-detail" style="margin-top:10px;padding:14px;border-radius:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;font-size:12px;">
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
            <input id="adj-amt-${u.id}" class="field mem-adj-field" type="number" step="100" placeholder="예: 1000 또는 -1000" style="width:150px;">
            <input id="adj-reason-${u.id}" class="field mem-adj-field" placeholder="사유 (필수)" style="flex:1;min-width:120px;">
            <button data-mem-adjust="${u.id}" class="btn btn-small btn-primary admin-dark-btn">적용</button>
          </div>
        </div>
      </div>`;
  }
  return `
    <div class="mem-row" style="padding:12px 0;">
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

/* ---------- 문의 관리 ---------- */

function renderAdminInquiries(body) {
  const all = Object.values(STATE.inquiries).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const list = ADMIN_INQUIRY_FILTER ? all.filter(q => q.status === ADMIN_INQUIRY_FILTER) : all;

  body.innerHTML = `
    <div style="${ADMIN_PANEL}">
      <h2 style="margin:0 0 4px;font-size:17px;">문의 관리</h2>
      <p style="margin:0 0 12px;font-size:13px;color:var(--muted);">구매자가 고객센터에서 보낸 1:1 문의입니다. 특정 악보에 대한 문의면 그 악보의 판매자도 볼 수 있고 직접 답할 수 있어요.</p>
      <div class="chip-row" style="margin-bottom:12px;">
        ${[["", "전체"], ...INQUIRY_STATUS.map(s => [s, s])].map(([v, l]) => `<button class="chip ${ADMIN_INQUIRY_FILTER === v ? "active" : ""}" data-inq-filter="${v}">${l}</button>`).join("")}
      </div>
      <div id="admin-inquiry-msg" style="font-size:13px;margin:0 0 8px;"></div>
      ${list.length ? list.map(q => adminInquiryRowHTML(q)).join("") : `<p style="font-size:13px;color:var(--muted);margin:0;">조건에 맞는 문의가 없습니다.</p>`}
    </div>`;

  body.querySelectorAll("[data-inq-filter]").forEach(b => b.addEventListener("click", () => {
    ADMIN_INQUIRY_FILTER = b.dataset.inqFilter;
    renderAdminInquiries(body);
  }));
  body.querySelectorAll("[data-inq-toggle]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.inqToggle;
    ADMIN_INQUIRY_OPEN = ADMIN_INQUIRY_OPEN === id ? null : id;
    renderAdminInquiries(body);
  }));
  body.querySelectorAll("[data-inq-answer]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.inqAnswer;
    const text = document.getElementById(`admin-inq-answer-${id}`).value;
    const res = answerInquiry(id, "admin", null, text);
    if (!res.ok) { showAdminMsg("admin-inquiry-msg", res.message, true); return; }
    renderAll();
    showAdminMsg("admin-inquiry-msg", "답변을 등록했습니다.", false);
  }));
}

function adminInquiryRowHTML(q) {
  const open = ADMIN_INQUIRY_OPEN === q.id;
  const buyer = STATE.users[q.buyerId];
  const score = q.scoreId && STATE.scores[q.scoreId];
  const seller = q.sellerId && STATE.users[q.sellerId];
  const color = q.status === "답변완료" ? "var(--primary-dark)" : "#8a6420";
  return `
    <div style="padding:12px 0;border-top:1px solid var(--border);">
      <button type="button" data-inq-toggle="${q.id}" style="all:unset;cursor:pointer;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;width:100%;">
        <span style="min-width:0;">
          <b style="font-size:14px;">${esc(q.title)}</b>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">
            ${esc(buyer ? buyer.name : "탈퇴 회원")} · ${esc(q.category)}${score ? ` · ${esc(score.title)} (판매자: ${esc(seller ? seller.name : "-")})` : ""} · ${formatDate(q.createdAt)}
          </div>
        </span>
        <span style="flex-shrink:0;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;color:${color};background:color-mix(in oklch,${color} 14%,var(--card));">${esc(q.status)}</span>
      </button>
      ${open ? `
        <div style="margin-top:10px;font-size:13px;line-height:1.6;">
          <div style="white-space:pre-wrap;">${esc(q.content)}</div>
          ${q.answer ? `
            <div style="margin-top:10px;padding:10px;border-radius:8px;background:var(--bg);">
              <b style="font-size:12px;color:var(--primary);">${q.answer.by === "seller" ? "판매자 답변" : "관리자 답변"} · ${formatDate(q.answer.answeredAt)}</b>
              <div style="margin-top:4px;white-space:pre-wrap;">${esc(q.answer.text)}</div>
            </div>` : `
            <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
              <textarea id="admin-inq-answer-${q.id}" rows="3" placeholder="답변을 입력하세요"
                style="width:100%;padding:9px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;"></textarea>
              <button data-inq-answer="${q.id}" style="align-self:flex-start;padding:7px 12px;font-size:12px;border:none;border-radius:8px;background:var(--primary);color:var(--on-accent);cursor:pointer;">답변 등록</button>
            </div>`}
        </div>` : ""}
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
        <div style="padding:12px;border-radius:12px;background:#f5f2ee;">
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
              <span style="display:block;font-size:12px;color:var(--muted);margin-top:2px;">${esc(r.composer)} 작곡 · ${esc(r.singer)} · ${esc(r.instrument)}${linked ? ` · 연결: ${esc(linked.title)}` : ""}</span>
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
    ADMIN_REQ_PICK = null;
    renderAll();
    showAdminMsg("admin-request-msg",
      `완료 처리했어요. 신청자 ${res.total}명에게 악보가 나왔다는 안내가 보여요. (무료 지급은 하지 않아요 — 정가로 구매해야 해요)`, false);
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
      <div style="font-weight:700;font-size:13px;margin-bottom:8px;">신청한 사람 ${requesters.length}명</div>
      ${r.note ? `<div style="font-size:12px;color:var(--muted);white-space:pre-wrap;margin:-4px 0 8px;">${esc(r.note)}</div>` : ""}
      ${requesters.length ? requesters.map(u => {
        const bought = r.fulfilledScoreId && Object.values(STATE.purchases).some(p => p.buyerId === u.id && p.scoreId === r.fulfilledScoreId && !p.refunded);
        return `<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;font-size:12px;border-top:1px solid var(--border);">
          <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><b>${esc(u.name)}</b> <span style="color:var(--muted);">${esc(u.email)}</span></span>
          ${r.status === "완료" ? `<span style="white-space:nowrap;color:${bought ? "var(--primary)" : "var(--muted)"};">${bought ? "✓ 구매함" : "-"}</span>` : ""}
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
          ${ADMIN_REQ_PICK ? `선택한 악보로 작업 완료 (신청자 ${r.buyerIds.length}명)` : "위에서 악보를 먼저 골라주세요"}
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
      ? `<span style="display:inline-flex;align-items:center;gap:3px;margin-left:6px;padding:2px 6px;border-radius:5px;background:var(--primary-soft);color:var(--primary-dark);font-size:11px;">${videoIconArt(12)} 영상</span>`
      : "";
    const isRejecting = ADMIN_REJECT_TARGET_ID === s.id;

    return `
      <div style="padding:12px 0;border-top:1px solid var(--border);">
        <div style="font-size:14px;font-weight:600;">${esc(s.title)}${videoBadge}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px;">
          ${esc(s.artist)} · ${esc(s.instrument)} · ${esc(s.difficulty)} · ${formatPoint(s.price)}
          · 판매자 ${esc(seller ? seller.name : s.sellerId)} · 등록일 ${formatDate(s.createdAt)}
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button data-approve-id="${s.id}" class="admin-approve-btn"
            style="flex:1;padding:9px;font-size:13px;border-radius:8px;cursor:pointer;">
            승인
          </button>
          <button data-reject-id="${s.id}" class="admin-stop-btn"
            style="flex:1;padding:9px;font-size:13px;border-radius:8px;background:var(--card);cursor:pointer;">
            반려
          </button>
        </div>
        ${isRejecting ? `
          <div style="margin-top:8px;">
            <input type="text" id="admin-reject-reason" placeholder="반려 사유를 입력하세요"
              style="width:100%;padding:9px;border:1px solid var(--border);border-radius:8px;font-size:13px;">
            <div style="display:flex;gap:8px;margin-top:6px;">
              <button id="admin-reject-confirm" class="admin-approve-btn"
                style="flex:1;padding:9px;font-size:13px;border-radius:8px;cursor:pointer;">
                반려 확정
              </button>
              <button id="admin-reject-cancel" class="admin-stop-btn"
                style="flex:1;padding:9px;font-size:13px;border-radius:8px;background:var(--card);cursor:pointer;">
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

/* ---------- 아티스트 신청 관리 (2026-10-20 추가, Phase 2) ----------
   buyer.js 마이페이지에서 들어온 "아티스트 가입" 신청을 승인/거절한다.
   승인하면 common.js의 approveArtistApplication → becomeSeller(silent)가 호출되어
   그 회원이 바로 판매자 권한을 받고, 신청서의 아티스트명이 활동명으로 들어간다. */

function renderAdminArtistApps(body) {
  body.innerHTML = `
    <div style="${ADMIN_PANEL}">
      <h2 style="margin:0 0 4px;font-size:17px;">아티스트 신청 관리</h2>
      <p style="margin:0 0 12px;font-size:13px;color:var(--muted);">마이페이지에서 들어온 아티스트 가입 신청을 승인하거나 거절합니다. 거절 시 사유가 신청자에게 전달됩니다.</p>
      <div class="chip-row" id="admin-artistapp-filter" style="margin-bottom:12px;">
        ${["심사대기", "승인", "거절"].map(s => `
          <button class="chip ${ADMIN_ARTIST_FILTER === s ? "active" : ""}" data-artistapp-filter="${s}" style="padding:8px 12px;font-size:12px;">${s}</button>
        `).join("")}
      </div>
      <div id="admin-artistapp-msg" style="font-size:13px;margin:0 0 10px;"></div>
      <div id="admin-artistapp-list"></div>
    </div>`;
  body.querySelectorAll("[data-artistapp-filter]").forEach(b => b.addEventListener("click", () => {
    ADMIN_ARTIST_FILTER = b.dataset.artistappFilter;
    ADMIN_ARTIST_REJECT_TARGET_ID = null;
    renderAdminArtistApps(body);
  }));
  renderAdminArtistAppList();
}

function renderAdminArtistAppList() {
  const listEl = document.getElementById("admin-artistapp-list");
  if (!listEl) return;

  const list = getArtistApplications({ status: ADMIN_ARTIST_FILTER });

  if (list.length === 0) {
    listEl.innerHTML = `<p style="font-size:13px;color:var(--muted);margin:0;">"${esc(ADMIN_ARTIST_FILTER)}" 상태의 신청이 없습니다.</p>`;
    return;
  }

  listEl.innerHTML = list.map(a => {
    const isRejecting = ADMIN_ARTIST_REJECT_TARGET_ID === a.id;
    const statusColor = a.status === "승인" ? "var(--primary)" : a.status === "거절" ? "var(--danger)" : "var(--muted)";
    return `
      <div style="padding:12px 0;border-top:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="font-size:14px;font-weight:600;">${esc(a.artistName)}</div>
          <span style="font-size:11px;padding:2px 7px;border-radius:5px;background:#f5f2ee;color:${statusColor};">${esc(a.status)}</span>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px;line-height:1.7;">
          이름 ${esc(a.name)} · 휴대폰 ${esc(a.phone)} · 이메일 ${esc(a.email)}<br>
          판매자 영상: <a href="${esc(a.videoUrl)}" target="_blank" rel="noopener" style="color:var(--primary-dark);">${esc(a.videoUrl)}</a><br>
          악보/MR 샘플: <a href="${esc(a.sampleFileUrl)}" target="_blank" rel="noopener" style="color:var(--primary-dark);">파일 열기</a><br>
          신청일 ${formatDate(a.createdAt)}${a.status === "거절" && a.rejectReason ? ` · 거절 사유: ${esc(a.rejectReason)}` : ""}
        </div>
        ${a.status === "심사대기" ? `
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button data-artistapp-approve="${a.id}" class="admin-approve-btn"
              style="flex:1;padding:9px;font-size:13px;border-radius:8px;cursor:pointer;">
              승인
            </button>
            <button data-artistapp-reject="${a.id}" class="admin-stop-btn"
              style="flex:1;padding:9px;font-size:13px;border-radius:8px;background:var(--card);cursor:pointer;">
              거절
            </button>
          </div>
        ` : ""}
        ${isRejecting ? `
          <div style="margin-top:8px;">
            <input type="text" id="admin-artistapp-reject-reason" placeholder="거절 사유를 입력하세요"
              style="width:100%;padding:9px;border:1px solid var(--border);border-radius:8px;font-size:13px;">
            <div style="display:flex;gap:8px;margin-top:6px;">
              <button id="admin-artistapp-reject-confirm" class="admin-approve-btn"
                style="flex:1;padding:9px;font-size:13px;border-radius:8px;cursor:pointer;">
                거절 확정
              </button>
              <button id="admin-artistapp-reject-cancel" class="admin-stop-btn"
                style="flex:1;padding:9px;font-size:13px;border-radius:8px;background:var(--card);cursor:pointer;">
                취소
              </button>
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }).join("");

  listEl.querySelectorAll("[data-artistapp-approve]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!(await hasLiveSession())) {
        showAdminMsg("admin-artistapp-msg", "로그인이 만료된 것 같아요. 로그아웃 후 다시 로그인하고 다시 시도해주세요.", true);
        return;
      }
      const adminId = getCurrentUser()?.id;
      const result = approveArtistApplication(btn.dataset.artistappApprove, adminId);
      if (!result.ok) {
        showAdminMsg("admin-artistapp-msg", result.message || "승인에 실패했습니다.", true);
        return;
      }
      renderAll();
      showAdminMsg("admin-artistapp-msg", "승인되었습니다. 신청자에게 바로 판매자 권한이 부여됩니다.", false);
    });
  });

  listEl.querySelectorAll("[data-artistapp-reject]").forEach(btn => {
    btn.addEventListener("click", () => {
      ADMIN_ARTIST_REJECT_TARGET_ID = btn.dataset.artistappReject;
      renderAdminArtistAppList();
    });
  });

  const confirmBtn = document.getElementById("admin-artistapp-reject-confirm");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", async () => {
      const reasonInput = document.getElementById("admin-artistapp-reject-reason");
      const reason = reasonInput ? reasonInput.value.trim() : "";
      if (!reason) {
        showAdminMsg("admin-artistapp-msg", "거절 사유를 입력해주세요.", true);
        return;
      }
      if (!(await hasLiveSession())) {
        showAdminMsg("admin-artistapp-msg", "로그인이 만료된 것 같아요. 로그아웃 후 다시 로그인하고 다시 시도해주세요.", true);
        return;
      }
      const adminId = getCurrentUser()?.id;
      const result = rejectArtistApplication(ADMIN_ARTIST_REJECT_TARGET_ID, adminId, reason);
      ADMIN_ARTIST_REJECT_TARGET_ID = null;
      if (!result.ok) {
        showAdminMsg("admin-artistapp-msg", result.message || "거절에 실패했습니다.", true);
        return;
      }
      renderAll();
      showAdminMsg("admin-artistapp-msg", "거절되었습니다. 신청자에게 사유가 전달됩니다.", false);
    });
  }

  const cancelBtn = document.getElementById("admin-artistapp-reject-cancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      ADMIN_ARTIST_REJECT_TARGET_ID = null;
      renderAdminArtistAppList();
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
      <div style="padding:12px;border-radius:10px;background:#f5f2ee;margin-bottom:10px;font-size:13px;">
        다음 지급일 <b>${dateText}</b> · 대상 <b>${batch.items.length}명</b> · 합계 <b>${formatWon(batch.total)}</b>
      </div>
      <div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f5f2ee;color:var(--muted);text-align:left;">
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
        <button id="payout-csv" class="payout-btn"><i class="ico ico-download"></i> ① 엑셀 파일 받기</button>
        <button id="payout-copy" class="payout-btn"><i class="ico ico-copy"></i> 표 복사 (엑셀에 붙여넣기)</button>
        <button id="payout-done" class="payout-btn">✓ ③ 송금했어요 · 전체 지급 완료</button>
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
      // 2026-10-29: 인라인 배경 대신 클래스로 확인 단계 강조(경고색)를 표시한다. 스타일은 index.html .payout-btn.is-confirm
      doneBtn.classList.add("is-confirm");
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

/* ============================================================
   PDF 일괄 업로드 (2026-10-18 추가)
   mydrumsheet.com 에서 이관된 750곡 중 실제 PDF 파일이 비어있던 악보들을,
   반진영님이 보내주신 "판매용 악보" 폴더의 파일명과 자동으로 맞춰본 목록이다
   (제목·아티스트·난이도로 자동 매칭해서 확실하다고 판단된 524곡만 들어있다).
   관리자가 그 폴더를 통째로 선택하면, 이 목록과 파일명을 맞춰보고
   맞는 파일만 Supabase Storage 에 업로드하고 scores.file_url 을 채운다.
   이름이 너무 달라 자동 매칭을 못했거나(134곡 확인 필요), 폴더에 파일 자체가
   없는 악보(74곡)는 이 목록에 없다 — 그런 악보는 따로 하나씩 올려야 한다.
   같은 곡이 중복 등록돼 있던 7건은 먼저 등록된 쪽만 이 목록에 남기고
   나머지 중복 행은 삭제하기로 했다(2026-10-18 확인).
   ============================================================ */

const SCORE_PDF_SELLER_ID = "user_mv614qnq_a1h5cu";
const SCORE_PDF_MAPPING = [
{id:"score_mvd75i7l_mbds2t",file:"백예린 - 1-4-3_중급.pdf"},
  {id:"score_mvd75i7o_eu0f6w",file:"루시 - 10sec_프로.pdf"},
  {id:"score_mvd75i7m_61qcpg",file:"한로로 (HANRORO) - 1111_고급.pdf"},
  {id:"score_mvd75i7n_mz65o1",file:"BOYNEXTDOOR - 123-78_고급.pdf"},
  {id:"score_mvd75i7l_5xv5h1",file:"AB6IX (에이비식스) - 1분 1초_중급 쉬운버전.pdf"},
  {id:"score_mvd75i7m_4zhdwh",file:"AB6IX (에이비식스) - 1분 1초_고급.pdf"},
  {id:"score_mvd75i7o_thxaio",file:"유다빈밴드 - 20s_프로.pdf"},
  {id:"score_mvd75i7n_6k55jh",file:"이창섭 - 33_고급.pdf"},
  {id:"score_mvd75i7m_sf2zz2",file:"MAMAMOO - 4 Flowers_고급.pdf"},
  {id:"score_mvd75i7l_dv1rjg",file:"엔플라잉 - 4242_중급.pdf"},
  {id:"score_mvd75i7n_zyd25b",file:"허각 - 9월 24일_고급.pdf"},
  {id:"score_mvd75i7n_tk5i5v",file:"Ed Sheeran - A Little More_고급.pdf"},
  {id:"score_mvd75i7o_ykujzr",file:"LUCY - A yo_고급.pdf"},
  {id:"score_mvd75i7o_wi8suk",file:"쏜애플(THORNAPPLE) - Acacia_프로.pdf"},
  {id:"score_mvd75i7n_dzleai",file:"Xdinary Heroes - AGAIN AGAIN_고급.pdf"},
  {id:"score_mvd75i7m_ewiwcb",file:"브로큰 발렌타인 - Alien_고급.pdf"},
  {id:"score_mvd75i7m_kp4lm5",file:"[고급7] Boramiyu(보라미유) - All In Future(나를 건 미래에 우린).pdf"},
  {id:"score_mvd75i7l_y3mjz6",file:"[중급5] Boramiyu(보라미유) - All In Future(나를 건 미래에 우린).pdf"},
  {id:"score_mvd75i7o_za9qba",file:"Xdinary Heroes - Ashes to Ashes_프로.pdf"},
  {id:"score_mvd75i7l_8o81eb",file:"The Rose - Back To Me_중급.pdf"},
  {id:"score_mvd75i7m_5ww2ah",file:"QWER - BAD HABIT_고급.pdf"},
  {id:"score_mvd75i7l_7fe9n3",file:"IVE 아이브 - BANG BANG_중급.pdf"},
  {id:"score_mvd75i7m_j0uja8",file:"Green Day - Basket Case_고급.pdf"},
  {id:"score_mvd75i7n_2xwanr",file:"NCT DREAM - Beat It Up_고급.pdf"},
  {id:"score_mvd75i7l_lvpb6c",file:"Charlie Puth - Beat Yourself Up_중급.pdf"},
  {id:"score_mvd75i7o_8i8au6",file:"Xdinary Heroes - Beautiful Life_프로.pdf"},
  {id:"score_mvd75i7m_xmofbg",file:"Xdinary Heroes - Bicycle_고급.pdf"},
  {id:"score_mvd75i7n_qni3ph",file:"실리카겔 - BIG VOID_고급.pdf"},
  {id:"score_mvd75i7l_g5q77y",file:"씨엔블루 - Bliss_중급_0001.pdf"},
  {id:"score_mvd75i7m_4awwux",file:"씨엔블루 - Bliss_고급.pdf"},
  {id:"score_mvd75i7m_etp982",file:"BTS (방탄소년단) -Body to Body_고급.pdf"},
  {id:"score_mvd75i7o_uss5wu",file:"Xdinary Heroes - Break The Brake_프로.pdf"},
  {id:"score_mvd75i7n_94t46l",file:"Stray Kids - CEREMONY_고급.pdf"},
  {id:"score_mvd75i7m_ago747",file:"BLACKPINK - Champion_고급.pdf"},
  {id:"score_mvd75i7n_8xj3p2",file:"유회승 (엔플라잉) - Change_고급.pdf.pdf"},
  {id:"score_mvd75i7k_rxzwm8",file:"WENDY - Chapter You_초급.pdf"},
  {id:"score_mvd75i7l_vhhh6i",file:"오월 오일 - Cherry Roman Candle_중급.pdf"},
  {id:"score_mvd75i7l_pkxjrg",file:"WOODZ - CINEMA_중급.pdf"},
  {id:"score_mvd75i7l_brr554",file:"전소미(JEON SOMI) - CLOSER_초중급.pdf"},
  {id:"score_mvd75i7l_3gi1ep",file:"BTS (방탄소년단) - Come Over_중급.pdf"},
  {id:"score_mvd75i7m_yyt6yk",file:"DAY6 - Congratulations_중급.pdf"},
  {id:"score_mvd75i7k_f7gplk",file:"DAY6 - Congratulations_초급.pdf"},
  {id:"score_mvd75i7l_xekss8",file:"wave to earth - courage_중급.pdf"},
  {id:"score_mvd75i7m_22c9rm",file:"BoA - Crazier_고급.pdf"},
  {id:"score_mvd75i7m_c06fnw",file:"Taylor Swift - Cruel Summer_고급.pdf"},
  {id:"score_mvd75i7m_466mnq",file:"AKMU - DADA_중급.pdf"},
  {id:"score_mvd75i7n_gadvgp",file:"KiiiKiii - DANCING ALONE_고급.pdf"},
  {id:"score_mvd75i7l_2povaq",file:"웬디 - Daydream_초중급.pdf"},
  {id:"score_mvd75i7l_3jwcsf",file:"Xdinary Heroes - Dear H_중급.pdf"},
  {id:"score_mvd75i7m_24lqhu",file:"제휘 - Dear Moon_고급.pdf"},
  {id:"score_mvd75i7l_s35sl6",file:"남규리 - December Dream_중급.pdf"},
  {id:"score_mvd75i7o_umubcb",file:"실리카겔 - Desert Eagle_고급.pdf"},
  {id:"score_mvd75i7o_isif5l",file:"Xdinary Heroes - Diamond_프로.pdf"},
  {id:"score_mvd75i7o_3oms7q",file:"Lady Gaga, Bruno Mars - Die With A Smile_고급.pdf"},
  {id:"score_mvd75i7m_oc3oh8",file:"DAY6 (데이식스) - Disco Day_고급.pdf"},
  {id:"score_mvd75i7n_px1b9v",file:"Stray Kids - Do It_고급.pdf"},
  {id:"score_mvd75i7l_62jcjg",file:"더크로스-Don't Cry_중급.pdf"},
  {id:"score_mvd75i7k_0qwocb",file:"진(BTS) - Don't Say You Love Me_초급.pdf"},
  {id:"score_mvd75i7m_rmjk8g",file:"Young K - Drivin into Hell_고급.pdf"},
  {id:"score_mvd75i7l_3ofrqu",file:"Young K - Drivin into Hell_중급(easy).pdf"},
  {id:"score_mvd75i7m_lawqn7",file:"우즈 - Drowning_중급.pdf"},
  {id:"score_mvd75i7m_9qw3nj",file:"지코 - DUET_고급.pdf"},
  {id:"score_mvd75i7n_row0c0",file:"도경수 - DUMB (Feat. PENOMECO)_고급.pdf"},
  {id:"score_mvd75i7o_2o3tcx",file:"m-flo,지코(ZICO),eill - EKO EKO_프로.pdf"},
  {id:"score_mvd75i7n_w2fuef",file:"검정치마 - Electra_고급.pdf"},
  {id:"score_mvd75i7k_yek0ao",file:"Djo - End Of Beginning_초급.pdf"},
  {id:"score_mvd75i7m_emr3hu",file:"DK - Endless_고급.pdf"},
  {id:"score_mvd75i7m_0yn2r0",file:"Xdinary Heroes - Enemy_고급.pdf"},
  {id:"score_mvd75i7m_npa2py",file:"웬디 - EXISTENTIAL CRISIS_고급.pdf"},
  {id:"score_mvd75i7o_9anpao",file:"슈퍼주니어 - Express Mode_프로.pdf"},
  {id:"score_mvd75i7n_tjvhg0",file:"ALLDAY PROJECT - FAMOUS_고급.pdf"},
  {id:"score_mvd75i7l_asamtc",file:"비스트 - Fiction_중급.pdf"},
  {id:"score_mvd75i7o_jpmp02",file:"Xdinary Heroes - FIGHT ME_프로.pdf"},
  {id:"score_mvd75i7n_pq2dyh",file:"7, 고급 엔플라잉 - Firefly_0001.pdf"},
  {id:"score_mvd75i7l_6to3tw",file:"[중급5] ONEWE(원위) - FLY.pdf"},
  {id:"score_mvd75i7m_gfqr3j",file:"[고급7] ONEWE(원위) - FLY.pdf"},
  {id:"score_mvd75i7o_624zgr",file:"Xdinary Heroes - Freakin'Bad_고급.pdf"},
  {id:"score_mvd75i7m_lj0bmo",file:"DAY6 - Free하게 Freely_고급.pdf"},
  {id:"score_mvd75i7o_lu7f0g",file:"Xdinary Heroes - George the Lobster_프로.pdf"},
  {id:"score_mvd75i7o_54x0i4",file:"유다빈밴드 - GET LUCKY_프로.pdf"},
  {id:"score_mvd75i7m_c4zrqh",file:"Xdinary Heroes - Ghost_고급.pdf"},
  {id:"score_mvd75i7m_t5ogjm",file:"TXT Yeonjun - Ghost girl_고급.pdf"},
  {id:"score_mvd75i7m_40k9qj",file:"BLACKPINK - GO_고급.pdf"},
  {id:"score_mvd75i7l_b0cxlc",file:"블랙핑크 - GO_중급(쉬운 악보).pdf"},
  {id:"score_mvd75i7m_fydmro",file:"Xdinary Heroes - Good enough_고급.pdf"},
  {id:"score_mvd75i7o_qoowzp",file:"H1-KEY(하이키) - Good for U_프로.pdf"},
  {id:"score_mvd75i7m_sc35vs",file:"DAY6 - Happy_중급.pdf"},
  {id:"score_mvd75i7l_cby7w2",file:"김필 - HAPPY END_중급.pdf"},
  {id:"score_mvd75i7m_abzqom",file:"Xdinary Heroes - Helium Balloon_고급.pdf"},
  {id:"score_mvd75i7m_vc4yhs",file:"FT Island - Hello Hello_고급.pdf"},
  {id:"score_mvd75i7l_n07dw0",file:"Young K - Hey Honey_중급.pdf"},
  {id:"score_mvd75i7o_7mijzv",file:"터치드 - Highlight_고급.pdf"},
  {id:"score_mvd75i7n_unerzg",file:"BOYNEXTDOOR - Hollywood Action_고급.pdf"},
  {id:"score_mvd75i7l_nwulld",file:"WOODZ - Human Extinction_중급.pdf"},
  {id:"score_mvd75i7o_jn0tc9",file:"Xdinary Heroes - Hurt So Good_프로.pdf"},
  {id:"score_mvd75i7k_pd0a4o",file:"Charlie Puth - I Don't Think That I Like Her_초급.pdf"},
  {id:"score_mvd75i7n_2r1hw3",file:"BOYNEXTDOOR - I feel good_고급.pdf"},
  {id:"score_mvd75i7m_54yz9h",file:"Bruno Mars - I Just Might_고급.pdf"},
  {id:"score_mvd75i7n_7y9v9u",file:"sombr - i wish i knew how to quit you_고급.pdf"},
  {id:"score_mvd75i7m_a00vwd",file:"EXO - I'm Home_고급.pdf"},
  {id:"score_mvd75i7l_fgkfud",file:"G-DRAGON(지드래곤)  - IBELONGIIU_초중급.pdf"},
  {id:"score_mvd75i7m_ayz1we",file:"ONEWE - ICARUS_고급.pdf"},
  {id:"score_mvd75i7o_v5amce",file:"Xdinary Heroes - ICU_프로.pdf"},
  {id:"score_mvd75i7n_c1gptz",file:"Stray Kids - In My Head_고급.pdf"},
  {id:"score_mvd75i7n_a0ydsm",file:"DAY6 (데이식스) - INSIDE OUT_고급.pdf"},
  {id:"score_mvd75i7m_go1dp6",file:"BTS (방탄소년단) - Into the Sun_고급.pdf"},
  {id:"score_mvd75i7l_xqk0gi",file:"솔라(마마무) - J에게_초중급.pdf"},
  {id:"score_mvd75i7m_pdmawp",file:"CNBLUE (씨엔블루) - Killer Joy_고급.pdf"},
  {id:"score_mvd75i7n_4pi90q",file:"Xdinary Heroes - KNOCK DOWN_고급.pdf"},
  {id:"score_mvd75i7l_o25way",file:"Xdinary Heroes - KNOCK DOWN_중급(쉬운 악보)_0001.pdf"},
  {id:"score_mvd75i7l_tv4xsw",file:"Xdinary Heroes - KTM_중급.pdf"},
  {id:"score_mvd75i7o_lhe0f2",file:"터치드(Touched) - Last Day_프로.pdf"},
  {id:"score_mvd75i7m_205081",file:"LATENCY - LATENCY_고급.pdf"},
  {id:"score_mvd75i7o_5g04im",file:"Legends Never Die - League of Legends (리그 오브 레전드)_프로.pdf"},
  {id:"score_mvd75i7k_omtljz",file:"제니 (JENNIE) - Less than a Lover_초급.pdf"},
  {id:"score_mvd75i7o_tbyud3",file:"유다빈밴드 - Letter_고급.pdf"},
  {id:"score_mvd75i7m_gs8cox",file:"BTS (방탄소년단) - Like Animals_고급.pdf"},
  {id:"score_mvd75i7o_ewy10t",file:"JENNIE - like JENNIE_고급.pdf"},
  {id:"score_mvd75i7l_obq2t4",file:"FT 아일랜드 - LIMITLESS_중급.pdf"},
  {id:"score_mvd75i7l_l3nwu8",file:"CNBLUE (씨엔블루) - Little Things_중급_0001.pdf"},
  {id:"score_mvd75i7m_7uv6f4",file:"태양 - LIVE FAST DIE SLOW_고급.pdf"},
  {id:"score_mvd75i7n_2dvavw",file:"ALLDAY PROJECT - LOOK AT ME_고급.pdf"},
  {id:"score_mvd75i7l_66iljk",file:"하현상 - LOST_중급.pdf"},
  {id:"score_mvd75i7n_4w5ooq",file:"Xdinary Heroes - Lost and Found_고급.pdf"},
  {id:"score_mvd75i7o_qlnmp7",file:"Maroon 5 - Love is Like_프로.pdf"},
  {id:"score_mvd75i7n_6zythj",file:"자이언티 - LOVE ME_고급.pdf"},
  {id:"score_mvd75i7m_ue68ue",file:"Xdinary Heroes -  LOVE ME RIGHT_고급.pdf"},
  {id:"score_mvd75i7o_a761ct",file:"유다빈밴드 - LOVE SONG_프로.pdf"},
  {id:"score_mvd75i7n_nu9hw2",file:"JOY - Love Splash!_고급.pdf"},
  {id:"score_mvd75i7l_ggzybq",file:"3. 초중급 볼빨간사춘기 - Love Story.pdf"},
  {id:"score_mvd75i7m_rdsypv",file:"비투비 - Love Today_중급.pdf"},
  {id:"score_mvd75i7n_fg7c0g",file:"헤이즈 - Love Virus (Feat. I.M)_고급.pdf"},
  {id:"score_mvd75i7m_weui2f",file:"카더가든 - LOVERS_고급.pdf"},
  {id:"score_mvd75i7m_kifpfu",file:"Mrs.GREEN APPLE-lulu._고급.pdf"},
  {id:"score_mvd75i7m_m3lu26",file:"Young K - Marionette_고급.pdf"},
  {id:"score_mvd75i7l_36fzil",file:"DAY6 - Maybe Tomorrow_중급.pdf"},
  {id:"score_mvd75i7m_dj30bw",file:"BLACKPINK - Me and my_고급.pdf"},
  {id:"score_mvd75i7m_9i8unb",file:"ASH ISLAND - MIDNIGHT SKY_고급.pdf"},
  {id:"score_mvd75i7n_phv1s2",file:"백예린 - MIRROR_고급.pdf"},
  {id:"score_mvd75i7l_2ooyv5",file:"J.Fla - Miss The You (I fell in love with)_초중급.pdf"},
  {id:"score_mvd75i7n_1e4rhb",file:"Xdinary Heroes - Money On My Mind_고급.pdf"},
  {id:"score_mvd75i7m_lcjbfa",file:"테이 - Monologue_고급.pdf"},
  {id:"score_mvd75i7o_8brp4x",file:"Xdinary Heroes - More Than I Like_프로.pdf"},
  {id:"score_mvd75i7n_gdvlzs",file:"DAY6 (데이식스) - My Way_고급.pdf"},
  {id:"score_mvd75i7k_3b8h4t",file:"The Rose (더 로즈) - Nebula_초급.pdf"},
  {id:"score_mvd75i7k_a23sju",file:"[초급2] ROSÉ - new trick.pdf"},
  {id:"score_mvd75i7m_py8d36",file:"Xdinary heroes - night before the end_중급.pdf"},
  {id:"score_mvd75i7n_vew1db",file:"정용화 - Night Runner (Shooting Star)_고급.pdf"},
  {id:"score_mvd75i7m_godew0",file:"Xdinary Heroes - No Cool Kids Zone_고급.pdf"},
  {id:"score_mvd75i7o_fpogu6",file:"윤하 - No Limit_프로.pdf"},
  {id:"score_mvd75i7o_dtvzwc",file:"Xdinary Heroes - No Matter Live_프로.pdf"},
  {id:"score_mvd75i7o_aad3vq",file:"실리카겔(Silica Gel)-No Pain_프로.pdf"},
  {id:"score_mvd75i7o_782x6p",file:"KARDI(카디) - Not But Disco_프로.pdf"},
  {id:"score_mvd75i7l_t3bkgz",file:"아일릿 - NOT CUTE ANYMORE_초중급.pdf"},
  {id:"score_mvd75i7l_i4d0hd",file:"DAY6 - Not Fine (나빠)_중급.pdf"},
  {id:"score_mvd75i7l_sktqre",file:"드래곤포니 - NOT OUT_중급(easy).pdf"},
  {id:"score_mvd75i7m_2fxpmv",file:"[고급8] Xdinary Heroes - Obsessed with Youth.pdf"},
  {id:"score_mvd75i7l_lbf8pr",file:"[중급6] Xdinary Heroes - Obsessed with Youth.pdf"},
  {id:"score_mvd75i7n_10dt0p",file:"ALLDAY PROJECT (올데이 프로젝트) - One More Time_고급.pdf"},
  {id:"score_mvd75i7m_eyf2mb",file:"넬 (NELL) - Only One_고급.pdf"},
  {id:"score_mvd75i7o_xtg78i",file:"남우현 - Only 직진_프로.pdf"},
  {id:"score_mvd75i7m_3y6dbv",file:"QWER - Our Voyage_고급.pdf"},
  {id:"score_mvd75i7k_a6jqxz",file:"범규 - Panic_초급.pdf"},
  {id:"score_mvd75i7n_ep072w",file:"TREASURE - PARADISE_고급.pdf"},
  {id:"score_mvd75i7l_s07pmf",file:"One Direction - Perfect_중급.pdf"},
  {id:"score_mvd75i7n_t6384v",file:"Stray Kids - Phoenix_고급.pdf"},
  {id:"score_mvd75i7o_2zg4vc",file:"QWER - PLAY WE DEW_고급.pdf"},
  {id:"score_mvd75i7o_z9ug18",file:"Xdinary Heroes - PLUTO_프로.pdf"},
  {id:"score_mvd75i7k_glgkaw",file:"[중급6] Official髭男dism(오피셜히게단디즘) - Pretender.pdf"},
  {id:"score_mvd75i7o_k8nbet",file:"이승윤 - PunKanon_프로.pdf"},
  {id:"score_mvd75i7o_jwhouk",file:"Mrs.GREEN APPLE - Que Sera Sera_프로_0001.pdf"},
  {id:"score_mvd75i7n_1irhq9",file:"유주 (YUJU) - REPLY_고급.pdf"},
  {id:"score_mvd75i7m_zz0t20",file:"DK - RETURN_고급.pdf"},
  {id:"score_mvd75i7o_kbo7tf",file:"aespa - Rich Man_프로.pdf"},
  {id:"score_mvd75i7o_jg0tsp",file:"Xdinary Heroes - Rise High Rise_프로.pdf"},
  {id:"score_mvd75i7l_ec17hm",file:"Rolling Quartz - Romantist_중급 쉬운악보.pdf"},
  {id:"score_mvd75i7m_m9iau7",file:"Rolling Quartz - Romantist_고급.pdf"},
  {id:"score_mvd75i7o_8miyyb",file:"터치드 - Ruby_프로.pdf"},
  {id:"score_mvd75i7m_zwtzqz",file:"강남 - Running Flower_고급.pdf"},
  {id:"score_mvd75i7n_sz4gqh",file:"차은우 - SATURDAY PREACHER_고급.pdf"},
  {id:"score_mvd75i7n_zmoezs",file:"Xdinary Heroes - Save me_고급.pdf"},
  {id:"score_mvd75i7n_2ne6od",file:"한만청 - Say Yes_고급.pdf"},
  {id:"score_mvd75i7m_8ug8a8",file:"[고급7] ONEWE(원위) - Scenario.pdf"},
  {id:"score_mvd75i7o_03axxw",file:"LUCY - Shine A Light_고급.pdf"},
  {id:"score_mvd75i7n_kf4m6r",file:"재쓰비 (JAESSBEE) - SHUT THAT_고급.pdf"},
  {id:"score_mvd75i7m_j123gy",file:"Young K - Shut The Door_고급.pdf"},
  {id:"score_mvd75i7n_lpqri2",file:"도경수 - SING ALONG!_고급.pdf"},
  {id:"score_mvd75i7m_1on338",file:"로이킴 - Smile Boy_고급.pdf"},
  {id:"score_mvd75i7l_k2vip9",file:"로이킴 - Smile Boy_중급(easy).pdf"},
  {id:"score_mvd75i7n_9zkt4t",file:"Saja Boys - Soda Pop_고급.pdf"},
  {id:"score_mvd75i7n_u3h1bp",file:"The Rose - Sour_고급.pdf"},
  {id:"score_mvd75i7o_6p8xlb",file:"Xdinary Heroes - Spoiler!!!_프로.pdf"},
  {id:"score_mvd75i7n_kjs1vw",file:"지코 (ZICO) - SPOT! (Feat. JENNIE)_고급.pdf"},
  {id:"score_mvd75i7o_fp0hva",file:"엔플라잉 - Stand By Me_프로.pdf"},
  {id:"score_mvd75i7o_rzzgqy",file:"리노, 승민, 아이엔 - START!_고급.pdf"},
  {id:"score_mvd75i7n_d7atyg",file:"어반자카파 - Stay_고급.pdf"},
  {id:"score_mvd75i7n_fi81sj",file:"플라워 - SUNDAY_고급.pdf.pdf"},
  {id:"score_mvd75i7m_6ys1m4",file:"ILLIT - Sunday Morning_고급.pdf"},
  {id:"score_mvd75i7o_98jg5v",file:"Xdinary Heroes - Supernatural_프로.pdf"},
  {id:"score_mvd75i7n_1fzod3",file:"이창섭 - SURRENDER_고급.pdf"},
  {id:"score_mvd75i7m_w7z58k",file:"넬(NELL) - Sweet Delusion_고급.pdf"},
  {id:"score_mvd75i7m_0aszfc",file:"BTS (방탄소년단) - SWIM_고급.pdf"},
  {id:"score_mvd75i7n_ao9dcd",file:"DAY6 (데이식스) - Take All My Heart_고급.pdf"},
  {id:"score_mvd75i7m_fi2f38",file:"G-DRAGON - TAKE ME_중급.pdf"},
  {id:"score_mvd75i7n_qaz1wu",file:"Simple Plan - Take My Hand_고급.pdf"},
  {id:"score_mvd75i7o_hebint",file:"Alan Walker-The Drum _프로.pdf"},
  {id:"score_mvd75i7n_riuvep",file:"Taylor Swift - The Fate Of Ophelia_고급.pdf"},
  {id:"score_mvd75i7o_urk31o",file:"Boys Like Girls - The Great Escape_고급.pdf"},
  {id:"score_mvd75i7o_7wphui",file:"씨엔블루 - To The Moon And Back_프로.pdf"},
  {id:"score_mvd75i7l_tyymyr",file:"[중급6] Dragon Pony - To. Nosy Boy (이타심).pdf"},
  {id:"score_mvd75i7m_575vtk",file:"[고급8] Dragon Pony - To. Nosy Boy (이타심).pdf"},
  {id:"score_mvd75i7l_1p0394",file:"원필(WONPIL) - Toxic Love_중급.pdf"},
  {id:"score_mvd75i7o_ulzmf4",file:"ONE OK ROCK - Tropical Therapy_고급.pdf"},
  {id:"score_mvd75i7m_yzeyi9",file:"KickFlip(킥플립) - Twenty_고급.pdf"},
  {id:"score_mvd75i7n_l8947t",file:"임영웅 - ULSSIGU_고급.pdf"},
  {id:"score_mvd75i7o_4ky42g",file:"대성 - Umbrella_프로.pdf"},
  {id:"score_mvd75i7o_fyd4zr",file:"Xdinary Heroes - UNDEFINED_프로.pdf"},
  {id:"score_mvd75i7o_jr669k",file:"대성 - Universe_고급.pdf"},
  {id:"score_mvd75i7l_4myx2l",file:"Mark Ronson(ft.Bruno Mars) - Up Town Funk_중급.pdf"},
  {id:"score_mvd75i7l_0iqf1t",file:"The Rose (더로즈) - Utopia_중급.pdf"},
  {id:"score_mvd75i7m_m5v8pb",file:"mgk  - vampire diaries_고급.pdf"},
  {id:"score_mvd75i7l_s4m2ea",file:"Lady Gaga - Vanish Into You_중급_0001.pdf"},
  {id:"score_mvd75i7o_7mxrrc",file:"Xdinary Heroes -  Voyager_프로.pdf"},
  {id:"score_mvd75i7l_5dftvy",file:"Green Day - Wake Me Up When September Ends_초중급.pdf"},
  {id:"score_mvd75i7m_363ip4",file:"Shut Up and Dance - WALK THE MOON_고급.pdf"},
  {id:"score_mvd75i7m_m4eri0",file:"Xdinary Heroes - Walking to the Moon_고급.pdf"},
  {id:"score_mvd75i7o_grpf7d",file:"BABYMONSTER - We go up_프로.pdf"},
  {id:"score_mvd75i7n_69caxn",file:"My Chemical Romance - Welcome To The Black Parade_고급.pdf"},
  {id:"score_mvd75i7o_dgmwc3",file:"Day6 - Welcome To The Show_고급.pdf"},
  {id:"score_mvd75i7k_7dvz5v",file:"[초중급3] DAY6 - Welcome To The Show.pdf"},
  {id:"score_mvd75i7n_vccctv",file:"헌트릭스 - What It Sounds Like_고급.pdf"},
  {id:"score_mvd75i7m_elbnp4",file:"People R Ugly - What's Up_고급.pdf"},
  {id:"score_mvd75i7l_iy15z0",file:"권진아 - White Wine_중급.pdf"},
  {id:"score_mvd75i7k_dwywji",file:"수호 - Who Are You _초급.pdf"},
  {id:"score_mvd75i7m_124ujj",file:"원필 (DAY6) - Wish_고급.pdf"},
  {id:"score_mvd75i7l_t2whoc",file:"임영웅 - Wonderful Life_중급.pdf"},
  {id:"score_mvd75i7l_3respl",file:"ONEUS(원어스) - X_중급.pdf"},
  {id:"score_mvd75i7m_a59xw1",file:"Xdinary Heroes - X room_고급.pdf"},
  {id:"score_mvd75i7n_f3123f",file:"IVE (아이브) - XOXZ_고급.pdf"},
  {id:"score_mvd75i7l_21xjap",file:"ALLDAY PROJECT - You And I_중급.pdf"},
  {id:"score_mvd75i7n_b7vdkm",file:"Saja Boys - Your Idol_고급.pdf"},
  {id:"score_mvd75i7l_pi9l9v",file:"QWER - Yours Sincerely_중급.pdf"},
  {id:"score_mvd75i7o_mt8eyt",file:"Dragon Pony (드래곤포니) - Zombie_프로_0001.pdf"},
  {id:"score_mvd75i7n_mr6daj",file:"DK(디셈버) - 가만히 눈을 감고_고급.pdf"},
  {id:"score_mvd75i7l_iwb9t9",file:"3. 초중급 바이브 - 가을 타나봐.pdf"},
  {id:"score_mvd75i7l_vv6rna",file:"한동근 - 가질 수 없는 너_중급.pdf"},
  {id:"score_mvd75i7n_pcrbzg",file:"육성재 - 거짓말_고급.pdf"},
  {id:"score_mvd75i7m_dpyyhn",file:"들개들 - 걱정말아요 그대_고급.pdf"},
  {id:"score_mvd75i7n_tm797k",file:"고추잠자리 - 걸어줄래_고급.pdf"},
  {id:"score_mvd75i7o_6i1p8m",file:"QWER - 검색어는 QWER_프로.pdf"},
  {id:"score_mvd75i7m_ank04a",file:"한로로(HANRORO) - 게임 오버_고급.pdf"},
  {id:"score_mvd75i7l_6zufk7",file:"순순희(기태), 신예영 - 결혼_중급.pdf"},
  {id:"score_mvd75i7l_9xibpi",file:"하현상 - 고양이_초중급.pdf"},
  {id:"score_mvd75i7l_0gt6ln",file:"메카니즘 - 고장난 타임머신_초중급.pdf"},
  {id:"score_mvd75i7m_6h3msa",file:"원위 - 관람차_고급.pdf"},
  {id:"score_mvd75i7n_l5ho9d",file:"진 - 구름과 떠나는 여행_고급.pdf"},
  {id:"score_mvd75i7m_vstu03",file:"이하이 - 구원자(Feat. B.I)_고급.pdf"},
  {id:"score_mvd75i7o_5evvb2",file:"[고급7] 대성 - 그 시절의 우리.pdf"},
  {id:"score_mvd75i7l_1ggyv8",file:"[중급6] 대성 - 그 시절의 우리.pdf"},
  {id:"score_mvd75i7l_2er7jv",file:"이창섭 - 그 자리에, 그 시간에_중급.pdf"},
  {id:"score_mvd75i7n_fd85go",file:"투모로우바이투게더 - 그날이 오면_고급.pdf"},
  {id:"score_mvd75i7n_9w5as5",file:"박혜원 - 그대가 분다_고급.pdf"},
  {id:"score_mvd75i7n_ng7h5i",file:"전상근 - 그대라는 사치_고급.pdf"},
  {id:"score_mvd75i7n_k1no3b",file:"신해철 - 그대에게_고급.pdf"},
  {id:"score_mvd75i7m_hcn73j",file:"임영웅 - 그댈 위한 멜로디_고급.pdf"},
  {id:"score_mvd75i7n_e13dys",file:"10CM - 그라데이션 (Hard).pdf"},
  {id:"score_mvd75i7n_7c8br4",file:"유회승(엔플라잉)-그랬나봐_가사_0001.pdf"},
  {id:"score_mvdt1rmv_lddvni",file:"AKMU - 기쁨, 슬픔, 아름다운 마음_초중급.pdf"},
  {id:"score_mvd75i7o_vs6ojk",file:"ONEWE(원위) - 기억 세탁소_프로.pdf"},
  {id:"score_mvd75i7o_7pmmkn",file:"드래곤 포니 - 꼬리를 먹는 뱀_프로.pdf"},
  {id:"score_mvd75i7n_cgnjgn",file:"이창섭 - 꽃이 되어줄게_고급.pdf"},
  {id:"score_mvd75i7m_xgljve",file:"태연 - 꿈_고급.pdf"},
  {id:"score_mvd75i7l_uckh5e",file:"잔나비-꿈과 책과 힘과 벽_중급.pdf"},
  {id:"score_mvd75i7l_6f62b4",file:"도드리 - 꿈만 같았다_중급.pdf"},
  {id:"score_mvd75i7n_rbnvpq",file:"Xdinary Heroes - 꿈을 꾸는 소녀_고급.pdf"},
  {id:"score_mvd75i7n_0pjc0p",file:"DAY6 - 꿈의 버스_고급.pdf"},
  {id:"score_mvd75i7l_zigh7k",file:"테이(Tei) - 끝사랑_중급 쉬운악보.pdf"},
  {id:"score_mvd75i7m_qmlzda",file:"테이(Tei) - 끝사랑_고급.pdf"},
  {id:"score_mvd75i7k_ag4zb8",file:"[초중급3] YB - 나는 나비.pdf"},
  {id:"score_mvd75i7l_y48j6u",file:"[중급5] YB - 나는 나비.pdf"},
  {id:"score_mvd75i7n_i9nao9",file:"임영웅 - 나는야 HERO_고급.pdf"},
  {id:"score_mvd75i7n_ohhlpe",file:"7, 고급 고유진 - 나만의 슬픔.pdf"},
  {id:"score_mvd75i7k_99v6i7",file:"경서 - 나의 X에게_초급.pdf"},
  {id:"score_mvd75i7o_f61dd3",file:"ONEWE(원위) - 나의 계절 봄은 끝났다_프로.pdf"},
  {id:"score_mvd75i7n_vuy5k1",file:"재쓰비 - 나의 여름 설명서_고급.pdf"},
  {id:"score_mvd75i7m_27w5z2",file:"한결 (HANGYEOL) - 나의 우주_고급.pdf"},
  {id:"score_mvd75i7m_9hjv1l",file:"H1-KEY(하이키) - 나의 첫사랑에게_고급.pdf"},
  {id:"score_mvd75i7m_ao3xx7",file:"나상현씨밴드- 낙원_고급.pdf"},
  {id:"score_mvd75i7o_tgxk3x",file:"LUCY - 낙화_프로.pdf"},
  {id:"score_mvd75i7n_w8hnl1",file:"이승열 - 날아_고급.pdf"},
  {id:"score_mvd75i7o_x6pmid",file:"DAY6 (데이식스) - 날아라! 드림라이더_프로.pdf"},
  {id:"score_mvd75i7m_i3i61o",file:"보라미유 - 내 마음이 움찔했던 순간_고급.pdf"},
  {id:"score_mvd75i7m_y213wp",file:"아이유 - 내 손을 잡아_고급.pdf"},
  {id:"score_mvd75i7n_60kvbi",file:"주호 - 내가 아니라도 (Hard).pdf"},
  {id:"score_mvd75i7n_n30jpk",file:"XIA (준수) - 내가 죽으려고 생각한 것은_고급.pdf"},
  {id:"score_mvd75i7n_olf7ab",file:"경서예지 - 내일이 찾아오면_고급.pdf"},
  {id:"score_mvd75i7m_36myvh",file:"최상엽(LUCY) - 내일이 찾아오면_고급.pdf"},
  {id:"score_mvd75i7l_kbtusq",file:"경서,주시크 - 너를 생각해_중급.pdf"},
  {id:"score_mvd75i7l_etfxbe",file:"황인욱 - 너를 위해_중급.pdf"},
  {id:"score_mvd75i7n_8sswp6",file:"이창섭,터치드 - 너를 위해 부른다_고급.pdf"},
  {id:"score_mvd75i7m_02zxft",file:"김남길 - 너에게 가고 있어_고급.pdf"},
  {id:"score_mvd75i7o_po9vrs",file:"LUCY - 너에게 가고 있어_프로.pdf"},
  {id:"score_mvd75i7k_gh03wn",file:"[초중급3] 자전거 탄 풍경 - 너에게 난 나에게 넌.pdf"},
  {id:"score_mvd75i7l_irshng",file:"[중급5] 자전거 탄 풍경 - 너에게 난 나에게 넌.pdf"},
  {id:"score_mvd75i7m_m4gsid",file:"[고급7] 자전거 탄 풍경 - 너에게 난 나에게 넌.pdf"},
  {id:"score_mvd75i7l_s44338",file:"한로로 - 너와 나_중급.pdf"},
  {id:"score_mvd75i7m_rd6dbn",file:"울랄라세션 - 너와 함께_고급.pdf"},
  {id:"score_mvd75i7m_vigmbo",file:"재쓰비(JAESSBEE) - 너와의 모든 지금_고급.pdf"},
  {id:"score_mvd75i7n_42qu9u",file:"이승기 - 너의 곁에 내가_고급.pdf"},
  {id:"score_mvd75i7o_2fw5t7",file:"소란 - 너의 등장_프로.pdf"},
  {id:"score_mvd75i7l_i9hl4w",file:"도겸 - 너인데_중급.pdf"},
  {id:"score_mvd75i7n_r1nl92",file:"이준영 - 널 그리며_고급.pdf"},
  {id:"score_mvd75i7o_m9laa7",file:"유다빈밴드 - 노래는 불빛처럼 달린다_프로.pdf"},
  {id:"score_mvd75i7n_3w68iv",file:"다비치 - 노래할래요_고급.pdf"},
  {id:"score_mvd75i7k_5k53r9",file:"[초중급3] BIG Naughty (서동현) - 노스탈지아.pdf"},
  {id:"score_mvd75i7o_e0a9tq",file:"DAY6 - 녹아내려요_고급.pdf"},
  {id:"score_mvd75i7m_neajgx",file:"먼데이 키즈 , 이홍기 (FT아일랜드) - 눈물이 더 가까운 사람 (2026)_고급.pdf"},
  {id:"score_mvd75i7n_y5soqe",file:"QWER - 눈물참기_고급.pdf"},
  {id:"score_mvd75i7m_a43a97",file:"율(YUL)-눈물편지_고급.pdf"},
  {id:"score_mvd75i7m_nnmcyp",file:"Wanna One (워너원) - 다시, 봄바람_고급.pdf"},
  {id:"score_mvd75i7m_8fbhsg",file:"경서 예지, 전건호 - 다정히 내 이름을 부르면_고급.pdf"},
  {id:"score_mvd75i7n_rgnkr3",file:"허각 - 단_고급.pdf"},
  {id:"score_mvd75i7n_nky2vm",file:"로이킴 - 달리 표현할 수 없어요_고급.pdf"},
  {id:"score_mvd75i7n_i8529t",file:"고윤정, 신시아, 강유석, 한예지 - 달리기_고급.pdf"},
  {id:"score_mvd75i7n_on0ie9",file:"터치드 - 달춤_고급.pdf"},
  {id:"score_mvd75i7n_u8p784",file:"임영웅 - 답장을 보낸지_고급.pdf"},
  {id:"score_mvd75i7o_t6spxo",file:"이보람 - 당신을 위하여_프로.pdf"},
  {id:"score_mvd75i7l_krr0th",file:"임영웅 - 돌아보지 마세요_중급.pdf"},
  {id:"score_mvd75i7n_h82463",file:"황가람 - 돌아오지 않을 시간_고급.pdf"},
  {id:"score_mvd75i7l_u09cd3",file:"부활 - 돛에 부는 바람_중급.pdf"},
  {id:"score_mvd75i7n_0nl3gn",file:"DAY6 (데이식스) - 드디어 끝나갑니다_고급.pdf"},
  {id:"score_mvd75i7n_w4o480",file:"임영웅 - 들꽃이 될게요_고급.pdf"},
  {id:"score_mvd75i7n_6xrydh",file:"노을 - 들리나요_고급.pdf"},
  {id:"score_mvd75i7l_jlw4fi",file:"순순희(기태) , 백예슬 - 떠나가요, 떠나지마요_중급.pdf"},
  {id:"score_mvd75i7o_1hmxea",file:"BLACKPINK - 뛰어(JUMP)_프로.pdf"},
  {id:"score_mvd75i7m_nxlywc",file:"태연 (TAEYEON) - 만찬가_고급.pdf"},
  {id:"score_mvd75i7m_6ra1j8",file:"LUCY - 메아리_고급.pdf"},
  {id:"score_mvd75i7l_fbbpjr",file:"DAY6 - 메이플라떼_초중급.pdf"},
  {id:"score_mvd75i7m_ooj7pq",file:"쏜애플 - 멸종_고급.pdf"},
  {id:"score_mvd75i7l_hhknlt",file:"이찬혁 - 멸종위기사랑_초중급.pdf"},
  {id:"score_mvd75i7m_ucq2b2",file:"도겸 (DK) - 명장면_고급.pdf"},
  {id:"score_mvd75i7n_z0zo9s",file:"잔나비 - 미소를 띄우며 나를 보낸 그 모습처럼_고급.pdf"},
  {id:"score_mvd75i7m_sxxw1k",file:"황가람 - 미치게 그리워서_중급.pdf"},
  {id:"score_mvd75i7m_efd17i",file:"송하예 - 바다 가자 (2026)_고급.pdf"},
  {id:"score_mvd75i7l_gamnvp",file:"송하예 - 바다 가자 (2026) (중급,6)_0001.pdf"},
  {id:"score_mvd75i7l_aoq4dr",file:"DAY6 - 바래 Wish_중급 쉬운악보.pdf"},
  {id:"score_mvd75i7m_12o024",file:"DAY6 - 바래 Wish_고급.pdf"},
  {id:"score_mvd75i7n_q8y6yl",file:"BIG Naughty (서동현) - 바이 바이 (Feat. 이무진)_고급.pdf"},
  {id:"score_mvd75i7o_bc2pj6",file:"KickFlip(킥플립) - 반창고_프로.pdf"},
  {id:"score_mvd75i7n_pbw43n",file:"DK(디셈버) - 발걸음_고급.pdf"},
  {id:"score_mvd75i7n_3l1qlz",file:"7, 고급 비비(BIBI) - 밤양갱_0001.pdf"},
  {id:"score_mvd75i7m_zeb0oh",file:"원필(WONPIL) - 백만송이는 아니지만_고급.pdf"},
  {id:"score_mvd75i7n_5p5idd",file:"이무진 - 뱁새_고급.pdf"},
  {id:"score_mvd75i7m_d3jo58",file:"김민석 (멜로망스) - 버릇처럼 셋을 센다_고급.pdf"},
  {id:"score_mvd75i7l_sokjk8",file:"김민석 (멜로망스) - 버릇처럼 셋을 센다_중급 쉬운버전_0001.pdf"},
  {id:"score_mvd75i7l_f3oco2",file:"Stray Kids - 별, 빛 (STAY)_중급_0001.pdf"},
  {id:"score_mvd75i7k_obpepa",file:"DAY6(데이식스) - 별들 앞에서_초급.pdf"},
  {id:"score_mvd75i7n_zbhnln",file:"경서예지 - 별빛달빛_고급.pdf"},
  {id:"score_mvd75i7m_gtjmxn",file:"투모로우바이투게더 - 별의 노래_고급.pdf"},
  {id:"score_mvd75i7o_rjsj4g",file:"허용별 (허각, 신용재, 임한별) - 별의 순간_프로.pdf"},
  {id:"score_mvd75i7n_qhbtxc",file:"임창정 - 보고 싶지 않은 니가 보고 싶다_고급.pdf"},
  {id:"score_mvd75i7n_3yss47",file:"다이나믹 듀오,TEAM 보스 -보스_고급pdf.pdf"},
  {id:"score_mvd75i7l_8zg92n",file:"AKMU - 봄 색깔_중급.pdf"},
  {id:"score_mvd75i7o_xqj2zw",file:"김뭉먕 - 부아앙_프로.pdf"},
  {id:"score_mvd75i7l_gplcug",file:"DK - 부탁_중급.pdf"},
  {id:"score_mvd75i7o_x05w65",file:"Xdinary Heroes - 불꽃놀이의 밤_프로.pdf"},
  {id:"score_mvd75i7l_jh1aqx",file:"예빛 - 불안한 내 맘 달랠 곳은 너밖에 없어_중급.pdf"},
  {id:"score_mvd75i7l_7iw1vo",file:"임영웅 - 비가 와서_중급.pdf"},
  {id:"score_mvd75i7n_mrgqzo",file:"폴킴 - 비라도 내렸으면 좋겠어_고급.pdf"},
  {id:"score_mvd75i7o_kdbu0b",file:"이홍기 - 비오니까_프로.pdf"},
  {id:"score_mvd75i7k_r9rq5x",file:"[초급2] 한로로 (HANRORO) - 비틀비틀 짝짜꿍.pdf"},
  {id:"score_mvd75i7l_vn5pbe",file:"[중급6] 한로로 (HANRORO) - 비틀비틀 짝짜꿍.pdf"},
  {id:"score_mvd75i7l_yny5x1",file:"한해 문세윤 - 비행기_중급(easy).pdf"},
  {id:"score_mvd75i7m_9wy52a",file:"Stray Kids - 삐처리 BLEEP_고급.pdf"},
  {id:"score_mvd75i7k_esk4nj",file:"[중급6] 이창섭 - 사계, 그리고 너.pdf"},
  {id:"score_mvd75i7m_ltoj15",file:"소란 - 사과 하나를 그려_고급.pdf"},
  {id:"score_mvd75i7l_excxo0",file:"조째즈 - 사랑(LOVE)_중급.pdf"},
  {id:"score_mvd75i7l_bf6v9m",file:"규현 - 사랑은 말로 표현하는게 아니래요_중급.pdf"},
  {id:"score_mvd75i7n_kg4zsn",file:"LUCY - 사랑은 어쩌고_고급.pdf"},
  {id:"score_mvd75i7n_epl859",file:"10CM - 사랑은 여섯줄_고급.pdf"},
  {id:"score_mvd75i7n_uvkis0",file:"이아영 - 사랑을 할 순 없어도 그리울 순 있잖아요_고급.pdf"},
  {id:"score_mvd75i7l_xs7tn6",file:"더 넛츠 (The Nuts) - 사랑의 바보 (2025)_초중급.pdf"},
  {id:"score_mvd75i7m_ssefka",file:"멜로망스 - 사랑의 언어_고급.pdf"},
  {id:"score_mvd75i7n_htrspu",file:"멜로망스 - 사랑인가봐_고급.pdf"},
  {id:"score_mvd75i7l_7qo6qn",file:"한로로-사랑하게 될 거야_중급.pdf"},
  {id:"score_mvd75i7l_s4mxon",file:"정승환 - 사랑한다 말할 수 있을까_중급.pdf"},
  {id:"score_mvd75i7l_9i83l4",file:"윤도현 - 사랑했나봐_초중급.pdf"},
  {id:"score_mvd75i7m_7xsfgl",file:"[고급7] 국악딴따라 - 살아보니 그렇더라.pdf"},
  {id:"score_mvd75i7l_guwhej",file:"[중급5] 국악딴따라 - 살아보니 그렇더라.pdf"},
  {id:"score_mvd75i7l_nbrkjt",file:"넬 (NELL) - 상실의 관성_중급.pdf"},
  {id:"score_mvd75i7m_vs2ie1",file:"FT아일랜드(FTISLAND)-새들처럼_고급.pdf"},
  {id:"score_mvd75i7l_wtf6s1",file:"ASH ISLAND(애쉬 아일랜드) - 생각이 나서_초중급.pdf"},
  {id:"score_mvd75i7l_w3g7r5",file:"순순희 - 세 친구_중급.pdf"},
  {id:"score_mvd75i7n_2cqu6v",file:"보라미유 - 세상 모든 어른이들에게_고급.pdf"},
  {id:"score_mvd75i7m_8tz7u9",file:"H1-KEY(하이키) - 세상은 영화 같지 않더라_고급.pdf"},
  {id:"score_mvd75i7l_nabp0a",file:"황가람 - 세상이 그대를 속일지라도_초중급.pdf"},
  {id:"score_mvd75i7l_cq8bkq",file:"[중급6] QWER - 소년만화.pdf"},
  {id:"score_mvd75i7m_qvu3qg",file:"[고급8] QWER - 소년만화.pdf"},
  {id:"score_mvd75i7k_9mwv3z",file:"[초중급4] QWER - 소년만화.pdf"},
  {id:"score_mvd75i7k_3os4hu",file:"쏜애플(THORNAPPLE) - 쇠퇴론_고급.pdf"},
  {id:"score_mvd75i7o_55c673",file:"쏜애플 - 수성의 하루 프로_.pdf"},
  {id:"score_mvd75i7l_a0x0hi",file:"임영웅 - 순간을 영원처럼_중급.pdf"},
  {id:"score_mvd75i7l_b154ja",file:"MJ (써니사이드) - 순애보, 12월 이야기 (Feat. 김레전드)_중급.pdf"},
  {id:"score_mvd75i7m_5fag07",file:"로이킴 - 스물다섯 스물하나_고급.pdf"},
  {id:"score_mvd75i7n_buihdb",file:"전상근 - 슬픈 거짓말_고급.pdf"},
  {id:"score_mvd75i7l_szd2fm",file:"순순희 - 슬픈 초대장_중급.pdf"},
  {id:"score_mvd75i7m_3q2zb7",file:"잔나비 - 슬픔이여안녕_고급.pdf"},
  {id:"score_mvd75i7o_y87xhg",file:"쏜애플 - 시퍼런 봄_고급.pdf"},
  {id:"score_mvd75i7n_ntnbro",file:"Stray Kids - 신선 놀음_고급.pdf"},
  {id:"score_mvd75i7m_j5d40b",file:"V.O.S - 신촌을 못가_고급.pdf"},
  {id:"score_mvd75i7l_i4ylf7",file:"포스트맨 - 신촌을 못가_초중급.pdf"},
  {id:"score_mvd75i7m_sh54rn",file:"이무진 - 신호등_고급.pdf"},
  {id:"score_mvd75i7n_rf41fu",file:"고추잠자리 - 씨앗_고급.pdf"},
  {id:"score_mvd75i7o_jougfn",file:"Dragon Pony (드래곤포니) - 아 마음대로 다 된다!_프로.pdf"},
  {id:"score_mvd75i7l_9xiwc6",file:"조정석 - 아로하_초중급.pdf"},
  {id:"score_mvd75i7l_jbzgc9",file:"잔나비 - 아름다운 꿈_초중급.pdf"},
  {id:"score_mvd75i7n_iqu7d8",file:"2am - 아름다운 날들_고급.pdf"},
  {id:"score_mvd75i7o_8x4xm0",file:"허각 - 아름다운 사실_프로.pdf"},
  {id:"score_mvd75i7m_30dqa4",file:"LUCY - 아지랑이_고급.pdf"},
  {id:"score_mvd75i7n_weow5y",file:"김나영 - 아직 난 그날에 살아_0001.pdf"},
  {id:"score_mvd75i7l_iqo5wv",file:"우기 - 아프다_중급.pdf"},
  {id:"score_mvd75i7n_w7ck3o",file:"킥플립 - 악몽을 꿨던 건 비밀이지만_고급.pdf"},
  {id:"score_mvd75i7l_akxev7",file:"BIG Naughty (서동현) - 안녕_중급.pdf"},
  {id:"score_mvd75i7n_z4oebl",file:"임영웅 - 알겠어요 미안해요_고급.pdf"},
  {id:"score_mvd75i7m_ypr8aq",file:"쏜애플(THORNAPPLE) - 야광_고급.pdf"},
  {id:"score_mvd75i7m_7zns3t",file:"원필(WONPIL) - 어른이 되어 버렸다_고급.pdf"},
  {id:"score_mvd75i7n_jcs9p5",file:"Xdinary Heroes - 어리고 부끄럽고 바보 같은_고급.pdf"},
  {id:"score_mvd75i7l_hh0e0b",file:"우디 - 어제보다 슬픈 오늘_중급.pdf"},
  {id:"score_mvd75i7l_whl6an",file:"유다빈밴드 - 어지러워_초중급.pdf"},
  {id:"score_mvd75i7l_nznvao",file:"미도와 파라솔 - 언젠가 눈부시게 빛날 테니_초중급.pdf"},
  {id:"score_mvd75i7m_pqmvt4",file:"Stray Kids - 엉망_고급.pdf"},
  {id:"score_mvd75i7o_vd35rq",file:"H1-KEY(하이키) - 여름이었다_프로.pdf"},
  {id:"score_mvd75i7k_o30zrm",file:"볼빨간사춘기 - 여행_초급.pdf"},
  {id:"score_mvd75i7l_d9lvmp",file:"윤하(YOUNHA) - 염라_프로.pdf"},
  {id:"score_mvd75i7m_03p0as",file:"DAY6(데이식스) - 예뻤어(You Were Beautiful)_중급.pdf"},
  {id:"score_mvd75i7l_gfoos7",file:"조째즈 - 오늘 밤은 취해 볼게요_중급.pdf"},
  {id:"score_mvd75i7m_jjb0dw",file:"스탠딩 에그 - 오래된 노래_고급.pdf"},
  {id:"score_mvd75i7k_8ha3m1",file:"악동뮤지션 - 오랜 날 오랜 밤_초중급.pdf"},
  {id:"score_mvd75i7m_j555c6",file:"윤하(YOUNHA) - 오르트구름_고급.pdf"},
  {id:"score_mvd75i7l_0tdr3b",file:"윤하(YOUNHA) - 오르트구름_중급 쉬운악보.pdf"},
  {id:"score_mvd75i7n_f4p0rt",file:"유주 (YUJU) - 오리온자리 (Live)_고급.pdf"},
  {id:"score_mvd75i7m_8pjedv",file:"잔나비 - 외딴섬 로맨틱_고급.pdf"},
  {id:"score_mvd75i7n_jiflx2",file:"전건호- 우리가 사랑한 모든 날들_고급.pdf"},
  {id:"score_mvd75i7n_skl8y2",file:"브라운 아이드 소울 - 우리들의 순간_고급.pdf"},
  {id:"score_mvd75i7n_3sxfgr",file:"임영웅 - 우리에게 안녕_고급.pdf"},
  {id:"score_mvd75i7m_0gwhsz",file:"어반자카파 - 우리의 겨울_고급.pdf"},
  {id:"score_mvd75i7n_3lxpi4",file:"DAY6 - 우리의 계절_고급.pdf"},
  {id:"score_mvd75i7l_8s2x41",file:"이예은, 아샤트리 - 울어_중급.pdf"},
  {id:"score_mvd75i7o_kpdq1y",file:"세븐틴 - 음악의 신_프로_0001.pdf"},
  {id:"score_mvd75i7n_9qhu8c",file:"BIG Naughty (서동현) - 응급실_고급.pdf"},
  {id:"score_mvd75i7o_c2mi6f",file:"Young K - 응원가 (Anthem)_프로.pdf"},
  {id:"score_mvd75i7k_vrpqbf",file:"[중급5] 아이유(IU) - 이 별로부터.pdf"},
  {id:"score_mvd75i7n_poo5dq",file:"탑현 - 이것도 사랑이니_고급.pdf"},
  {id:"score_mvd75i7l_w87bei",file:"H.Y.B.(허용별 (허각, 신용재, 임한별)) - 이게 뭐냔 말이야_중급.pdf"},
  {id:"score_mvd75i7o_2xrdgv",file:"조유리 - 이제 안녕_프로.pdf"},
  {id:"score_mvd75i7l_5c2pym",file:"전건호 - 이제는 어떻게 사랑을 하나요_중급.pdf"},
  {id:"score_mvd75i7l_445jtb",file:"육성재 - 이제야_중급.pdf"},
  {id:"score_mvd75i7o_l0y9ya",file:"로이킴 - 있는 모습 그대로_고급.pdf"},
  {id:"score_mvd75i7n_2e47d5",file:"허각 - 있어줘요_고급.pdf"},
  {id:"score_mvd75i7k_58d9s5",file:"BOYNEXTDOOR(보이넥스트도어) - 있잖아_초급.pdf"},
  {id:"score_mvd75i7m_izh7k1",file:"KCM - 잊혀져 가더라_고급.pdf"},
  {id:"score_mvd75i7l_jw9qj8",file:"FT아일랜드 - 작은 나보다 커다란 세상이 문을 열어 줄 것 같아_중급.pdf"},
  {id:"score_mvd75i7l_do4yfg",file:"[중급5] 엔플라잉 (N.Flying) - 잔불 (Still).pdf"},
  {id:"score_mvd75i7m_shhkq9",file:"[고급7] 엔플라잉 (N.Flying) - 잔불 (Still).pdf"},
  {id:"score_mvd75i7k_mtscf0",file:"[초중급3] 엔플라잉 (N.Flying) - 잔불 (Still).pdf"},
  {id:"score_mvd75i7m_9pd776",file:"한로로 (HANRORO) - 잔혹한 천사의 테제_고급(easy).pdf"},
  {id:"score_mvd75i7l_u5i7yj",file:"한로로 (HANRORO) - 잔혹한 천사의 테제_중급(easy).pdf"},
  {id:"score_mvd75i7n_uyv6p6",file:"산들 - 잘 됐으면 좋겠다_고급.pdf"},
  {id:"score_mvd75i7l_k6pp4c",file:"황인욱 - 잘하고 있어_중급.pdf"},
  {id:"score_mvd75i7l_4iotw2",file:"하현상 - 장마_중급.pdf"},
  {id:"score_mvd75i7l_80ed1z",file:"[중급5] 한로로 (HANRORO) - 재 (Ashes).pdf"},
  {id:"score_mvd75i7m_als7ua",file:"[고급7] 한로로 (HANRORO) - 재 (Ashes).pdf"},
  {id:"score_mvd75i7n_w1u797",file:"7, 고급 달담 - 졸업_0001.pdf"},
  {id:"score_mvd75i7m_vovakl",file:"윤종신 - 좋니_고급.pdf"},
  {id:"score_mvd75i7m_s4nkkr",file:"DAY6 - 좋아합니다_고급.pdf"},
  {id:"score_mvd75i7m_9f3w22",file:"민경훈 - 죄_고급.pdf"},
  {id:"score_mvd75i7n_tys6bs",file:"이창섭 - 주르르_고급.pdf"},
  {id:"score_mvd75i7m_w3wjpe",file:"잔나비 - 주저하는 연인들을 위해_고급.pdf"},
  {id:"score_mvd75i7m_2yzxny",file:"임재현 - 중독된 사랑_중급.pdf"},
  {id:"score_mvd75i7o_rmrteq",file:"드래곤포니 - 지구소년_프로.pdf"},
  {id:"score_mvd75i7l_ew3okv",file:"김재환 - 지금 데리러 갈게_중급.pdf"},
  {id:"score_mvd75i7n_zc6dsi",file:"폴킴 - 지금 이대로도 좋아_고급.pdf"},
  {id:"score_mvd75i7m_ob5l5e",file:"박재정, 설윤 - 지금 이대로만_고급.pdf"},
  {id:"score_mvd75i7n_6nct5o",file:"Hebi - 지금부터_고급.pdf"},
  {id:"score_mvd75i7n_eeewne",file:"박진주 -  질풍가도_고급.pdf"},
  {id:"score_mvd75i7l_c0pqjh",file:"치즈 - 집데이트_중급.pdf"},
  {id:"score_mvd75i7l_t4565u",file:"범진 - 집으로_초중급.pdf"},
  {id:"score_mvd75i7o_1divwz",file:"최예나 - 착하다는 말이 제일 싫어_프로.pdf"},
  {id:"score_mvd75i7n_2vy0nn",file:"배기성 - 참 다행이야_고급.pdf"},
  {id:"score_mvd75i7l_8d7f3a",file:"[중급6] FTISLAND (FT아일랜드) - 처음 그 날처럼.pdf"},
  {id:"score_mvd75i7m_g45qrw",file:"[고급8] FTISLAND (FT아일랜드) - 처음 그 날처럼.pdf"},
  {id:"score_mvd75i7k_k90oak",file:"[초중급4] FTISLAND (FT아일랜드) - 처음 그 날처럼.pdf"},
  {id:"score_mvd75i7n_k04wii",file:"이창섭 - 천상연_고급.pdf"},
  {id:"score_mvd75i7o_ovzahj",file:"캔트비블루 - 첫 눈에 널 사랑할 수는 없었을까_프로.pdf"},
  {id:"score_mvd75i7l_2sedpq",file:"허각 - 첫눈이 오면 잊을 수 있을까_중급.pdf"},
  {id:"score_mvd75i7n_zja63b",file:"잔나비 - 첫사랑은 안녕히_고급.pdf"},
  {id:"score_mvd75i7n_dcqs60",file:"윤마치 - 초록_고급.pdf"},
  {id:"score_mvd75i7n_oqn8bz",file:"현서 (HYUN SEO) - 최선이었다_고급.pdf"},
  {id:"score_mvd75i7o_w4qul0",file:"유다빈밴드 - 축배_프로.pdf"},
  {id:"score_mvd75i7k_1yvebq",file:"[초급2] 가을방학 - 취미는 사랑.pdf"},
  {id:"score_mvd75i7n_1mq5h5",file:"펭수 - 콩국수_고급.pdf"},
  {id:"score_mvd75i7o_yjrydm",file:"다비치 - 타임캡슐_프로.pdf"},
  {id:"score_mvd75i7n_85ydml",file:"딘딘 - 태양은 가득히_고급.pdf"},
  {id:"score_mvd75i7k_soytoa",file:"[초급2] 소연-퇴사할게여.pdf"},
  {id:"score_mvd75i7n_uyj2b4",file:"7, 고급 윤하 - 포인트 니모_0001.pdf"},
  {id:"score_mvd75i7m_h6dyhi",file:"쏜애플(THORNAPPLE) - 플라네타리움_고급.pdf"},
  {id:"score_mvd75i7l_xx2qvi",file:"수지 - 하루_초중급.pdf"},
  {id:"score_mvd75i7m_sbxl8h",file:"TXT(투모로우바이투게더) - 하루에 하루만 더_고급.pdf"},
  {id:"score_mvd75i7o_e73wvn",file:"LUCY - 하마_고급.pdf"},
  {id:"score_mvd75i7n_z0x8ju",file:"대성 - 한도초과_고급.pdf"},
  {id:"score_mvd75i7n_ina27t",file:"신용재 - 한숨_고급.pdf"},
  {id:"score_mvd75i7n_ogo1zc",file:"솔지 - 한없이 아름다운 너를 만나_고급.pdf"},
  {id:"score_mvd75i7o_a9yhmc",file:"유다빈밴드 - 항해_프로.pdf"},
  {id:"score_mvd75i7n_sei8sd",file:"DAY6 (데이식스) - 해야 뜨지 말아 줘_고급.pdf"},
  {id:"score_mvd75i7n_kquzqh",file:"QWER - 행복해져라 (캐롤 Ver.)_고급_0001.pdf"},
  {id:"score_mvd75i7k_det3zm",file:"[초급2] DAY6 - 행복했던 날들이었다.pdf"},
  {id:"score_mvd75i7m_x8x47y",file:"박재정 - 헤어지자 말해요_고급.pdf"},
  {id:"score_mvd75i7l_7nxot7",file:"쌍문동 아이들 - 혜화동 (혹은 쌍문동)_중급.pdf"},
  {id:"score_mvd75i7l_4slgyn",file:"하현상 - 화분_중급.pdf"},
  {id:"score_mvd75i7o_9wdnix",file:"김동률 - 황금가면_프로.pdf"},
  {id:"score_mvd75i7o_r0lnbr",file:"음율 - 흑백논리_프로.pdf"},
  {id:"score_mvd75i7l_mzwngv",file:"장범준 - 흔들리는 꽃들 속에서 네 샴푸향이 느껴진거야_중급.pdf"},
  {id:"score_mvd75i7m_idqzd4",file:"음율 - 희비교차_고급.pdf"},
  {id:"score_mvd75i7m_3kmd8a",file:"Vaundy - 呼び声(부르는 소리, 요비고에)_고급.pdf"}
];

/* ============================================================
   PDF 추가 매칭 업로드 (2026-10-19 추가)
   2026-10-18 지난 매칭 작업 이후, 반진영님이 직접 검토해서 확정해둔 매칭표
   (매칭검토표(수정).numbers)를 기준으로 다시 정리한 것이다. 이 중:
   - SCORE_PDF_MAPPING_CONFIRM: 확실하다고 판단된 매칭인데, 위 524곡 자동매칭
     때는 2등 후보와 점수 차이가 충분히 크지 않다는 이유로 빠졌던 128곡.
     524곡과 똑같은 방식(자동, 확인 없이 바로 업로드)으로 처리해도 안전하다.
   - SCORE_PDF_MAPPING_REVIEW: 제목이 비슷한 다른 곡과 섞이는 등 확신도가 낮아
     사람이 직접 봐야 하는 79곡(그중 1곡은 폴더에 파일 자체가 없음). 체크박스로
     직접 고른 것만, 미리보기로 맞는 파일인지 확인한 뒤 업로드한다.
   ============================================================ */

const SCORE_PDF_MAPPING_CONFIRM = [
  {id:"score_mvd75i7m_459dgj",file:"Mrs.GREEN APPLE - 나라는 것_고급.pdf"},
  {id:"score_mvd75i7m_124gap",file:"보라미유 - 있잖아_중급.pdf"},
  {id:"score_mvd75i7o_voxtqz",file:"유다빈밴드 - 좋지 아니한가_고급.pdf"},
  {id:"score_mvd75i7o_nzabok",file:"HEBI - 늘_고급.pdf"},
  {id:"score_mvd75i7n_6e0zf6",file:"서문탁 - 형_고급.pdf"},
  {id:"score_mvd75i7l_w6xz3d",file:"대성 - Last girl _중급.pdf"},
  {id:"score_mvd75i7n_ooy992",file:"Avril Lavigne - Young & Dumb_고급.pdf"},
  {id:"score_mvd75i7n_y1zw0k",file:"LUCY - 다급해져 (Feat. Wonstein)_고급.pdf"},
  {id:"score_mvd75i7o_3qdqm3",file:"유다빈밴드 - 오늘은 잠에 들 거예요_고급.pdf"},
  {id:"score_mvd75i7l_831pki",file:"DAY6 - 겨울이 간다 Goodbye Winter_중급.pdf"},
  {id:"score_mvd75i7o_9cy5fs",file:"원위 - 한 여름 밤 유성우_고급.pdf"},
  {id:"score_mvd75i7k_3x0scm",file:"이적 - 혼자였다_초급.pdf"},
  {id:"score_mvd75i7o_699cxg",file:"QWER - 내 이름 맑음_고급.pdf"},
  {id:"score_mvd75i7n_cf0xi1",file:"비비 (BIBI) - 밤새_고급.pdf_qr.pdf"},
  {id:"score_mvd75i7n_sk5mmz",file:"마크툽 - 시작의 아이_고급.pdf"},
  {id:"score_mvd75i7o_emnzbf",file:"원위 - 일방통행_프로.pdf"},
  {id:"score_mvd75i7o_zgyh37",file:"Benson Boone - Beautiful Things_프로.pdf"},
  {id:"score_mvd75i7l_xlxcv5",file:"Coldplay - WE PRAY_중급.pdf"},
  {id:"score_mvd75i7m_z9oio8",file:"ROSE & Bruno Mars - APT_중급.pdf"},
  {id:"score_mvd75i7m_rox9np",file:"순순희 - 그대가 내 안에 박혔다_중급.pdf"},
  {id:"score_mvd75i7n_q4kei6",file:"QWER - D-Day_고급.pdf"},
  {id:"score_mvd75i7k_061n0q",file:"에스쿱스X민규 - 5, 4, 3_초급.pdf"},
  {id:"score_mvd75i7l_qkw6we",file:"[중급4] ROSÉ - new trick.pdf"},
  {id:"score_mvd75i7n_qxfyaq",file:"Mariah Carey - Santaclaus is Coming To Town_고급.pdf"},
  {id:"score_mvd75i7o_yn2vtn",file:"원위 - 베로니카의 섬_프로.pdf"},
  {id:"score_mvd75i7o_hjs8sv",file:"QWER - OVERDRIVE_프로.pdf"},
  {id:"score_mvd75i7o_88yjuk",file:"10CM - Monday Is Coming_프로.pdf"},
  {id:"score_mvd75i7l_g9eii5",file:"LUCY - 같이 가자_중급.pdf"},
  {id:"score_mvd75i7l_6ndu7p",file:"Ed Sheern - Azizam_중급.pdf"},
  {id:"score_mvd75i7l_c6p9fd",file:"The Rose - O_중급.pdf"},
  {id:"score_mvd75i7l_ibvv4e",file:"DAY6 -끝났지_중급.pdf"},
  {id:"score_mvd75i7m_0eawn0",file:"송필근 - 숙녀에게_중급.pdf"},
  {id:"score_mvd75i7n_5d7idp",file:"잔나비- 모든 소년 소녀들 2 ,무지개_고급.pdf"},
  {id:"score_mvd75i7o_19iet6",file:"유다빈밴드-오늘이야_고급.pdf"},
  {id:"score_mvd75i7l_2jou50",file:"잔나비 - 사랑의이름으로_중급.pdf"},
  {id:"score_mvd75i7o_oco0pt",file:"10cm - 너에게 닿기를_고급.pdf"},
  {id:"score_mvd75i7m_pozyf3",file:"한해 문세윤 - 비행기_고급.pdf"},
  {id:"score_mvd75i7m_l1f29s",file:"서인국&정은지 - 커플_중급.pdf"},
  {id:"score_mvd75i7o_bhbp3f",file:"HUNTRIX - How It's Done_프로.pdf"},
  {id:"score_mvd75i7n_oiym7e",file:"Huntrix- Golden_고급.pdf"},
  {id:"score_mvd75i7m_1jg6wa",file:"쏜애플 - 로마네스크_중급.pdf"},
  {id:"score_mvd75i7l_3yz14w",file:"미도와 파라솔 - 아마추어_초중급.pdf"},
  {id:"score_mvd75i7o_uo0z27",file:"음율 - 환상주의_프로.pdf"},
  {id:"score_mvd75i7o_u8w5l3",file:"YOUNHA 윤하 - Skybound_프로.pdf"},
  {id:"score_mvd75i7l_0v8iq4",file:"원필 - 행운을 빌어줘_중급.pdf"},
  {id:"score_mvd75i7l_qaxh18",file:"I.O.I 아이오아이 - Suddenly_초중급.pdf"},
  {id:"score_mvd75i7m_53zbsa",file:"김경호 - 사랑과 우정사이_중급.pdf"},
  {id:"score_mvd75i7n_8myabf",file:"도영 - 깊은 잠_고급.pdf"},
  {id:"score_mvd75i7n_o164po",file:"도영 - 소네트_고급.pdf"},
  {id:"score_mvd75i7n_pf1c0q",file:"충주지씨 - 밀크쉐이크_고급.pdf"},
  {id:"score_mvd75i7l_yqyr94",file:"김재중 - 내 남은 사랑을 위해_중급.pdf"},
  {id:"score_mvd75i7m_hdqzkh",file:"이수현 - 푸른 산호초 (Blue Lagoon (Korean Ver.))_고급.pdf"},
  {id:"score_mvd75i7n_ef56l6",file:"먼데이키즈, 이이경 - 운명_고급.pdf"},
  {id:"score_mvd75i7o_u3wsyf",file:"자우림 - MY GIRL_프로.pdf"},
  {id:"score_mvd75i7o_tsrtdv",file:"이창섭 - 겁쟁이_고급.pdf"},
  {id:"score_mvd75i7l_z7y43a",file:"코요태 - 우리의 꿈_중급.pdf"},
  {id:"score_mvd75i7l_e970kt",file:"하현상 - Odyssey_중급.pdf"},
  {id:"score_mvd75i7m_9xgh2l",file:"먼데이 키즈 - 연_고급.pdf"},
  {id:"score_mvd75i7n_japngm",file:"AxMxP (에이엠피) - 너는 나를 시인으로 만들어_고급.pdf"},
  {id:"score_mvd75i7m_wp50rd",file:"원위- 너의 우주는_중급.pdf"},
  {id:"score_mvd75i7m_grl0hu",file:"DAY6 - 행복했던 날들이었다_중급.pdf"},
  {id:"score_mvd75i7l_gvnpwc",file:"이수현 - 푸른 산호초 (Blue Lagoon (Korean Ver.))_초중급(easy).pdf"},
  {id:"score_mvd75i7l_utqo31",file:"[중급5] 로이킴 - Sparkle (신곡, 5).pdf"},
  {id:"score_mvd75i7n_thib4a",file:"TREASURE - 고마워_고급.pdf"},
  {id:"score_mvd75i7n_fi14ak",file:"박다혜 - 시작의 아이_고급.pdf"},
  {id:"score_mvd75i7o_ghr5ea",file:"유다빈밴드 - 불_고급.pdf"},
  {id:"score_mvd75i7l_igdbhx",file:"Young Kai - Blue_초중급.pdf"},
  {id:"score_mvd75i7n_cfsaq8",file:"잔나비 - 아윌다이포유x3_고급.pdf"},
  {id:"score_mvd75i7m_m4nmbq",file:"CNBLUE (씨엔블루) - 그러나 꽃이었다_고급.pdf"},
  {id:"score_mvd75i7n_42ryj1",file:"JISOO X ZAYN - EYES CLOSED_고급.pdf"},
  {id:"score_mvd75i7o_7gt1p6",file:"이예은,아샤트리,전건호 - My Love_고급.pdf"},
  {id:"score_mvd75i7o_d079s3",file:"원위 - 꿈속에서 놓친 너, 옅은 잠결에 흐르길_프로.pdf"},
  {id:"score_mvd75i7n_l58at3",file:"화사 - Good Goodbye (with. Duomo)_고급.pdf"},
  {id:"score_mvd75i7n_jl67wv",file:"Shakira - Zoo_고급.pdf"},
  {id:"score_mvd75i7l_4seezc",file:"한로로 (HANRORO) - 00_중급.pdf"},
  {id:"score_mvd75i7l_ub0i3v",file:"Mrs. GREEN APPLE - Lilac_중급_0001.pdf"},
  {id:"score_mvd75i7o_v3d471",file:"Young K & 원필 (DAY6) - Go Beyond_프로.pdf"},
  {id:"score_mvd75i7l_ron2bw",file:"이수현 - 푸른 산호초 (Blue Lagoon (Korean Ver.))_중급(easy2).pdf"},
  {id:"score_mvd75i7o_izxqvu",file:"윤하(YOUNHA) - 염라_프로.pdf"},
  {id:"score_mvd75i7m_j2nhzi",file:"Stray Kids - Topline_고급.pdf"},
  {id:"score_mvd75i7m_jmczau",file:"잔나비(Jannabi) - 사랑하긴 했었나요_고급.pdf"},
  {id:"score_mvd75i7m_pv8m59",file:"원필(WONPIL) - Piano_고급.pdf"},
  {id:"score_mvd75i7m_wtu9xp",file:"원필(WONPIL) - 사랑병동_고급.pdf"},
  {id:"score_mvd75i7l_lg747y",file:"태연 - 인사_중급.pdf"},
  {id:"score_mvd75i7l_1bn4iy",file:"허각 - 떠나보낼 준비해 둘것 그랬어_중급.pdf"},
  {id:"score_mvd75i7o_kj8icj",file:"Xdinary Heroes - 금지된 사랑_프로.pdf"},
  {id:"score_mvd75i7m_iuqn9c",file:"조째즈 - 모르시나요_중급.pdf"},
  {id:"score_mvd75i7n_s8x6h2",file:"도영 - 쏟아져오는 바람처럼 눈부시게 너란 빛이 비추더라_고급.pdf"},
  {id:"score_mvd75i7o_k4wqkj",file:"리그 오브 레전드 - 꽃의 바램_프로.pdf"},
  {id:"score_mvd75i7o_r31cdh",file:"Lucy - 개화_프로.pdf"},
  {id:"score_mvd75i7k_8w1e7i",file:"[초중급3] 한로로 (HANRORO) - 재 (Ashes).pdf"},
  {id:"score_mvd75i7k_8ltge1",file:"[초중급4] 노브레인 (No Brain) & 성진 (DAY6) & 도운 (DAY6) - 넌 내게 반했어.pdf"},
  {id:"score_mvd75i7m_9bxx40",file:"엔플라잉 - 뫼비우스_고급.pdf"},
  {id:"score_mvd75i7m_70p5ux",file:"원위 - 추억의 소각장_중급.pdf"},
  {id:"score_mvd75i7m_2t7v9c",file:"유다빈 - 언젠가는_중급.pdf"},
  {id:"score_mvd75i7m_fr0llv",file:"ONEWE (원위) - GRAVITY_고급.pdf"},
  {id:"score_mvd75i7o_gfexgn",file:"원위 - 별 헤는 밤_고급.pdf"},
  {id:"score_mvd75i7n_5nn1cb",file:"이준영 - 나였으면_고급.pdf"},
  {id:"score_mvd75i7n_h4dswl",file:"HUNTRIX - Free_고급.pdf"},
  {id:"score_mvd75i7n_89e4hb",file:"원위 - 미로_고급.pdf"},
  {id:"score_mvd75i7n_otf3hp",file:"DAY6 -  Lovin' the Christmas_고급.pdf"},
  {id:"score_mvd75i7o_mavhpr",file:"Xdinary Heroes - BBB_프로.pdf"},
  {id:"score_mvd75i7l_kzvs93",file:"Lil Nas X - STAR WALKIN_중급.pdf"},
  {id:"score_mvd75i7l_m1c8ia",file:"율 - 아니라고 말해요_중급.pdf"},
  {id:"score_mvd75i7n_95r12b",file:"FTISLAND - 행복 이론_고급.pdf"},
  {id:"score_mvd75i7m_66bt7k",file:"정은지 서인국 - All For You_중급.pdf"},
  {id:"score_mvd75i7o_62nnx7",file:"seramikarutitan - 에어맨이 쓰러지지 않아_프로.pdf"},
  {id:"score_mvd75i7m_s8gqkf",file:"[고급7] 로이킴 - Sparkle (신곡, 7).pdf"},
  {id:"score_mvd75i7o_4rafac",file:"유다빈밴드 - 바람_가사_고급.pdf"},
  {id:"score_mvd75i7n_u9izk9",file:"이영현 - 연_고급.pdf"},
  {id:"score_mvd75i7n_re4wfl",file:"Xdinary Heroes - 나를 깨워줘_고급.pdf"},
  {id:"score_mvd75i7n_ahljp6",file:"도영 - Sand Box_고급.pdf"},
  {id:"score_mvd75i7n_qr1yef",file:"잔나비-She_고급.pdf"},
  {id:"score_mvd75i7l_9x6g3l",file:"고추잠자리-작은 봄_중급.pdf"},
  {id:"score_mvd75i7m_8pkw4w",file:"Official髭男dism - Make Me Wonder_고급.pdf"},
  {id:"score_mvd75i7l_u1d6pr",file:"잔나비 - 모든 소년 소녀들 1 _ 버드맨_중급.pdf"},
  {id:"score_mvd75i7n_n7we4e",file:"아샤트리,이예은,전건호- 그래 늦지 않았어_고급.pdf"},
  {id:"score_mvd75i7k_qldpn7",file:"[초급2] 황가람 - 나는 반딧불.pdf"},
  {id:"score_mvd75i7l_cwybjs",file:"DAY6(데이식스)-예뻤어_초중급(easy).pdf"},
  {id:"score_mvd75i7o_nu2nu1",file:"음율 - 반비례_프로.pdf"},
  {id:"score_mvd75i7o_vwjxbd",file:"켄(KEN) · 영재 (YOUNGJAE) · 후이 · 최상엽 - 오래된 노래_프로.pdf"},
  {id:"score_mvd75i7l_t2jjv5",file:"[중급6] 노브레인 (No Brain) & 성진 (DAY6) & 도운 (DAY6) - 넌 내게 반했어.pdf"},
  {id:"score_mvd75i7n_3y8tdb",file:"주호 - 러브스케치_고급.pdf"},
  {id:"score_mvd75i7m_oz0nhi",file:"고추잠자리 - 너라는 별_중급.pdf"},
  {id:"score_mvd75i7n_o07wxp",file:"원위 - 숨바꼭질_고급.pdf"},
  {id:"score_mvd75i7o_6lgiu8",file:"Dragon Pony - 모스부호_고급.pdf"},
  {id:"score_mvd75i7o_zmjhal",file:"ONNWE - 바다에 적신 햇무리 반지_프로.pdf"},
  {id:"score_mvd75i7m_83qpv4",file:"브로큰 발렌타인 - 알루미늄_중급.pdf"}
];

const SCORE_PDF_MAPPING_REVIEW = [
  {id:"score_mvd75i7l_d4adtw",file:"Guns N Roses - Don't Cry_가사.pdf",title:"Don't Cry",artist:"Guns N' Roses",diff:"중급",conf:0.535},
  {id:"score_mvd75i7n_6vxnpf",file:"7, 고급 American Idiot - Green Day.pdf",title:"American Idiot",artist:"Green Day",diff:"고급",conf:0.538},
  {id:"score_mvd75i7n_9soao7",file:"TXT - Beautiful Strangers_고급.pdf",title:"Beautiful Strangers",artist:"투모로우바이투게더",diff:"고급",conf:0.6},
  {id:"score_mvd75i7l_kydw6p",file:"JEONGYEON, JIHYO, CHAEYOUNG - TAKEDOWN_중급.pdf",title:"TAKEDOWN",artist:"HUNTR/X (헌트릭스)",diff:"중급",conf:0.512},
  {id:"score_mvd75i7n_3ouv03",file:"도경수 - Do you remember_고급.pdf",title:"놀이터 (Do you remember?)",artist:"도경수(D.O.)",diff:"고급",conf:0.6},
  {id:"score_mvd75i7k_cfpd5r",file:"남규리 - Still, I Like You(그래도 좋아해요)_초급.pdf",title:"그래도 좋아해요(Still, I Like You)",artist:"남규리",diff:"초급",conf:0.6},
  {id:"score_mvd75i7m_vtn7eu",file:"Dragon Pony (드래곤포니) - Deneb (데네브)_고급.pdf",title:"데네브",artist:"Dragon Pony (드래곤포니)",diff:"고급",conf:0.6},
  {id:"score_mvd75i7m_l6adyi",file:"아카네리제 - 페스타(festa)_중급.pdf",title:"Festa!(페스타!)",artist:"아카네 리제 (Akane Lize)",diff:"중급",conf:0.6},
  {id:"score_mvd75i7l_txrbcd",file:"윤하(YOUNHA) - Seasonal Crime_중급 쉬운악보.pdf",title:"계절범죄",artist:"윤하(YOUNHA)",diff:"중급",conf:0.6},
  {id:"score_mvd75i7m_koai58",file:"N.Flying (엔플라잉) 환절기 (換節期)_고급_0001.pdf",title:"환절기(換節期)",artist:"N.Flying (엔플라잉)",diff:"고급",conf:0.6},
  {id:"score_mvd75i7m_ppqzfn",file:"HYNN(박혜원) - Title Role(주인공 연습)_고급.pdf",title:"주인공 연습",artist:"HYNN(박혜원)",diff:"고급",conf:0.6},
  {id:"score_mvd75i7m_rmhod6",file:"G-DRAGON - HOME SWEET HOME.pdf",title:"HOME SWEET HOME (feat. 태양, 대성)",artist:"G-DRAGON (지드래곤)",diff:"중급",conf:0.525},
  {id:"score_mvd75i7o_w3zyb1",file:"원위 - Rise Again (오래된 음악가의 추억 (Rise Again))_가사.pdf",title:"오래된 음악가의 추억 (Rise Again)",artist:"원위 (ONEWE)",diff:"고급",conf:0.6},
  {id:"score_mvd75i7m_t4mejw",file:"루시 - 잠깨_중급.pdf",title:"잠깨 (Wakey Wakey)",artist:"LUCY (루시)",diff:"중급",conf:0.6},
  {id:"score_mvd75i7m_js62hr",file:"YOUNHA(윤하) - Sub Character_고급_0001.pdf",title:"Sub Character",artist:"윤하",diff:"고급",conf:0.708},
  {id:"score_mvd75i7o_0tlm5y",file:"QWER - 청춘서약_고급.pdf",title:"Youth Promise (청춘서약)",artist:"QWER",diff:"고급",conf:0.645},
  {id:"score_mvd75i7o_zur47k",file:"멜로망스 - Surprise(아무 날의 서프라이즈)_프로.pdf",title:"아무 날의 서프라이즈",artist:"멜로망스",diff:"고급",conf:0.6},
  {id:"score_mvd75i7l_xuksrf",file:"장범준 - lilac_중급 쉬운악보.pdf",title:"라일락(lilac)",artist:"장범준",diff:"중급",conf:0.6},
  {id:"score_mvd75i7l_om2kva",file:"원우 - 톰보이(tomboy)_중급.pdf",title:"TOMBOY (원곡:혁오)",artist:"원우",diff:"중급",conf:0.6},
  {id:"score_mvd75i7n_a8x7sq",file:"Vince - CHA CHA CHA_고급.pdf",title:"차차차 (feat. G-DRAGON)",artist:"Vince",diff:"고급",conf:0.6},
  {id:"score_mvd75i7m_1b8ae7",file:"BTS (방탄소년단) 'SWIM with Jin (Alternative Rock Remix)_고급_0001.pdf",title:"SWIM with Jin (Alternative Rock Remix)",artist:"BTS (방탄소년단)",diff:"고급",conf:0.84},
  {id:"score_mvd75i7m_49ckva",file:"이승윤 - Uhbububu (어버버버)_고급.pdf",title:"어버버버",artist:"이승윤",diff:"고급",conf:0.6},
  {id:"score_mvd75i7l_yzl6ha",file:"HANRORO (한로로) - 도망_중급.pdf",title:"도망",artist:"한로로 (HANRORO)",diff:"중급",conf:0.6},
  {id:"score_mvd75i7o_o2wsmn",file:"Hawaii Five-0 Theme - Brian Tyler · Keith Power_프로.pdf",title:"Hawaii Five-0 Theme",artist:"Brian Tyler & Keith Power",diff:"고급",conf:0.505},
  {id:"score_mvd75i7l_g1d1vw",file:"이승윤 - Uhbububu (어버버버)_중급.pdf",title:"어버버버",artist:"이승윤",diff:"중급",conf:0.6},
  {id:"score_mvd75i7n_5d7vg3",file:"한동근 - Rainbow_고급.pdf",title:"레인보우 (Rainbow)",artist:"한동근",diff:"고급",conf:0.6},
  {id:"score_mvd75i7l_ju8urt",file:"Mrs. GREEN APPLE - 바람과 마을_중급_0001.pdf",title:"風と町 (바람과 마을)",artist:"Mrs. GREEN APPLE(미세스 그린 애플)",diff:"중급",conf:0.6},
  {id:"score_mvd75i7l_9hkf30",file:"10CM - Hush of Sunset(노을)_중급.pdf",title:"노을(Hush of Sunset)",artist:"10CM",diff:"중급",conf:0.6},
  {id:"score_mvd75i7m_ehr9f9",file:"장범준 - lilac_고급.pdf",title:"라일락(lilac)",artist:"장범준",diff:"고급",conf:0.6},
  {id:"score_mvd75i7l_bmxi5j",file:"MJ (써니사이드), 순순희 (지환) - 사랑한다 feat. 미유 (Mew)_중급.pdf",title:"사랑해요 (Feat.미유 (Mew))",artist:"MJ (써니사이드), 순순희(지환)",diff:"중급",conf:0.729},
  {id:"score_mvd75i7o_kjpj51",file:"Xdinary Heroes FiRE (My Sweet Misery)_가사.pdf",title:"FiRE (My Sweet Misery)",artist:"Xdinary Heroes (엑스디너리 히어로즈)",diff:"고급",conf:0.656},
  {id:"score_mvd75i7o_4w58kf",file:"FT아일랜드 - Drowning_프로.pdf",title:"Drowning (원곡 : WOODZ)",artist:"FTISLAND (FT아일랜드)",diff:"고급",conf:0.655},
  {id:"score_mvd75i7k_9nhnfx",file:"아이유 - 내 손을 잡아_고급.pdf",title:"Never Ending Story",artist:"아이유",diff:"초급",conf:0.45},
  {id:"score_mvd75i7n_t7zebq",file:"SUNMI(선미) -  BLUE!_고급_000.pdf",title:"BLUE!",artist:"선미",diff:"고급",conf:0.0},
  {id:"score_mvd75i7n_jwro87",file:"권진아 - 너의 또 다른 이름_고급.pdf",title:"너의 또다른 이름 (Your Other Name)",artist:"권진아",diff:"고급",conf:0.0},
  {id:"score_mvd75i7l_2m8io7",file:"FT아일랜드 - Reason_중급.pdf",title:"理由 (Reason)",artist:"FTISLAND (FT아일랜드)",diff:"중급",conf:0.0},
  {id:"score_mvd75i7n_v4ge2i",file:"치즈 - 그렇게 됐어 (feat. Young K)_가사_0001.pdf",title:"그렇게 됐어 (feat. Young K (DAY6))",artist:"CHEEZE (치즈)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7o_avh3qa",file:"우리동네 음악대장 - 하여가_프로.pdf",title:"하여가 (何如歌) (우리 동네 음악대장)",artist:"하현우 (국카스텐)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7l_8aljmn",file:"보라미유 - TO THE SEA (바다 가자)_초중급.pdf",title:"바다가자 (TO THE SEA)",artist:"보라미유",diff:"초급",conf:0.45},
  {id:"score_mvd75i7k_837dp9",file:"우즈 - Falling_초급.pdf",title:"Falling (Feat. Young K (DAY6))",artist:"WOODZ",diff:"초급",conf:0.0},
  {id:"score_mvd75i7n_4k0w4w",file:"7, 고급 (여자)아이들 - 나는 아픈 건 딱 질색이니까_0001.pdf",title:"나는 아픈 건 딱 질색이니까",artist:"i-dle (아이들)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7m_vnux05",file:"ROSE - Toxic Till The End_가사_0001.pdf",title:"toxic till the end",artist:"로제 (ROSÉ)",diff:"중급",conf:0.0},
  {id:"score_mvd75i7m_ahw03w",file:"[고급7] N.Flying - Our Ending.pdf",title:"아는 결말(Our Ending)",artist:"엔플라잉(N.Flying)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7l_in8yb4",file:"CHANGMO (창모) - If I Had Time_중급.pdf",title:"If I Had Time",artist:"창모 (CHANGMO)",diff:"중급",conf:0.0},
  {id:"score_mvd75i7n_lkphp5",file:"FT아일랜드 - 정답_고급.pdf",title:"정답(Expected)",artist:"FTISLAND (FT아일랜드)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7n_blet7d",file:"엔플라잉 - Still You_고급.pdf",title:"아직도 난 그대를 좋아해요 (Still You)",artist:"엔플라잉 (N.Flying)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7n_sk0yii",file:"우즈 - I'll Never Love Again_고급.pdf",title:"I'll Never Love Again",artist:"WOODZ",diff:"고급",conf:0.0},
  {id:"score_mvd75i7o_aihdid",file:"바운디(Vaundy) - 괴수의 꽃노래(怪獣の花唄)_프로.pdf",title:"怪獣の花唄 (괴수의 꽃노래)",artist:"Vaundy (바운디)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7o_6nyl2h",file:"CNBLUE - 人生賛歌(인생찬가)_프로.pdf",title:"인생찬가 人生賛歌",artist:"CNBLUE (씨엔블루)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7m_8ejywu",file:"서문탁 - 사랑 결코 시들지 않는_0001.pdf",title:"사랑, 결코 시들지 않는… (Love never dies…)",artist:"서문탁",diff:"중급",conf:0.0},
  {id:"score_mvd75i7m_922svt",file:"디셈버 - 심_고급.pdf",title:"심(心)",artist:"DK(디셈버)",diff:"고급",conf:0.45},
  {id:"score_mvd75i7m_n6fktn",file:"하이키 - 건물속에 피어난 장미_고급_0001.pdf",title:"건물 사이에 피어난 장미",artist:"H1KEY(하이키)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7n_br8sic",file:"N.Flying -  Everlasting_고급.pdf",title:"만년설 (Everlasting)",artist:"엔플라잉 (N.Flying)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7l_do31pd",file:"정승환 - 하루만 더_가사.pdf",title:"하루만 더 (One More Day)",artist:"정승환 Jung Seung Hwan",diff:"초급",conf:0.0},
  {id:"score_mvd75i7m_ejuepc",file:"PEPPERTONES(페퍼톤스) - Riders(라이더스)_고급.pdf",title:"Riders(라이더스)",artist:"페퍼톤스(PEPPERTONES)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7l_ju90t4",file:"ILLIT(아일릿) - Almond Chocolate(아몬드 초콜릿)_초중급.pdf",title:"Almond Chocolate (아몬드 초콜릿)",artist:"아일릿(ILLIT)",diff:"초급",conf:0.0},
  {id:"score_mvd75i7l_gpmukk",file:"IU - 바이, 썸머_중급.pdf",title:"바이, 썸머 (Bye, Summer)",artist:"아이유",diff:"중급",conf:0.412},
  {id:"score_mvd75i7o_p02j0x",file:"G-DRAGON - TOO BAD_고급.pdf",title:"TOO BAD (feat. Anderson .Paak)",artist:"G-DRAGON (지드래곤)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7l_mnl6nb",file:"범진-인사.pdf",title:"인사",artist:"범진",diff:"중급",conf:0.0},
  {id:"score_mvd75i7n_vf48jt",file:"7, 고급 너드커넥션 - 그대만 있다면_0001.pdf",title:"그대만 있다면 (여름날 우리 X 너드커넥션 (Nerd Connection))",artist:"너드커넥션 (Nerd Connection)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7m_jx7brv",file:"G-DRAGON - TOO BAD_고급.pdf",title:"TOO BAD – Alan Walker Remix",artist:"G-DRAGON, Anderson .Paak, Alan Walker",diff:"고급",conf:0.0},
  {id:"score_mvd75i7o_cwnjv8",file:"WING - 도파민_프로.pdf",title:"Dopamine",artist:"윙(WING)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7n_l1hzuu",file:"영케이 - 베스트 송_고급.pdf",title:"베스트 송",artist:"Young K (DAY6)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7m_jpx4i3",file:"윤하(YOUNHA) - Seasonal Crime_고급_0001.pdf",title:"계절범죄",artist:"윤하(YOUNHA)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7m_2nfavc",file:"노아주다 - 힙합보단 사랑 사랑보단 돈_고급_0001.pdf",title:"힙합보단 사랑, 사랑보단 돈 (Feat. 베이식)",artist:"노아주다 (noahjooda)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7n_ip8o5r",file:"멋진헛간 - 오대천왕2(정형돈,밴드 혁오)_고급.pdf",title:"멋진헛간",artist:"오대천왕 (정형돈, 밴드 혁오)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7l_76eqmg",file:"[중급5] N.Flying - Our Ending.pdf",title:"아는 결말(Our Ending)",artist:"엔플라잉(N.Flying)",diff:"중급",conf:0.0},
  {id:"score_mvd75i7n_fa7qak",file:"이창섭 - 365 Days_고급.pdf",title:"365일 (원곡 : 알리)",artist:"이창섭",diff:"고급",conf:0.0},
  {id:"score_mvd75i7o_kithp7",file:"Vernon Solo - Shining Star_프로.pdf",title:"Shining Star (Vernon Solo)",artist:"세븐틴 (SEVENTEEN)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7n_7n5eje",file:"2.나상현씨밴드-여름빛_.pdf",title:"여름빛",artist:"나상현씨밴드",diff:"고급",conf:0.0},
  {id:"score_mvd75i7l_vc91n9",file:"원위 - 관람차_고급.pdf",title:"관람차",artist:"원위(ONEWE)",diff:"중급",conf:0.0},
  {id:"score_mvd75i7n_glsvdn",file:"나윤권 & 도경수 - 나였으면_고급.pdf",title:"나였으면",artist:"나윤권, 도경수(D.O.)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7k_di5ncd",file:"회상 - 정경호.pdf",title:"회상",artist:"정경호",diff:"초급",conf:0.0},
  {id:"score_mvd75i7n_m8ym3e",file:"SEVENTEEN (세븐틴)  - THUNDER_고급.pdf",title:"THUNDER",artist:"세븐틴 (SEVENTEEN)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7n_r57iog",file:"조이 - 안녕 (Hard).pdf",title:"안녕 (Hello)",artist:"조이 (JOY)",diff:"고급",conf:0.0},
  {id:"score_mvd75i7o_c9e7p8",file:"원어스 - 월하미인_프로.pdf",title:"월하미인 (月下美人 _ LUNA)",artist:"ONEUS(원어스)",diff:"고급",conf:0.42},
  {id:"score_mvd75i7n_tlz221",file:"우즈 - Smashing Concrete_고급_0001.pdf",title:"Smashing Concrete",artist:"WOODZ",diff:"고급",conf:0.443},
  {id:"score_mvd75i7n_2l9teq",file:"더 리슨 5 - 밤하늘의 별을_고급.pdf",title:"밤하늘의 별을(더 리슨 5)",artist:"허각, 켄(KEN), 권진아, ASH ISLAND, BIG Naughty(서동현), 방예담, 전상근, #안녕",diff:"고급",conf:1}
];

let ADMIN_PDF_RUNNING = false;
let ADMIN_PDF_STOP = false;
let ADMIN_PDF_DONE = 0;
let ADMIN_PDF_OK = 0;
let ADMIN_PDF_FAIL = 0;
let ADMIN_PDF_LOG = []; // { file, ok, message }

let ADMIN_PDF2_RUNNING = false;
let ADMIN_PDF2_STOP = false;
let ADMIN_PDF2_DONE = 0;
let ADMIN_PDF2_OK = 0;
let ADMIN_PDF2_FAIL = 0;
let ADMIN_PDF2_LOG = [];

let ADMIN_REVIEW_FOLDER = null;        // Map<정규화된 파일명, File> — "검토 필요" 섹션에서 고른 폴더
let ADMIN_REVIEW_CHECKED = new Set();  // 업로드하기로 체크해둔 악보 id
let ADMIN_REVIEW_RUNNING = false;
let ADMIN_REVIEW_LOG = [];

let ADMIN_PAGECOUNT_RUNNING = false;
let ADMIN_PAGECOUNT_STOP = false;
let ADMIN_PAGECOUNT_DONE = 0;
let ADMIN_PAGECOUNT_OK = 0;
let ADMIN_PAGECOUNT_FAIL = 0;
let ADMIN_PAGECOUNT_LOG = []; // { file, ok, message }

let ADMIN_CARDTHUMB_RUNNING = false;
let ADMIN_CARDTHUMB_STOP = false;
let ADMIN_CARDTHUMB_DONE = 0;
let ADMIN_CARDTHUMB_OK = 0;
let ADMIN_CARDTHUMB_FAIL = 0;
let ADMIN_CARDTHUMB_LOG = []; // { file, ok, message }

function pdfMappingStatus() {
  let done = 0;
  for (const m of SCORE_PDF_MAPPING) {
    const s = STATE.scores[m.id];
    if (s && s.fileUrl) done++;
  }
  return { total: SCORE_PDF_MAPPING.length, done, remaining: SCORE_PDF_MAPPING.length - done };
}

function renderAdminPdfUpload(body) {
  const st = pdfMappingStatus();
  body.innerHTML = `
    <div style="${ADMIN_PANEL}">
      <h2 style="margin:0 0 4px;font-size:17px;">PDF 일괄 업로드 (이관된 악보용)</h2>
      <p style="margin:0 0 12px;font-size:13px;color:var(--muted);line-height:1.6;">
        mydrumsheet.com에서 이관된 악보 중 실제 파일이 비어있던 곡들을, 반진영님이 보내주신
        "판매용 악보" 폴더의 파일명과 자동으로 맞춰본 목록(${st.total}곡)입니다. 아래 버튼을 누르면
        그 폴더를 통째로 고를 수 있고, 이름이 맞는 파일만 하나씩 업로드해서 악보에 연결합니다.<br>
        지금까지 연결됨: <b>${st.done} / ${st.total}</b>곡
      </p>
      <div style="padding:12px;border-radius:10px;background:#f5f2ee;font-size:12px;color:var(--muted);margin-bottom:12px;line-height:1.6;">
        이름이 너무 달라 자동으로 맞추지 못한 악보, 또는 폴더 안에 파일 자체가 없는 악보는
        이 목록에 들어있지 않습니다 — 그런 악보는 아래 "추가 매칭"·"검토 필요" 섹션에서 처리합니다.
        이미 연결된 악보는 다시 눌러도 건너뛰니, 중간에 멈췄다가 같은 폴더로 다시 시작해도 안전합니다.
      </div>
      <input type="file" id="admin-pdf-folder-input" webkitdirectory directory multiple style="display:none;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button id="admin-pdf-pick-btn" class="btn btn-primary admin-dark-btn" style="border-radius:12px;" ${ADMIN_PDF_RUNNING ? "disabled" : ""}>
          ${ADMIN_PDF_RUNNING ? "업로드 진행 중..." : `"판매용 악보" 폴더 선택해서 업로드 시작`}
        </button>
        ${ADMIN_PDF_RUNNING ? `<button id="admin-pdf-stop-btn" class="admin-stop-btn" style="padding:9px 14px;font-size:13px;border-radius:8px;background:var(--card);cursor:pointer;">중단</button>` : ""}
      </div>
      <div id="admin-pdf-progress" style="margin-top:14px;"></div>
      <div id="admin-pdf-log" style="margin-top:10px;max-height:320px;overflow-y:auto;font-size:12px;"></div>
    </div>

    ${renderAdminPdfConfirmHTML()}
    ${renderAdminReviewHTML()}
    ${renderAdminPageCountHTML()}
    ${renderAdminCardThumbHTML()}
  `;

  document.getElementById("admin-pdf-pick-btn")?.addEventListener("click", () => {
    document.getElementById("admin-pdf-folder-input")?.click();
  });
  document.getElementById("admin-pdf-folder-input")?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    runBulkPdfUpload(files);
  });
  document.getElementById("admin-pdf-stop-btn")?.addEventListener("click", () => {
    ADMIN_PDF_STOP = true;
  });

  renderAdminPdfProgress();
  wireAdminPdfConfirm();
  wireAdminReview();
  wireAdminPageCount();
  wireAdminCardThumb();
}

/* ---------- 기존 악보 페이지 수 일괄 계산 (2026-10-21 추가) ----------
   "악보 상세 정보"에 보여줄 총 페이지 수는 새로 등록되는 악보부터는 자동으로 저장되지만,
   이미 등록돼 있던 악보는 저장된 값이 없다. 위 PDF 일괄 업로드·추가 매칭·검토 필요 세
   목록(파일명을 이미 알고 있는 악보들)을 그대로 재사용해서, 같은 "판매용 악보" 폴더를
   다시 한 번 고르면 각 파일을 열어 페이지 수만 가볍게 읽어 채워 넣는다. 파일을 새로
   올리는 게 아니라 이미 올라간 파일의 페이지 수만 알아내는 것이라 Storage에는 손대지
   않고, 이미 페이지 수가 채워진 악보는 건드리지 않고 조용히 건너뛴다(중간에 멈췄다가
   같은 폴더로 다시 시작해도 안전). */

function pageCountMappingList() {
  const seen = new Set();
  const list = [];
  for (const m of [...SCORE_PDF_MAPPING, ...SCORE_PDF_MAPPING_CONFIRM, ...SCORE_PDF_MAPPING_REVIEW]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    list.push(m);
  }
  return list;
}

function pageCountStatus() {
  const all = pageCountMappingList();
  let eligible = 0, done = 0;
  for (const m of all) {
    const s = STATE.scores[m.id];
    if (!s || !s.fileUrl) continue; // 파일 자체가 없는 악보는 대상이 아님
    eligible++;
    if (s.pageCount) done++;
  }
  return { total: eligible, done, remaining: eligible - done };
}

function renderAdminPageCountHTML() {
  const st = pageCountStatus();
  return `
    <div style="${ADMIN_PANEL}">
      <h3 style="margin:0 0 4px;font-size:15px;">기존 악보 페이지 수 일괄 계산</h3>
      <p style="margin:0 0 12px;font-size:13px;color:var(--muted);line-height:1.6;">
        이미 등록된 악보의 "악보 상세 정보"에 총 페이지 수를 채워 넣습니다. 위에서 쓴 것과
        같은 "판매용 악보" 폴더를 다시 골라주시면, 파일명이 맞는 악보만 열어서 페이지 수를
        읽어 저장합니다(파일을 다시 올리는 건 아니라서 빠르게 끝나요).<br>
        지금까지 채워짐: <b>${st.done} / ${st.total}</b>곡
      </p>
      <input type="file" id="admin-pagecount-folder-input" webkitdirectory directory multiple style="display:none;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button id="admin-pagecount-pick-btn" class="btn btn-primary admin-dark-btn" style="border-radius:12px;" ${ADMIN_PAGECOUNT_RUNNING ? "disabled" : ""}>
          ${ADMIN_PAGECOUNT_RUNNING ? "계산 진행 중..." : `"판매용 악보" 폴더 선택해서 계산 시작`}
        </button>
        ${ADMIN_PAGECOUNT_RUNNING ? `<button id="admin-pagecount-stop-btn" class="admin-stop-btn" style="padding:9px 14px;font-size:13px;border-radius:8px;background:var(--card);cursor:pointer;">중단</button>` : ""}
      </div>
      <div id="admin-pagecount-progress" style="margin-top:14px;"></div>
      <div id="admin-pagecount-log" style="margin-top:10px;max-height:320px;overflow-y:auto;font-size:12px;"></div>
    </div>`;
}

function wireAdminPageCount() {
  document.getElementById("admin-pagecount-pick-btn")?.addEventListener("click", () => {
    document.getElementById("admin-pagecount-folder-input")?.click();
  });
  document.getElementById("admin-pagecount-folder-input")?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    runBulkPageCount(files);
  });
  document.getElementById("admin-pagecount-stop-btn")?.addEventListener("click", () => {
    ADMIN_PAGECOUNT_STOP = true;
  });
  renderAdminPageCountProgress();
}

function renderAdminPageCountProgress() {
  const progEl = document.getElementById("admin-pagecount-progress");
  const logEl = document.getElementById("admin-pagecount-log");
  if (!progEl || !logEl) return;
  const total = pageCountStatus().total;
  const pct = total ? Math.round((ADMIN_PAGECOUNT_DONE / total) * 100) : 0;
  progEl.innerHTML = (ADMIN_PAGECOUNT_RUNNING || ADMIN_PAGECOUNT_DONE > 0) ? `
    <div style="font-size:13px;margin-bottom:6px;">${ADMIN_PAGECOUNT_DONE} / ${total} 처리됨 · 성공 ${ADMIN_PAGECOUNT_OK} · 실패 ${ADMIN_PAGECOUNT_FAIL}</div>
    <div style="height:8px;border-radius:4px;background:var(--band);"><div style="height:8px;border-radius:4px;background:var(--primary);width:${pct}%;"></div></div>
  ` : "";
  const recent = ADMIN_PAGECOUNT_LOG.slice(-200).slice().reverse();
  logEl.innerHTML = recent.map(r => `
    <div style="padding:4px 0;border-top:1px solid var(--border);color:${r.ok ? "var(--text)" : "var(--danger)"};">
      ${r.ok ? "✓" : "✗"} ${esc(r.file)}${r.ok ? "" : ` — ${esc(r.message || "")}`}
    </div>`).join("");
}

async function runBulkPageCount(files) {
  if (ADMIN_PAGECOUNT_RUNNING) return;
  ADMIN_PAGECOUNT_RUNNING = true;
  ADMIN_PAGECOUNT_STOP = false;
  ADMIN_PAGECOUNT_DONE = 0; ADMIN_PAGECOUNT_OK = 0; ADMIN_PAGECOUNT_FAIL = 0; ADMIN_PAGECOUNT_LOG = [];
  renderAdmin();

  // macOS 브라우저의 한글 파일명 자모 분리(NFD) 문제는 기존 PDF 업로드와 동일하게 NFC로 맞춰서 비교한다.
  const byName = new Map();
  for (const f of files) {
    const name = (f.name || "").normalize("NFC");
    byName.set(name, f);
  }

  const targets = pageCountMappingList();
  for (const m of targets) {
    if (ADMIN_PAGECOUNT_STOP) break;
    const score = STATE.scores[m.id];
    if (!score || !score.fileUrl) continue; // 파일 자체가 없는 악보는 대상이 아님(조용히 건너뜀, 로그 안 남김)
    if (score.pageCount) { ADMIN_PAGECOUNT_DONE++; ADMIN_PAGECOUNT_OK++; continue; } // 이미 채워짐 — 조용히 건너뜀

    const wanted = m.file.normalize("NFC");
    const file = byName.get(wanted);
    if (!file) {
      ADMIN_PAGECOUNT_LOG.push({ file: m.file, ok: false, message: "선택한 폴더에서 이 파일명을 찾지 못함" });
      ADMIN_PAGECOUNT_FAIL++; ADMIN_PAGECOUNT_DONE++;
      if (ADMIN_PAGECOUNT_DONE % 10 === 0) renderAdminPageCountProgress();
      continue;
    }
    const count = await getPdfPageCount(file);
    if (count) {
      score.pageCount = count;
      ADMIN_PAGECOUNT_OK++;
      ADMIN_PAGECOUNT_LOG.push({ file: m.file, ok: true });
    } else {
      ADMIN_PAGECOUNT_FAIL++;
      ADMIN_PAGECOUNT_LOG.push({ file: m.file, ok: false, message: "페이지 수를 읽지 못함" });
    }
    ADMIN_PAGECOUNT_DONE++;
    if (ADMIN_PAGECOUNT_DONE % 5 === 0) renderAdminPageCountProgress();
    // 2026-10-21 추가: 중간에 브라우저가 멈추거나 닫혀도 지금까지 처리한 내용이 날아가지 않도록,
    // 끝까지 기다리지 않고 20건마다 한 번씩 미리 저장해둔다.
    if (ADMIN_PAGECOUNT_DONE % 20 === 0) save();
  }

  save(); // scores.pageCount 변경분을 한꺼번에 서버에 반영 (diff 저장)
  ADMIN_PAGECOUNT_RUNNING = false;
  renderAdmin();
  if (typeof toast === "function") toast(`페이지 수 계산 완료: 성공 ${ADMIN_PAGECOUNT_OK}건 · 실패 ${ADMIN_PAGECOUNT_FAIL}건`);
}

/* ---------- 기존 악보 카드 썸네일 일괄 생성 (2026-10-21 추가) ----------
   목록/홈 카드에 보여줄 "첫 페이지 전체" 썸네일(cardThumbUrl)은 새로 등록되는 악보부터는
   자동으로 만들어지지만, 이미 등록돼 있던 악보 748건은 저장된 값이 없다(페이지 수
   일괄 계산과 마찬가지로, 같은 "판매용 악보" 폴더 매칭표를 재사용한다). 페이지 수와
   달리 이번에는 이미지를 새로 만들어 Storage(previews 버킷)에 올려야 하므로, 파일을
   열어 페이지 수만 읽는 것보다는 시간이 걸린다. 이미 cardThumbUrl이 채워진 악보는
   건드리지 않고 조용히 건너뛴다(중간에 멈췄다가 같은 폴더로 다시 시작해도 안전). */

function cardThumbStatus() {
  const all = pageCountMappingList(); // 페이지 수 작업과 동일한 매칭 목록을 재사용
  let eligible = 0, done = 0;
  for (const m of all) {
    const s = STATE.scores[m.id];
    if (!s || !s.fileUrl) continue; // 파일 자체가 없는 악보는 대상이 아님
    eligible++;
    if (s.cardThumbUrl) done++;
  }
  return { total: eligible, done, remaining: eligible - done };
}

function renderAdminCardThumbHTML() {
  const st = cardThumbStatus();
  return `
    <div style="${ADMIN_PANEL}">
      <h3 style="margin:0 0 4px;font-size:15px;">기존 악보 카드 썸네일 일괄 생성</h3>
      <p style="margin:0 0 12px;font-size:13px;color:var(--muted);line-height:1.6;">
        목록·홈 화면 카드에 "악보 첫 페이지 전체"가 잘리지 않고 보이도록, 위에서 쓴 것과
        같은 "판매용 악보" 폴더를 다시 골라주시면 파일명이 맞는 악보만 열어서 썸네일 이미지를
        새로 만들어 저장합니다(이미지를 새로 올리는 작업이라 페이지 수 계산보다 시간이
        조금 더 걸려요).<br>
        지금까지 만들어짐: <b>${st.done} / ${st.total}</b>곡
      </p>
      <input type="file" id="admin-cardthumb-folder-input" webkitdirectory directory multiple style="display:none;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button id="admin-cardthumb-pick-btn" class="btn btn-primary admin-dark-btn" style="border-radius:12px;" ${ADMIN_CARDTHUMB_RUNNING ? "disabled" : ""}>
          ${ADMIN_CARDTHUMB_RUNNING ? "생성 진행 중..." : `"판매용 악보" 폴더 선택해서 생성 시작`}
        </button>
        ${ADMIN_CARDTHUMB_RUNNING ? `<button id="admin-cardthumb-stop-btn" class="admin-stop-btn" style="padding:9px 14px;font-size:13px;border-radius:8px;background:var(--card);cursor:pointer;">중단</button>` : ""}
      </div>
      <div id="admin-cardthumb-progress" style="margin-top:14px;"></div>
      <div id="admin-cardthumb-log" style="margin-top:10px;max-height:320px;overflow-y:auto;font-size:12px;"></div>
    </div>`;
}

function wireAdminCardThumb() {
  document.getElementById("admin-cardthumb-pick-btn")?.addEventListener("click", () => {
    document.getElementById("admin-cardthumb-folder-input")?.click();
  });
  document.getElementById("admin-cardthumb-folder-input")?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    runBulkCardThumb(files);
  });
  document.getElementById("admin-cardthumb-stop-btn")?.addEventListener("click", () => {
    ADMIN_CARDTHUMB_STOP = true;
  });
  renderAdminCardThumbProgress();
}

function renderAdminCardThumbProgress() {
  const progEl = document.getElementById("admin-cardthumb-progress");
  const logEl = document.getElementById("admin-cardthumb-log");
  if (!progEl || !logEl) return;
  const total = cardThumbStatus().total;
  const pct = total ? Math.round((ADMIN_CARDTHUMB_DONE / total) * 100) : 0;
  progEl.innerHTML = (ADMIN_CARDTHUMB_RUNNING || ADMIN_CARDTHUMB_DONE > 0) ? `
    <div style="font-size:13px;margin-bottom:6px;">${ADMIN_CARDTHUMB_DONE} / ${total} 처리됨 · 성공 ${ADMIN_CARDTHUMB_OK} · 실패 ${ADMIN_CARDTHUMB_FAIL}</div>
    <div style="height:8px;border-radius:4px;background:var(--band);"><div style="height:8px;border-radius:4px;background:var(--primary);width:${pct}%;"></div></div>
  ` : "";
  const recent = ADMIN_CARDTHUMB_LOG.slice(-200).slice().reverse();
  logEl.innerHTML = recent.map(r => `
    <div style="padding:4px 0;border-top:1px solid var(--border);color:${r.ok ? "var(--text)" : "var(--danger)"};">
      ${r.ok ? "✓" : "✗"} ${esc(r.file)}${r.ok ? "" : ` — ${esc(r.message || "")}`}
    </div>`).join("");
}

async function runBulkCardThumb(files) {
  if (ADMIN_CARDTHUMB_RUNNING) return;
  ADMIN_CARDTHUMB_RUNNING = true;
  ADMIN_CARDTHUMB_STOP = false;
  ADMIN_CARDTHUMB_DONE = 0; ADMIN_CARDTHUMB_OK = 0; ADMIN_CARDTHUMB_FAIL = 0; ADMIN_CARDTHUMB_LOG = [];
  renderAdmin();

  // macOS 브라우저의 한글 파일명 자모 분리(NFD) 문제는 기존 작업들과 동일하게 NFC로 맞춰서 비교한다.
  const byName = new Map();
  for (const f of files) {
    const name = (f.name || "").normalize("NFC");
    byName.set(name, f);
  }

  const targets = pageCountMappingList();
  for (const m of targets) {
    if (ADMIN_CARDTHUMB_STOP) break;
    const score = STATE.scores[m.id];
    if (!score || !score.fileUrl) continue; // 파일 자체가 없는 악보는 대상이 아님(조용히 건너뜀, 로그 안 남김)
    if (score.cardThumbUrl) { ADMIN_CARDTHUMB_DONE++; ADMIN_CARDTHUMB_OK++; continue; } // 이미 만들어짐 — 조용히 건너뜀

    const wanted = m.file.normalize("NFC");
    const file = byName.get(wanted);
    if (!file) {
      ADMIN_CARDTHUMB_LOG.push({ file: m.file, ok: false, message: "선택한 폴더에서 이 파일명을 찾지 못함" });
      ADMIN_CARDTHUMB_FAIL++; ADMIN_CARDTHUMB_DONE++;
      if (ADMIN_CARDTHUMB_DONE % 10 === 0) renderAdminCardThumbProgress();
      continue;
    }
    try {
      const blob = await generateScoreCardThumbnail(file);
      const upload = blob ? await uploadScoreCardThumbnail(score.sellerId, score.id, blob) : null;
      if (upload && upload.ok && upload.url) {
        score.cardThumbUrl = upload.url;
        ADMIN_CARDTHUMB_OK++;
        ADMIN_CARDTHUMB_LOG.push({ file: m.file, ok: true });
      } else {
        ADMIN_CARDTHUMB_FAIL++;
        ADMIN_CARDTHUMB_LOG.push({ file: m.file, ok: false, message: (upload && upload.message) || "썸네일을 만들지 못함" });
      }
    } catch (e) {
      console.error("[admin] 카드 썸네일 일괄 생성 오류", e);
      ADMIN_CARDTHUMB_FAIL++;
      ADMIN_CARDTHUMB_LOG.push({ file: m.file, ok: false, message: "처리 중 오류 발생" });
    }
    ADMIN_CARDTHUMB_DONE++;
    if (ADMIN_CARDTHUMB_DONE % 5 === 0) renderAdminCardThumbProgress();
    // 2026-10-21 추가: PDF를 수백 장 연달아 열면서 브라우저가 멈추는 문제가 있었기 때문에,
    // 끝까지 기다리지 않고 20건마다 한 번씩 미리 저장해둔다 — 중간에 멈춰도 그때까지는 안전.
    if (ADMIN_CARDTHUMB_DONE % 20 === 0) save();
  }

  save(); // scores.cardThumbUrl 변경분을 한꺼번에 서버에 반영 (diff 저장)
  ADMIN_CARDTHUMB_RUNNING = false;
  renderAdmin();
  if (typeof toast === "function") toast(`카드 썸네일 생성 완료: 성공 ${ADMIN_CARDTHUMB_OK}건 · 실패 ${ADMIN_CARDTHUMB_FAIL}건`);
}

function renderAdminPdfProgress() {
  const progEl = document.getElementById("admin-pdf-progress");
  const logEl = document.getElementById("admin-pdf-log");
  if (!progEl || !logEl) return;
  const total = SCORE_PDF_MAPPING.length;
  const pct = total ? Math.round((ADMIN_PDF_DONE / total) * 100) : 0;
  progEl.innerHTML = (ADMIN_PDF_RUNNING || ADMIN_PDF_DONE > 0) ? `
    <div style="font-size:13px;margin-bottom:6px;">${ADMIN_PDF_DONE} / ${total} 처리됨 · 성공 ${ADMIN_PDF_OK} · 실패 ${ADMIN_PDF_FAIL}</div>
    <div style="height:8px;border-radius:4px;background:var(--band);"><div style="height:8px;border-radius:4px;background:var(--primary);width:${pct}%;"></div></div>
  ` : "";
  const recent = ADMIN_PDF_LOG.slice(-200).slice().reverse();
  logEl.innerHTML = recent.map(r => `
    <div style="padding:4px 0;border-top:1px solid var(--border);color:${r.ok ? "var(--text)" : "var(--danger)"};">
      ${r.ok ? "✓" : "✗"} ${esc(r.file)}${r.ok ? "" : ` — ${esc(r.message || "")}`}
    </div>`).join("");
}

async function runBulkPdfUpload(files) {
  if (ADMIN_PDF_RUNNING) return;
  ADMIN_PDF_RUNNING = true;
  ADMIN_PDF_STOP = false;
  ADMIN_PDF_DONE = 0; ADMIN_PDF_OK = 0; ADMIN_PDF_FAIL = 0; ADMIN_PDF_LOG = [];
  renderAdmin();

  // macOS 브라우저는 한글 파일명을 자모 분리(NFD)로 줄 때가 있어서, 비교 전에
  // 전부 NFC로 정규화한다 (이관 PDF 매칭 작업 때 겪었던 것과 같은 문제).
  const byName = new Map();
  for (const f of files) {
    const name = (f.name || "").normalize("NFC");
    byName.set(name, f);
  }

  for (const m of SCORE_PDF_MAPPING) {
    if (ADMIN_PDF_STOP) break;
    const score = STATE.scores[m.id];
    if (!score) {
      ADMIN_PDF_LOG.push({ file: m.file, ok: false, message: "악보를 찾을 수 없음(삭제됨?)" });
      ADMIN_PDF_FAIL++; ADMIN_PDF_DONE++;
      continue;
    }
    if (score.fileUrl) {
      ADMIN_PDF_DONE++; ADMIN_PDF_OK++; // 이미 연결됨 — 조용히 건너뜀
      continue;
    }
    const wanted = m.file.normalize("NFC");
    const file = byName.get(wanted);
    if (!file) {
      ADMIN_PDF_LOG.push({ file: m.file, ok: false, message: "선택한 폴더에서 이 파일명을 찾지 못함" });
      ADMIN_PDF_FAIL++; ADMIN_PDF_DONE++;
      if (ADMIN_PDF_DONE % 10 === 0) renderAdminPdfProgress();
      continue;
    }
    const res = await uploadScoreFile(SCORE_PDF_SELLER_ID, m.id, file);
    if (res.ok) {
      score.fileUrl = res.path;
      if (/_프로(_\d+)?\.pdf$/i.test(wanted)) score.difficulty = "프로";
      ADMIN_PDF_OK++;
      ADMIN_PDF_LOG.push({ file: m.file, ok: true });
    } else {
      ADMIN_PDF_FAIL++;
      ADMIN_PDF_LOG.push({ file: m.file, ok: false, message: res.message });
    }
    ADMIN_PDF_DONE++;
    if (ADMIN_PDF_DONE % 5 === 0) renderAdminPdfProgress();
  }

  save(); // scores.fileUrl 변경분을 한꺼번에 서버에 반영 (diff 저장)
  ADMIN_PDF_RUNNING = false;
  renderAdmin();
  if (typeof toast === "function") toast(`PDF 업로드 완료: 성공 ${ADMIN_PDF_OK}건 · 실패 ${ADMIN_PDF_FAIL}건`);
}

/* ---------- 추가 매칭 — 확실한 매칭 128곡 (524곡과 같은 방식, 자동 업로드) ---------- */

function pdfMappingStatus2() {
  let done = 0;
  for (const m of SCORE_PDF_MAPPING_CONFIRM) {
    const s = STATE.scores[m.id];
    if (s && s.fileUrl) done++;
  }
  return { total: SCORE_PDF_MAPPING_CONFIRM.length, done, remaining: SCORE_PDF_MAPPING_CONFIRM.length - done };
}

function renderAdminPdfConfirmHTML() {
  const st = pdfMappingStatus2();
  return `
    <div style="${ADMIN_PANEL}">
      <h3 style="margin:0 0 4px;font-size:15px;">추가 매칭 — 확실한 매칭 ${st.total}곡</h3>
      <p style="margin:0 0 12px;font-size:13px;color:var(--muted);line-height:1.6;">
        반진영님이 직접 검토해서 확정해준 매칭표 중, 위 524곡에는 없었지만 추가로 확실하다고 판단된 ${st.total}곡입니다.
        위와 똑같이 "판매용 악보" 폴더를 고르면 바로 업로드돼요. 지금까지 연결됨: <b>${st.done} / ${st.total}</b>곡
      </p>
      <input type="file" id="admin-pdf2-folder-input" webkitdirectory directory multiple style="display:none;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button id="admin-pdf2-pick-btn" class="btn btn-primary admin-dark-btn" style="border-radius:12px;" ${ADMIN_PDF2_RUNNING ? "disabled" : ""}>
          ${ADMIN_PDF2_RUNNING ? "업로드 진행 중..." : `"판매용 악보" 폴더 선택해서 업로드 시작`}
        </button>
        ${ADMIN_PDF2_RUNNING ? `<button id="admin-pdf2-stop-btn" class="admin-stop-btn" style="padding:9px 14px;font-size:13px;border-radius:8px;background:var(--card);cursor:pointer;">중단</button>` : ""}
      </div>
      <div id="admin-pdf2-progress" style="margin-top:14px;"></div>
      <div id="admin-pdf2-log" style="margin-top:10px;max-height:280px;overflow-y:auto;font-size:12px;"></div>
    </div>`;
}

function wireAdminPdfConfirm() {
  document.getElementById("admin-pdf2-pick-btn")?.addEventListener("click", () => {
    document.getElementById("admin-pdf2-folder-input")?.click();
  });
  document.getElementById("admin-pdf2-folder-input")?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    runBulkPdfUploadConfirm(files);
  });
  document.getElementById("admin-pdf2-stop-btn")?.addEventListener("click", () => {
    ADMIN_PDF2_STOP = true;
  });
  renderAdminPdfConfirmProgress();
}

function renderAdminPdfConfirmProgress() {
  const progEl = document.getElementById("admin-pdf2-progress");
  const logEl = document.getElementById("admin-pdf2-log");
  if (!progEl || !logEl) return;
  const total = SCORE_PDF_MAPPING_CONFIRM.length;
  const pct = total ? Math.round((ADMIN_PDF2_DONE / total) * 100) : 0;
  progEl.innerHTML = (ADMIN_PDF2_RUNNING || ADMIN_PDF2_DONE > 0) ? `
    <div style="font-size:13px;margin-bottom:6px;">${ADMIN_PDF2_DONE} / ${total} 처리됨 · 성공 ${ADMIN_PDF2_OK} · 실패 ${ADMIN_PDF2_FAIL}</div>
    <div style="height:8px;border-radius:4px;background:var(--band);"><div style="height:8px;border-radius:4px;background:var(--primary);width:${pct}%;"></div></div>
  ` : "";
  const recent = ADMIN_PDF2_LOG.slice(-200).slice().reverse();
  logEl.innerHTML = recent.map(r => `
    <div style="padding:4px 0;border-top:1px solid var(--border);color:${r.ok ? "var(--text)" : "var(--danger)"};">
      ${r.ok ? "✓" : "✗"} ${esc(r.file)}${r.ok ? "" : ` — ${esc(r.message || "")}`}
    </div>`).join("");
}

async function runBulkPdfUploadConfirm(files) {
  if (ADMIN_PDF2_RUNNING) return;
  ADMIN_PDF2_RUNNING = true;
  ADMIN_PDF2_STOP = false;
  ADMIN_PDF2_DONE = 0; ADMIN_PDF2_OK = 0; ADMIN_PDF2_FAIL = 0; ADMIN_PDF2_LOG = [];
  renderAdmin();

  const byName = new Map();
  for (const f of files) {
    const name = (f.name || "").normalize("NFC");
    byName.set(name, f);
  }

  for (const m of SCORE_PDF_MAPPING_CONFIRM) {
    if (ADMIN_PDF2_STOP) break;
    const score = STATE.scores[m.id];
    if (!score) {
      ADMIN_PDF2_LOG.push({ file: m.file, ok: false, message: "악보를 찾을 수 없음(삭제됨?)" });
      ADMIN_PDF2_FAIL++; ADMIN_PDF2_DONE++;
      continue;
    }
    if (score.fileUrl) {
      ADMIN_PDF2_DONE++; ADMIN_PDF2_OK++;
      continue;
    }
    const wanted = m.file.normalize("NFC");
    const file = byName.get(wanted);
    if (!file) {
      ADMIN_PDF2_LOG.push({ file: m.file, ok: false, message: "선택한 폴더에서 이 파일명을 찾지 못함" });
      ADMIN_PDF2_FAIL++; ADMIN_PDF2_DONE++;
      if (ADMIN_PDF2_DONE % 10 === 0) renderAdminPdfConfirmProgress();
      continue;
    }
    const res = await uploadScoreFile(SCORE_PDF_SELLER_ID, m.id, file);
    if (res.ok) {
      score.fileUrl = res.path;
      if (/_프로(_\d+)?\.pdf$/i.test(wanted)) score.difficulty = "프로";
      ADMIN_PDF2_OK++;
      ADMIN_PDF2_LOG.push({ file: m.file, ok: true });
    } else {
      ADMIN_PDF2_FAIL++;
      ADMIN_PDF2_LOG.push({ file: m.file, ok: false, message: res.message });
    }
    ADMIN_PDF2_DONE++;
    if (ADMIN_PDF2_DONE % 5 === 0) renderAdminPdfConfirmProgress();
  }

  save();
  ADMIN_PDF2_RUNNING = false;
  renderAdmin();
  if (typeof toast === "function") toast(`추가 매칭 업로드 완료: 성공 ${ADMIN_PDF2_OK}건 · 실패 ${ADMIN_PDF2_FAIL}건`);
}

/* ---------- 검토 필요 79곡 — 사람이 직접 확인하고 고른 것만 업로드 ---------- */

function reviewMappingStatus() {
  let done = 0, noFile = 0;
  for (const m of SCORE_PDF_MAPPING_REVIEW) {
    const s = STATE.scores[m.id];
    if (s && s.fileUrl) done++;
    else if (!m.file) noFile++;
  }
  return { total: SCORE_PDF_MAPPING_REVIEW.length, done, noFile, remaining: SCORE_PDF_MAPPING_REVIEW.length - done - noFile };
}

function confRank(conf) {
  if (conf >= 0.7) return { label: "비교적 확실", color: "var(--primary-dark)", bg: "var(--primary-soft)" };
  if (conf >= 0.5) return { label: "애매함", color: "#8a6420", bg: "#fff6df" };
  return { label: "확신도 낮음", color: "var(--danger)", bg: "#fdecec" };
}

function renderAdminReviewHTML() {
  const st = reviewMappingStatus();
  const rows = SCORE_PDF_MAPPING_REVIEW.filter(m => {
    const s = STATE.scores[m.id];
    return !(s && s.fileUrl);
  });

  const folderInfo = ADMIN_REVIEW_FOLDER
    ? `<span style="color:var(--primary-dark);">✓ 폴더 선택됨 (${ADMIN_REVIEW_FOLDER.size}개 파일)</span>`
    : `<span style="color:var(--muted);">폴더를 먼저 선택해야 미리보기·업로드를 할 수 있어요</span>`;

  const rowsHTML = rows.map(m => {
    const noFile = !m.file;
    const rank = confRank(m.conf);
    const checked = ADMIN_REVIEW_CHECKED.has(m.id);
    let fileEntry = null;
    if (ADMIN_REVIEW_FOLDER && m.file) fileEntry = ADMIN_REVIEW_FOLDER.get(m.file.normalize("NFC"));
    return `
      <div style="padding:12px;border-radius:12px;border:1px solid var(--border);margin-bottom:8px;background:${checked ? "var(--primary-soft)" : "var(--card)"};">
        <div style="display:flex;gap:10px;align-items:flex-start;">
          <input type="checkbox" data-review-check="${m.id}" ${checked ? "checked" : ""} ${noFile ? "disabled" : ""}
            style="margin-top:4px;width:16px;height:16px;flex-shrink:0;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;">${esc(m.title)}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">${esc(m.artist)} · ${esc(m.diff)} (DB 기준)</div>
            <div style="margin-top:6px;font-size:12px;">
              후보 파일: ${noFile ? `<b style="color:var(--danger);">폴더에 해당 파일이 없음 — 반진영님이 직접 올려야 해요</b>` : `<b>${esc(m.file)}</b>`}
              ${!noFile ? `<span style="margin-left:6px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;color:${rank.color};background:${rank.bg};">${rank.label} (${Math.round(m.conf * 100)}%)</span>` : ""}
            </div>
          </div>
          <button data-review-preview="${m.id}" class="btn btn-small" ${(noFile || !fileEntry) ? "disabled" : ""}>
            미리보기
          </button>
        </div>
      </div>`;
  }).join("");

  return `
    <div style="${ADMIN_PANEL}">
      <h3 style="margin:0 0 4px;font-size:15px;">검토 필요 — 사람이 확인해야 하는 ${st.total}곡</h3>
      <p style="margin:0 0 10px;font-size:13px;color:var(--muted);line-height:1.6;">
        제목이 비슷한 다른 곡과 섞이는 등 확신도가 낮아 자동으로 올리지 않은 곡들이에요. 폴더를 선택한 뒤
        "미리보기"로 실제 PDF 첫 장을 열어 맞는 곡인지 확인하고, 맞으면 체크한 다음 아래 버튼으로 올리세요.
        틀린 파일이면 체크하지 말고 넘어가면 돼요(나중에 따로 처리). 지금까지 연결됨: <b>${st.done} / ${st.total}</b>곡
        ${st.noFile ? ` · 폴더에 파일 자체가 없는 곡 ${st.noFile}곡은 체크할 수 없어요(아래 목록 맨 위 빨간 글씨 참고)` : ""}
      </p>
      <input type="file" id="admin-review-folder-input" webkitdirectory directory multiple style="display:none;">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
        <button id="admin-review-pick-btn" class="btn ${ADMIN_REVIEW_FOLDER ? "" : "btn-primary admin-dark-btn"}">
          ${ADMIN_REVIEW_FOLDER ? "폴더 다시 선택" : `"판매용 악보" 폴더 선택`}
        </button>
        ${folderInfo}
      </div>
      ${rows.length === 0
        ? `<p style="font-size:13px;color:var(--muted);margin:0;">남은 검토 대상이 없어요. 전부 처리됐습니다.</p>`
        : rowsHTML}
      ${rows.length ? `
        <button id="admin-review-upload-btn" class="btn btn-primary admin-dark-btn" style="margin-top:8px;border-radius:12px;" ${(ADMIN_REVIEW_RUNNING || !ADMIN_REVIEW_FOLDER || ADMIN_REVIEW_CHECKED.size === 0) ? "disabled" : ""}>
          ${ADMIN_REVIEW_RUNNING ? "업로드 중..." : `체크한 ${ADMIN_REVIEW_CHECKED.size}곡 업로드`}
        </button>` : ""}
      <div id="admin-review-log" style="margin-top:10px;max-height:280px;overflow-y:auto;font-size:12px;"></div>
    </div>`;
}

function showPdfPreviewModal(url, title) {
  const old = document.getElementById("pdf-preview-modal");
  if (old) old.remove();
  const overlay = document.createElement("div");
  overlay.id = "pdf-preview-modal";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;flex-direction:column;align-items:center;padding:16px;";
  overlay.innerHTML = `
    <div style="width:100%;max-width:900px;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div style="color:#fff;font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(title || "미리보기")}</div>
      <button id="pdf-preview-close" aria-label="닫기" style="flex-shrink:0;margin-left:12px;width:36px;height:36px;padding:0;border-radius:50%;border:1px solid #d5d0ca;background:transparent;color:#d5d0ca;font-size:18px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
    </div>
    <iframe src="${url}" style="width:100%;max-width:900px;flex:1;background:#fff;border:none;border-radius:8px;"></iframe>
  `;
  document.body.appendChild(overlay);
  const cleanup = () => {
    overlay.remove();
    try { URL.revokeObjectURL(url); } catch (e) {}
  };
  document.getElementById("pdf-preview-close").addEventListener("click", cleanup);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cleanup();
  });
}

function wireAdminReview() {
  document.getElementById("admin-review-pick-btn")?.addEventListener("click", () => {
    document.getElementById("admin-review-folder-input")?.click();
  });
  document.getElementById("admin-review-folder-input")?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const map = new Map();
    for (const f of files) map.set((f.name || "").normalize("NFC"), f);
    ADMIN_REVIEW_FOLDER = map;
    renderAdmin();
  });
  document.querySelectorAll("[data-review-check]").forEach(el => el.addEventListener("change", (e) => {
    const id = el.dataset.reviewCheck;
    if (e.target.checked) ADMIN_REVIEW_CHECKED.add(id);
    else ADMIN_REVIEW_CHECKED.delete(id);
    renderAdmin();
  }));
  document.querySelectorAll("[data-review-preview]").forEach(el => el.addEventListener("click", () => {
    const id = el.dataset.reviewPreview;
    const m = SCORE_PDF_MAPPING_REVIEW.find(x => x.id === id);
    if (!m || !m.file || !ADMIN_REVIEW_FOLDER) return;
    const file = ADMIN_REVIEW_FOLDER.get(m.file.normalize("NFC"));
    if (!file) return;
    const url = URL.createObjectURL(file);
    showPdfPreviewModal(url, m.title || m.file);
  }));
  document.getElementById("admin-review-upload-btn")?.addEventListener("click", () => {
    runReviewUpload();
  });
  renderAdminReviewProgress();
}

function renderAdminReviewProgress() {
  const logEl = document.getElementById("admin-review-log");
  if (!logEl) return;
  const recent = ADMIN_REVIEW_LOG.slice(-200).slice().reverse();
  logEl.innerHTML = recent.map(r => `
    <div style="padding:4px 0;border-top:1px solid var(--border);color:${r.ok ? "var(--text)" : "var(--danger)"};">
      ${r.ok ? "✓" : "✗"} ${esc(r.file)}${r.ok ? "" : ` — ${esc(r.message || "")}`}
    </div>`).join("");
}

async function runReviewUpload() {
  if (ADMIN_REVIEW_RUNNING || !ADMIN_REVIEW_FOLDER) return;
  const ids = Array.from(ADMIN_REVIEW_CHECKED);
  if (ids.length === 0) return;
  ADMIN_REVIEW_RUNNING = true;
  ADMIN_REVIEW_LOG = [];
  renderAdmin();

  let ok = 0, fail = 0;
  for (const id of ids) {
    const m = SCORE_PDF_MAPPING_REVIEW.find(x => x.id === id);
    const score = STATE.scores[id];
    if (!m || !score || !m.file) {
      ADMIN_REVIEW_LOG.push({ file: m ? m.file : id, ok: false, message: "악보 또는 파일 정보를 찾을 수 없음" });
      fail++;
      continue;
    }
    const file = ADMIN_REVIEW_FOLDER.get(m.file.normalize("NFC"));
    if (!file) {
      ADMIN_REVIEW_LOG.push({ file: m.file, ok: false, message: "선택한 폴더에서 이 파일명을 찾지 못함" });
      fail++;
      continue;
    }
    const res = await uploadScoreFile(SCORE_PDF_SELLER_ID, m.id, file);
    if (res.ok) {
      score.fileUrl = res.path;
      // 파일명에 "_프로"가 붙어있으면(예: "...곡명_프로.pdf") 난이도를 세부 5단계의 "프로"로 맞춘다.
      // (2026-10-19: 중급=초중급/중급, 고급=프로/고급 으로 나누기로 한 결정 반영)
      if (/_프로(_\d+)?\.pdf$/i.test(m.file.normalize("NFC"))) score.difficulty = "프로";
      ADMIN_REVIEW_LOG.push({ file: m.file, ok: true });
      ok++;
    } else {
      ADMIN_REVIEW_LOG.push({ file: m.file, ok: false, message: res.message });
      fail++;
    }
  }

  save();
  ADMIN_REVIEW_CHECKED.clear();
  ADMIN_REVIEW_RUNNING = false;
  renderAdmin();
  if (typeof toast === "function") toast(`검토 업로드 완료: 성공 ${ok}건 · 실패 ${fail}건`);
}
