/* ============================================================
   seller.js — 판매자 화면
   이 파일은 "판매자/" 모드에서만 작업합니다.

   화면 4개 완성: 악보등록 / 내 악보·심사상태 / 판매현황·적립금 / 정산·자동지급
   (2026-10-01 결정: 출금 신청 없음. 적립금이 기준 이상이면 매달 지급일에 자동 입금)
   ============================================================ */

function renderSeller() {
  const el = document.getElementById("view-seller");
  if (!el) return;

  const user = getCurrentUser();

  if (!user || (user.role !== "seller" && user.role !== "both")) {
    el.innerHTML = `
      <div style="padding:32px 16px;text-align:center;color:#999;">
        <p style="font-size:14px;margin:0;">판매자 권한이 있는 계정으로 로그인해야 볼 수 있는 화면입니다.</p>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 16px;margin-bottom:16px;">
      <h2 style="margin:0 0 4px;font-size:17px;">악보 등록</h2>
      <p style="margin:0 0 18px;font-size:13px;color:var(--muted);">등록한 악보는 관리자 심사 후 승인되면 목록에 노출됩니다.</p>

      <div id="seller-form-msg" style="font-size:13px;margin:0 0 12px;"></div>

      <div style="display:flex;flex-direction:column;gap:12px;">

        <label style="font-size:13px;">
          곡 제목
          <input type="text" id="sf-title" placeholder="예: 좋은 날"
            style="width:100%;margin-top:4px;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;">
        </label>

        <label style="font-size:13px;">
          아티스트명
          <input type="text" id="sf-artist" placeholder="예: 아이유"
            style="width:100%;margin-top:4px;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;">
        </label>

        <label style="font-size:13px;">
          악기
          <select id="sf-instrument"
            style="width:100%;margin-top:4px;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:#fff;">
            <option value="">선택하세요</option>
            ${INSTRUMENTS.map(i => `<option value="${esc(i)}">${esc(i)}</option>`).join("")}
          </select>
        </label>

        <label style="font-size:13px;">
          난이도
          <select id="sf-difficulty"
            style="width:100%;margin-top:4px;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:#fff;">
            <option value="">선택하세요</option>
            ${DIFFICULTIES.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("")}
          </select>
        </label>

        <label style="font-size:13px;">
          가격 (포인트)
          <input type="number" id="sf-price" min="0" step="100" placeholder="예: 3000"
            style="width:100%;margin-top:4px;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;">
        </label>

        <label style="font-size:13px;">
          악보 소개 <span style="color:var(--muted);">(선택 — 상세 페이지에 그대로 보여요)</span>
          <textarea id="sf-description" rows="4" placeholder="예: 사용된 테크닉, 연습 팁, 원곡과 다른 점"
            style="width:100%;margin-top:4px;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;resize:vertical;"></textarea>
        </label>

        <label style="font-size:13px;display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="sf-original" style="width:16px;height:16px;">
          <span>창작·오리지널 편곡입니다 <span style="color:var(--muted);">(수수료 20% 적용, 일반 편곡은 25%)</span></span>
        </label>

        <label style="font-size:13px;display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="sf-hasvideo" style="width:16px;height:16px;">
          <span>연주 영상이 있습니다</span>
        </label>

        <div id="sf-video-wrap" style="display:none;">
          <label style="font-size:13px;">
            영상 링크
            <input type="text" id="sf-videourl" placeholder="유튜브 링크 등"
              style="width:100%;margin-top:4px;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;">
          </label>
        </div>

        <label style="font-size:13px;">
          악보 파일
          <input type="file" id="sf-file"
            style="width:100%;margin-top:4px;padding:8px 0;font-size:13px;">
          <span style="display:block;margin-top:4px;font-size:11px;color:var(--muted);">
            지금은 파일 이름만 임시로 저장됩니다. 실제 파일 업로드·다운로드는 서버가 준비되면 연결됩니다.
          </span>
        </label>

        <button id="sf-submit"
          style="margin-top:6px;padding:13px;font-size:15px;border:none;border-radius:10px;background:var(--primary);color:#fff;cursor:pointer;">
          등록하기
        </button>

      </div>
    </div>

    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 16px;margin-bottom:16px;">
      <h2 style="margin:0 0 4px;font-size:17px;">내 악보 · 심사상태</h2>
      <p style="margin:0 0 16px;font-size:13px;color:var(--muted);">등록한 악보의 심사 진행 상황입니다.
        <button id="seller-store-link" style="margin-left:6px;border:none;background:none;color:var(--primary);font-size:13px;cursor:pointer;padding:0;text-decoration:underline;">구매자에게 보이는 내 아티스트 페이지 ›</button>
      </p>
      <div id="seller-my-scores"></div>
    </div>

    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 16px;margin-bottom:16px;">
      <h2 style="margin:0 0 4px;font-size:17px;">판매현황 · 적립금</h2>
      <p style="margin:0 0 16px;font-size:13px;color:var(--muted);">판매된 악보와 정산 대기 적립금입니다.</p>
      <div id="seller-sales-summary"></div>
      <div id="seller-sales-by-score" style="margin-top:16px;"></div>
      <div id="seller-recent-purchases" style="margin-top:16px;"></div>
    </div>

    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 16px;">
      <h2 style="margin:0 0 4px;font-size:17px;">정산 · 자동 지급</h2>
      <p style="margin:0 0 16px;font-size:13px;color:var(--muted);">출금 신청은 따로 하지 않아도 돼요. 적립금이 ${formatWon(POLICY.settlement.minWithdraw)} 이상이면 매달 ${POLICY.settlement.payoutDay}일에 아래 계좌로 자동 입금됩니다.</p>

      <div id="seller-payout-status" style="margin-bottom:18px;"></div>

      <h3 style="margin:0 0 8px;font-size:14px;">정산 계좌 정보</h3>
      <div id="seller-bank-msg" style="font-size:13px;margin:0 0 8px;"></div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:18px;">
        <input type="text" id="sb-bankname" placeholder="은행명"
          style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;">
        <input type="text" id="sb-account" placeholder="계좌번호"
          style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;">
        <input type="text" id="sb-holder" placeholder="예금주"
          style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;">
        <button id="sb-save"
          style="padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);font-size:13px;cursor:pointer;">
          계좌 정보 저장
        </button>
      </div>

      <h3 style="margin:0 0 8px;font-size:14px;">지급 내역</h3>
      <div id="seller-withdraw-history"></div>
    </div>
  `;

  const videoCheck = document.getElementById("sf-hasvideo");
  const videoWrap = document.getElementById("sf-video-wrap");
  videoCheck.addEventListener("change", () => {
    videoWrap.style.display = videoCheck.checked ? "block" : "none";
  });

  document.getElementById("sf-submit").addEventListener("click", () => {
    handleSubmitScore(user.id);
  });

  document.getElementById("seller-store-link")?.addEventListener("click", () => {
    if (typeof goBuyer === "function") goBuyer("artist", { id: user.id });
  });

  document.getElementById("sb-save").addEventListener("click", () => {
    handleSaveBankInfo(user.id);
  });

  renderMyScores(user.id);
  renderSalesStatus(user.id);
  renderWithdrawSection(user.id);
}

/* ---------- 악보 등록 ---------- */

function handleSubmitScore(sellerId) {
  const msgEl = document.getElementById("seller-form-msg");

  const title = document.getElementById("sf-title").value.trim();
  const artist = document.getElementById("sf-artist").value.trim();
  const instrument = document.getElementById("sf-instrument").value;
  const difficulty = document.getElementById("sf-difficulty").value;
  const priceRaw = document.getElementById("sf-price").value;
  const isOriginal = document.getElementById("sf-original").checked;
  const hasVideo = document.getElementById("sf-hasvideo").checked;
  const videoUrl = document.getElementById("sf-videourl").value.trim();
  const description = document.getElementById("sf-description").value.trim();
  const fileInput = document.getElementById("sf-file");
  const fileName = fileInput.files && fileInput.files[0] ? fileInput.files[0].name : "";

  if (!title || !artist || !instrument || !difficulty || !priceRaw) {
    showSellerMsg(msgEl, "모든 항목을 입력해주세요.", true);
    return;
  }
  const price = Number(priceRaw);
  if (!Number.isFinite(price) || price <= 0) {
    showSellerMsg(msgEl, "가격을 올바르게 입력해주세요.", true);
    return;
  }
  if (hasVideo && !videoUrl) {
    showSellerMsg(msgEl, "영상이 있다고 체크했으면 영상 링크도 입력해주세요.", true);
    return;
  }
  if (!fileName) {
    showSellerMsg(msgEl, "악보 파일을 선택해주세요.", true);
    return;
  }

  const result = submitScore(sellerId, {
    title, artist, instrument, difficulty, price,
    isOriginal, hasVideo,
    videoUrl: hasVideo ? videoUrl : null,
    fileUrl: fileName,
    description
  });

  if (!result.ok) {
    showSellerMsg(msgEl, result.message || "등록에 실패했습니다.", true);
    return;
  }

  renderSeller();
  const newMsgEl = document.getElementById("seller-form-msg");
  showSellerMsg(newMsgEl, `"${esc(title)}" 등록되었습니다. 관리자 심사 후 승인되면 노출됩니다.`, false);
}

function showSellerMsg(el, text, isError) {
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? "var(--danger)" : "var(--primary)";
}

/* ---------- 내 악보 · 심사상태 ---------- */

const SCORE_STATUS_COLOR = {
  "등록": "#888",
  "심사중": "#a3792f",
  "승인": "var(--primary)",
  "반려": "var(--danger)"
};

function renderMyScores(sellerId) {
  const wrap = document.getElementById("seller-my-scores");
  if (!wrap) return;

  const myScores = Object.values(STATE.scores)
    .filter(s => s.sellerId === sellerId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (myScores.length === 0) {
    wrap.innerHTML = `<p style="font-size:13px;color:var(--muted);margin:0;">아직 등록한 악보가 없습니다. 위 폼으로 첫 악보를 등록해보세요.</p>`;
    return;
  }

  wrap.innerHTML = myScores.map(s => {
    const color = SCORE_STATUS_COLOR[s.status] || "#888";
    const videoBadge = s.hasVideo
      ? `<span style="display:inline-block;margin-left:6px;padding:2px 6px;border-radius:5px;background:#eef4f0;color:var(--primary);font-size:11px;">🎬 영상</span>`
      : "";
    const rejectBlock = s.status === "반려"
      ? `<div style="margin-top:8px;padding:10px;background:#fdf1ee;border-radius:8px;font-size:12px;color:var(--danger);">
           반려 사유: ${esc(s.rejectReason || "사유 없음")}<br>
           <span style="color:var(--muted);">위 내용을 고쳐서 폼에서 다시 등록해주세요.</span>
         </div>`
      : "";

    return `
      <div style="padding:12px 0;border-top:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-size:14px;font-weight:600;">${esc(s.title)} ${videoBadge}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">
              ${esc(s.artist)} · ${esc(s.instrument)} · ${esc(s.difficulty)} · ${formatPoint(s.price)}
              ${s.isOriginal ? " · 오리지널" : ""}
            </div>
          </div>
          <span style="flex-shrink:0;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;color:#fff;background:${color};">
            ${esc(s.status)}
          </span>
        </div>
        ${rejectBlock}
      </div>
    `;
  }).join("");
}

/* ---------- 판매현황 · 적립금 ---------- */

function renderSalesStatus(sellerId) {
  const seller = STATE.users[sellerId];
  const sellerInfo = seller && seller.sellerInfo ? seller.sellerInfo : { settleBalance: 0 };

  const myPurchases = Object.values(STATE.purchases)
    .filter(p => p.sellerId === sellerId)
    .sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt));

  const validPurchases = myPurchases.filter(p => !p.refunded);
  const totalSalesCount = validPurchases.length;
  const totalEarning = validPurchases.reduce((sum, p) => sum + p.sellerEarning, 0);

  /* 요약 */
  const summaryEl = document.getElementById("seller-sales-summary");
  const canWithdraw = sellerInfo.settleBalance >= POLICY.settlement.minWithdraw;
  summaryEl.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <div style="flex:1;min-width:120px;padding:14px;background:var(--bg);border-radius:10px;">
        <div style="font-size:12px;color:var(--muted);">총 판매 건수</div>
        <div style="font-size:18px;font-weight:700;margin-top:4px;">${totalSalesCount}건</div>
      </div>
      <div style="flex:1;min-width:120px;padding:14px;background:var(--bg);border-radius:10px;">
        <div style="font-size:12px;color:var(--muted);">누적 정산액</div>
        <div style="font-size:18px;font-weight:700;margin-top:4px;">${formatWon(totalEarning)}</div>
      </div>
      <div style="flex:1;min-width:120px;padding:14px;background:var(--bg);border-radius:10px;">
        <div style="font-size:12px;color:var(--muted);">지급 예정 적립금</div>
        <div style="font-size:18px;font-weight:700;margin-top:4px;color:${canWithdraw ? "var(--primary)" : "var(--text)"};">
          ${formatWon(sellerInfo.settleBalance)}
        </div>
      </div>
    </div>
    <p style="margin:10px 0 0;font-size:12px;color:var(--muted);">
      ${canWithdraw
        ? `${formatWon(POLICY.settlement.minWithdraw)} 이상 모였어요. 다음 ${POLICY.settlement.payoutDay}일에 자동으로 입금됩니다.`
        : `${formatWon(POLICY.settlement.minWithdraw - sellerInfo.settleBalance)} 더 모이면 다음 ${POLICY.settlement.payoutDay}일에 자동으로 입금됩니다.`}
    </p>
  `;

  /* 악보별 판매 현황 */
  const byScoreEl = document.getElementById("seller-sales-by-score");
  const myScores = Object.values(STATE.scores).filter(s => s.sellerId === sellerId && s.salesCount > 0);

  if (myScores.length === 0) {
    byScoreEl.innerHTML = `<p style="font-size:13px;color:var(--muted);margin:0;">아직 판매된 악보가 없습니다.</p>`;
  } else {
    const rows = myScores
      .sort((a, b) => b.salesCount - a.salesCount)
      .map(s => {
        const rate = calcCommission(s);
        const earningEach = Math.round(s.price * (1 - rate));
        return `
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid var(--border);font-size:13px;">
            <span>${esc(s.title)}</span>
            <span style="color:var(--muted);">${s.salesCount}건 · 건당 ${formatWon(earningEach)} (수수료 ${Math.round(rate * 100)}%)</span>
          </div>
        `;
      }).join("");
    byScoreEl.innerHTML = `<h3 style="margin:0 0 4px;font-size:14px;">악보별 판매 현황</h3>${rows}`;
  }

  /* 최근 판매 내역 */
  const recentEl = document.getElementById("seller-recent-purchases");
  if (myPurchases.length === 0) {
    recentEl.innerHTML = "";
  } else {
    const rows = myPurchases.slice(0, 10).map(p => {
      const score = STATE.scores[p.scoreId];
      const statusLabel = p.refunded
        ? `<span style="color:var(--danger);">환불됨</span>`
        : `<span style="color:var(--primary);">정산 ${formatWon(p.sellerEarning)}</span>`;
      return `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid var(--border);font-size:13px;">
          <span>${formatDate(p.purchasedAt)} · ${esc(score ? score.title : p.scoreId)}</span>
          <span>${statusLabel}</span>
        </div>
      `;
    }).join("");
    recentEl.innerHTML = `<h3 style="margin:0 0 4px;font-size:14px;">최근 판매 내역</h3>${rows}`;
  }
}

/* ---------- 정산 · 자동 지급 ---------- */

const WITHDRAW_STATUS_COLOR = {
  "요청": "#a3792f",
  "지급완료": "var(--primary)"
};

function renderWithdrawSection(sellerId) {
  const seller = STATE.users[sellerId];
  const info = seller && seller.sellerInfo ? seller.sellerInfo : {};

  const nameInput = document.getElementById("sb-bankname");
  const accInput = document.getElementById("sb-account");
  const holderInput = document.getElementById("sb-holder");
  if (nameInput) nameInput.value = info.bankName || "";
  if (accInput) accInput.value = info.bankAccount || "";
  if (holderInput) holderInput.value = info.accountHolder || "";

  renderPayoutStatus(seller);

  const historyEl = document.getElementById("seller-withdraw-history");
  const myWithdrawals = Object.values(STATE.withdrawals)
    .filter(w => w.sellerId === sellerId)
    .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

  if (myWithdrawals.length === 0) {
    historyEl.innerHTML = `<p style="font-size:13px;color:var(--muted);margin:0;">아직 지급된 내역이 없습니다.</p>`;
    return;
  }

  historyEl.innerHTML = myWithdrawals.map(w => {
    const color = WITHDRAW_STATUS_COLOR[w.status] || "#888";
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:1px solid var(--border);font-size:13px;">
        <div>
          <div>${formatWon(w.amount)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">
            ${w.paidAt ? `지급일 ${formatDate(w.paidAt)}` : "다음 지급일에 함께 입금 예정"}
          </div>
        </div>
        <span style="padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;color:#fff;background:${color};">
          ${esc(w.status)}
        </span>
      </div>
    `;
  }).join("");
}

function handleSaveBankInfo(sellerId) {
  const msgEl = document.getElementById("seller-bank-msg");
  const bankName = document.getElementById("sb-bankname").value.trim();
  const bankAccount = document.getElementById("sb-account").value.trim();
  const accountHolder = document.getElementById("sb-holder").value.trim();

  if (!bankName || !bankAccount || !accountHolder) {
    showSellerMsg(msgEl, "은행명, 계좌번호, 예금주를 모두 입력해주세요.", true);
    return;
  }

  const seller = STATE.users[sellerId];
  if (!seller.sellerInfo) {
    seller.sellerInfo = { bankName: "", bankAccount: "", accountHolder: "", settleBalance: 0 };
  }
  seller.sellerInfo.bankName = bankName;
  seller.sellerInfo.bankAccount = bankAccount;
  seller.sellerInfo.accountHolder = accountHolder;
  save();
  renderAll();

  const newMsgEl = document.getElementById("seller-bank-msg");
  showSellerMsg(newMsgEl, "계좌 정보가 저장되었습니다.", false);
}

function renderPayoutStatus(seller) {
  const el = document.getElementById("seller-payout-status");
  if (!el || !seller) return;
  const info = seller.sellerInfo || { settleBalance: 0 };
  const pending = Object.values(STATE.withdrawals)
    .filter(w => w.sellerId === seller.id && w.status === "요청")
    .reduce((sum, w) => sum + w.amount, 0);
  const total = Math.max(0, info.settleBalance) + pending;
  const d = nextPayoutDate();
  const dateText = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  const min = POLICY.settlement.minWithdraw;

  let tone = "var(--bg)";
  let text;
  if (!hasBankInfo(seller)) {
    tone = "#fdf1ee";
    text = `<b style="color:var(--danger);">정산 계좌를 등록해주세요.</b><br><span style="color:var(--muted);">계좌가 없으면 ${formatWon(min)}이 넘어도 지급 목록에서 빠져요.</span>`;
  } else if (total >= min) {
    tone = "#eef4f0";
    text = `<b style="color:var(--primary);">${dateText} 지급 예정 · ${formatWon(total)}</b><br><span style="color:var(--muted);">${esc(info.bankName)} ${esc(info.bankAccount)} (${esc(info.accountHolder)})로 입금돼요.</span>`;
  } else {
    text = `<b>현재 적립금 ${formatWon(total)}</b><br><span style="color:var(--muted);">${formatWon(min - total)} 더 모이면 다음 ${POLICY.settlement.payoutDay}일에 자동으로 입금돼요.</span>`;
  }
  el.innerHTML = `<div style="padding:14px;border-radius:10px;background:${tone};font-size:13px;line-height:1.6;">${text}</div>`;
}
