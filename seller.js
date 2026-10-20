/* ============================================================
   seller.js — 판매자 화면
   이 파일은 "판매자/" 모드에서만 작업합니다.

   화면 6개 완성: 아티스트 프로필 / 악보등록 / 내 악보·심사상태 / 판매현황·적립금 / 정산·자동지급 / 고객 문의
   (2026-10-01 결정: 출금 신청 없음. 적립금이 기준 이상이면 매달 지급일에 자동 입금)
   (2026-10-13 추가: 구매자에게 보이는 활동명을 실명과 따로 둘 수 있는 "아티스트 프로필" 패널)
   (2026-10-19 변경: 악보 등록 심사(관리자 승인) 폐지 — 등록하면 바로 노출된다는 안내 문구로 수정)
   ============================================================ */

let SF_TAGS = []; // 악보 등록 폼에서 지금 입력 중인 태그 (제출 성공해야 비움, 최대 5개)
let SF_THUMBNAIL_DATA = null; // 선택한 썸네일 이미지를 읽어둔 데이터 (제출 성공해야 비움)
let SELLER_INQUIRY_OPEN = null; // 펼쳐서 보고 있는 문의 id
let SELLER_DISCOUNT_OPEN = null; // 펼쳐서 할인 설정 중인 악보 id (2026-10-16 추가)
let SELLER_TREND_INST = "";      // 신청곡 트렌드 악기 필터, "" = 전체 (2026-10-16 추가)
let SELLER_TREND_SORT = "requests"; // "requests"(신청 많은 순) | "likes"(좋아요 많은 순) | "latest"(최근 순)
let SELLER_TREND_STATUS = "";    // "" = 전체, 그 외엔 REQUEST_STATUS 값
let SF_SESSION_COUNT = 0;        // 이번 접속(새로고침 전까지)에서 연속으로 등록한 곡 수 (2026-10-18 대량 등록 개선 추가)
let SELLER_MYSCORES_PAGE = 1;    // "내 악보 · 심사상태" 목록 페이지 (2026-10-20 추가)
const SELLER_MYSCORES_PAGE_SIZE = 10; // 한 페이지에 10개씩 (buyer.js의 PAGE_SIZE와는 별개 — 이름 겹치지 않게 분리)

function renderSeller() {
  const el = document.getElementById("view-seller");
  if (!el) return;

  const user = getCurrentUser();

  if (!user || (user.role !== "seller" && user.role !== "both")) {
    el.innerHTML = `
      <div style="padding:32px 16px;text-align:center;color:var(--muted);">
        <p style="font-size:14px;margin:0;">판매자 권한이 있는 계정으로 로그인해야 볼 수 있는 화면입니다.</p>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 16px;margin-bottom:16px;">
      <h2 style="margin:0 0 4px;font-size:17px;">아티스트 프로필</h2>
      <p style="margin:0 0 16px;font-size:13px;color:var(--muted);">악보 목록·상세페이지·아티스트 페이지에 구매자가 보는 이름이에요. 가입할 때 적은 이름과 달라도 괜찮아요.</p>
      <div id="seller-profile-msg" style="font-size:13px;margin:0 0 8px;"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <input type="text" id="sp-displayname" placeholder="예: 그루브랩" maxlength="30"
          style="flex:1;min-width:160px;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;">
        <button id="sp-save"
          style="padding:10px 16px;border:1px solid var(--border);border-radius:8px;background:var(--bg);font-size:13px;cursor:pointer;"
          onmouseover="this.style.background='#F5F2EE';this.style.borderColor='#B9AFA4';this.style.color='#302D2A'"
          onmouseout="this.style.background='var(--bg)';this.style.borderColor='var(--border)';this.style.color=''">
          활동명 저장
        </button>
      </div>
    </div>

    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 16px;margin-bottom:16px;">
      <h2 style="margin:0 0 4px;font-size:17px;">신청곡 트렌드</h2>
      <p style="margin:0 0 14px;font-size:13px;color:var(--muted);">구매자들이 올린 신청곡과 추천(좋아요) 현황이에요. 신청·추천이 많을수록 그만큼 찾는 사람이 많다는 뜻이니, 다음에 만들 악보를 고를 때 참고하세요.</p>
      <div class="chip-row" style="margin-bottom:8px;">
        <button class="chip ${SELLER_TREND_INST ? "" : "active"}" data-trend-inst="">전체 악기</button>
        ${INSTRUMENTS.map(i => `<button class="chip ${SELLER_TREND_INST === i ? "active" : ""}" data-trend-inst="${esc(i)}">${esc(i)}</button>`).join("")}
      </div>
      <div class="chip-row" style="margin-bottom:8px;">
        ${[["", "전체 상태"], ...REQUEST_STATUS.map(s => [s, s])].map(([v, l]) => `<button class="chip ${SELLER_TREND_STATUS === v ? "active" : ""}" data-trend-status="${v}">${esc(l)}</button>`).join("")}
      </div>
      <div class="chip-row" style="margin-bottom:14px;">
        ${[["requests", "신청 많은 순"], ["likes", "좋아요 많은 순"], ["latest", "최근 올라온 순"]].map(([v, l]) => `<button class="chip ${SELLER_TREND_SORT === v ? "active" : ""}" data-trend-sort="${v}">${esc(l)}</button>`).join("")}
      </div>
      <div id="seller-trend-list"></div>
    </div>

    <div id="seller-register-panel" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 16px;margin-bottom:16px;">
      <h2 style="margin:0 0 4px;font-size:17px;">악보 등록</h2>
      <p style="margin:0 0 4px;font-size:13px;color:var(--muted);">등록한 악보는 바로 목록에 노출됩니다. 여러 곡을 올릴 땐 등록 후 이 폼이 비워진 채 그대로 이어서 다음 곡을 입력하면 돼요.</p>
      ${SF_SESSION_COUNT > 0 ? `<p style="margin:0 0 14px;font-size:12px;color:var(--primary-dark);font-weight:600;">이번 접속에서 ${SF_SESSION_COUNT}곡 등록했어요.</p>` : `<div style="margin-bottom:18px;"></div>`}

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
            style="width:100%;margin-top:4px;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--card);">
            <option value="">선택하세요</option>
            ${INSTRUMENTS.map(i => `<option value="${esc(i)}">${esc(i)}</option>`).join("")}
          </select>
        </label>

        <label style="font-size:13px;">
          난이도
          <select id="sf-difficulty"
            style="width:100%;margin-top:4px;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--card);">
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

        <label style="font-size:13px;">
          태그 <span style="color:var(--muted);">(선택 — 영문이름·한글이름·제목 일부 등, 검색에 쓰여요. 최대 5개)</span>
          <div id="sf-tags-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;"></div>
          <input type="text" id="sf-tag-input" placeholder="태그 입력 후 Enter (예: IU, 아이유, 좋은날)"
            style="width:100%;margin-top:6px;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;">
          <span id="sf-tag-hint" style="display:block;margin-top:4px;font-size:11px;color:var(--muted);"></span>
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
          <input type="file" id="sf-file" class="file-input" accept="application/pdf,.pdf"
            style="width:100%;margin-top:4px;padding:8px 0;font-size:13px;">
          <span style="display:block;margin-top:4px;font-size:11px;color:var(--muted);">
            PDF 파일만 올릴 수 있어요 (최대 30MB).
          </span>
        </label>

        <label style="font-size:13px;">
          썸네일 이미지 <span style="color:var(--muted);">(선택 — 비워두면 자동 생성된 그림으로 보여요, 2MB 이하)</span>
          <input type="file" id="sf-thumbnail" accept="image/*" class="file-input"
            style="width:100%;margin-top:4px;padding:8px 0;font-size:13px;">
          <div id="sf-thumbnail-preview" style="margin-top:8px;"></div>
        </label>

        <button id="sf-submit"
          style="margin-top:6px;padding:13px;font-size:15px;border:none;border-radius:10px;background:#33312e;color:var(--on-accent);cursor:pointer;"
          onmouseover="this.style.background='#1f1e1c'" onmouseout="this.style.background='#33312e'">
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

    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 16px;margin-top:16px;">
      <h2 style="margin:0 0 4px;font-size:17px;">고객 문의</h2>
      <p style="margin:0 0 16px;font-size:13px;color:var(--muted);">구매자가 내 악보를 골라서 보낸 1:1 문의입니다. 다른 판매자 악보에 대한 문의는 보이지 않아요.</p>
      <div id="seller-inquiry-msg" style="font-size:13px;margin:0 0 10px;"></div>
      <div id="seller-inquiry-list"></div>
    </div>
  `;

  const dnInput = document.getElementById("sp-displayname");
  if (dnInput) dnInput.value = (user.sellerInfo && user.sellerInfo.displayName) || user.name;
  document.getElementById("sp-save")?.addEventListener("click", () => {
    handleSaveDisplayName(user.id);
  });

  const videoCheck = document.getElementById("sf-hasvideo");
  const videoWrap = document.getElementById("sf-video-wrap");
  videoCheck.addEventListener("change", () => {
    videoWrap.style.display = videoCheck.checked ? "block" : "none";
  });

  const thumbInput = document.getElementById("sf-thumbnail");
  const thumbPreview = document.getElementById("sf-thumbnail-preview");
  renderThumbnailPreview(SF_THUMBNAIL_DATA, thumbPreview);
  thumbInput.addEventListener("change", () => {
    const file = thumbInput.files && thumbInput.files[0];
    const msgEl = document.getElementById("seller-form-msg");
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showSellerMsg(msgEl, "이미지가 너무 커요. 2MB 이하 파일로 올려주세요.", true);
      thumbInput.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      SF_THUMBNAIL_DATA = reader.result;
      renderThumbnailPreview(SF_THUMBNAIL_DATA, thumbPreview);
    };
    reader.readAsDataURL(file);
  });

  renderTagChips();
  const tagInput = document.getElementById("sf-tag-input");
  tagInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTagFromInput();
    }
  });
  tagInput.addEventListener("blur", addTagFromInput);

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
  renderSellerInquiries(user.id);
  renderSellerTrend();
}

/* ---------- 신청곡 트렌드 (2026-10-16 추가) ---------- */

function renderSellerTrend() {
  const listEl = document.getElementById("seller-trend-list");
  if (!listEl) return;

  document.querySelectorAll("[data-trend-inst]").forEach(b => b.addEventListener("click", () => {
    SELLER_TREND_INST = b.dataset.trendInst;
    renderSeller();
  }));
  document.querySelectorAll("[data-trend-status]").forEach(b => b.addEventListener("click", () => {
    SELLER_TREND_STATUS = b.dataset.trendStatus;
    renderSeller();
  }));
  document.querySelectorAll("[data-trend-sort]").forEach(b => b.addEventListener("click", () => {
    SELLER_TREND_SORT = b.dataset.trendSort;
    renderSeller();
  }));

  let list = Object.values(STATE.requests);
  if (SELLER_TREND_INST) list = list.filter(r => r.instrument === SELLER_TREND_INST);
  if (SELLER_TREND_STATUS) list = list.filter(r => r.status === SELLER_TREND_STATUS);

  if (SELLER_TREND_SORT === "likes") {
    list.sort((a, b) => (b.likedBy || []).length - (a.likedBy || []).length || b.buyerIds.length - a.buyerIds.length);
  } else if (SELLER_TREND_SORT === "latest") {
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else {
    list.sort((a, b) => b.buyerIds.length - a.buyerIds.length || (b.likedBy || []).length - (a.likedBy || []).length);
  }

  if (!list.length) {
    listEl.innerHTML = `<p class="muted" style="margin:0;font-size:13px;">해당하는 신청곡이 없어요.</p>`;
    return;
  }

  listEl.innerHTML = list.map(r => {
    const likeCount = (r.likedBy || []).length;
    const score = r.fulfilledScoreId ? STATE.scores[r.fulfilledScoreId] : null;
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--border);">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.title)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">${esc(r.composer)} 작곡 · ${esc(r.singer)} · ${esc(r.instrument)}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap;">
            <span class="status-pill st-${esc(r.status)}">${esc(r.status)}</span>
            <span style="font-size:12px;color:var(--muted);">신청 ${r.buyerIds.length}명 · 추천 ${likeCount}개</span>
          </div>
        </div>
        <div style="flex-shrink:0;">
          ${r.status === "완료"
            ? (score ? `<button class="btn btn-small" data-trend-view="${score.id}">완성된 악보 보기</button>` : `<span style="font-size:12px;color:var(--muted);">완료</span>`)
            : `<button class="btn btn-small" data-trend-fill="${r.id}">이 곡으로 등록하기</button>`}
        </div>
      </div>`;
  }).join("");

  listEl.querySelectorAll("[data-trend-fill]").forEach(b => b.addEventListener("click", () => {
    const r = STATE.requests[b.dataset.trendFill];
    if (!r) return;
    const titleInput = document.getElementById("sf-title");
    const artistInput = document.getElementById("sf-artist");
    const instSelect = document.getElementById("sf-instrument");
    if (titleInput) titleInput.value = r.title;
    if (artistInput) artistInput.value = r.singer;
    if (instSelect) instSelect.value = r.instrument;
    document.getElementById("seller-register-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  listEl.querySelectorAll("[data-trend-view]").forEach(b => b.addEventListener("click", () => {
    if (typeof goBuyer === "function") goBuyer("detail", { id: b.dataset.trendView });
  }));
}

/* ---------- 아티스트 프로필 ---------- */

function handleSaveDisplayName(sellerId) {
  const msgEl = document.getElementById("seller-profile-msg");
  const input = document.getElementById("sp-displayname");
  const name = input ? input.value : "";

  const result = setSellerDisplayName(sellerId, name);
  if (!result.ok) {
    showSellerMsg(msgEl, result.message || "저장에 실패했습니다.", true);
    return;
  }

  renderAll();
  showSellerMsg(document.getElementById("seller-profile-msg"), "활동명이 저장되었습니다.", false);
}

/* ---------- 악보 등록 ---------- */

function renderTagChips() {
  const wrap = document.getElementById("sf-tags-chips");
  const hint = document.getElementById("sf-tag-hint");
  if (!wrap) return;
  wrap.innerHTML = SF_TAGS.map((t, i) => `
    <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:var(--bg);border:1px solid var(--border);font-size:12px;">
      ${esc(t)}
      <button type="button" data-tag-remove="${i}" style="all:unset;cursor:pointer;color:var(--muted);font-size:14px;line-height:1;">×</button>
    </span>`).join("");
  wrap.querySelectorAll("[data-tag-remove]").forEach(b => b.addEventListener("click", () => {
    SF_TAGS.splice(Number(b.dataset.tagRemove), 1);
    renderTagChips();
  }));
  if (hint) hint.textContent = `${SF_TAGS.length}/5개 추가됨`;
}

function renderThumbnailPreview(dataUrl, el) {
  if (!el) return;
  if (!dataUrl) { el.innerHTML = ""; return; }
  el.innerHTML = `<img src="${esc(dataUrl)}" alt="썸네일 미리보기"
    style="width:96px;height:96px;object-fit:cover;border-radius:10px;border:1px solid var(--border);display:block;">`;
}

function addTagFromInput() {
  const input = document.getElementById("sf-tag-input");
  if (!input) return;
  const raw = input.value.trim().replace(/,+$/, "").trim();
  input.value = "";
  if (!raw) return;
  const msgEl = document.getElementById("seller-form-msg");
  if (SF_TAGS.length >= 5) {
    showSellerMsg(msgEl, "태그는 최대 5개까지 입력할 수 있어요.", true);
    return;
  }
  if (SF_TAGS.some(t => t.toLowerCase() === raw.toLowerCase())) return; // 이미 있는 태그는 무시
  SF_TAGS.push(raw.slice(0, 20));
  renderTagChips();
}

async function handleSubmitScore(sellerId) {
  const msgEl = document.getElementById("seller-form-msg");
  const submitBtn = document.getElementById("sf-submit");

  const title = document.getElementById("sf-title").value.trim();
  const artist = document.getElementById("sf-artist").value.trim();
  const instrument = document.getElementById("sf-instrument").value;
  const difficulty = document.getElementById("sf-difficulty").value;
  const priceRaw = document.getElementById("sf-price").value;
  const hasVideo = document.getElementById("sf-hasvideo").checked;
  const videoUrl = document.getElementById("sf-videourl").value.trim();
  const description = document.getElementById("sf-description").value.trim();
  const fileInput = document.getElementById("sf-file");
  const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
  const thumbnailUrl = SF_THUMBNAIL_DATA;
  addTagFromInput(); // 입력창에 남아있는데 Enter를 안 누른 태그도 제출 전에 챙겨준다

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
  if (!file) {
    showSellerMsg(msgEl, "악보 파일을 선택해주세요.", true);
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  showSellerMsg(msgEl, "파일 업로드 중입니다. 잠시만 기다려주세요...", false);

  const scoreId = uid("score");
  const uploadResult = await uploadScoreFile(sellerId, scoreId, file);
  if (!uploadResult.ok) {
    if (submitBtn) submitBtn.disabled = false;
    showSellerMsg(msgEl, uploadResult.message || "파일 업로드에 실패했습니다.", true);
    return;
  }

  // 미리보기 이미지는 PDF에서 최대 5페이지까지 자동으로 만든다(1페이지는 첫 8마디만
  // 잘라서, 2페이지부터는 전체 페이지를 — 블러는 구매자 화면에서 입힘). 여기서 실패해도
  // 악보 등록 자체는 계속 진행한다(미리보기 이미지는 없으면 기존 가짜 그림이 대신 보인다).
  showSellerMsg(msgEl, "미리보기 이미지를 만드는 중입니다...", false);
  let previewUrls = null;
  try {
    const previewBlobs = await generateScorePreviewImages(file, 5);
    if (previewBlobs && previewBlobs.length) {
      const previewUpload = await uploadScorePreviewImages(sellerId, scoreId, previewBlobs);
      if (previewUpload.ok && previewUpload.urls.length) previewUrls = previewUpload.urls;
    }
  } catch (e) {
    console.error("[seller] 미리보기 이미지 처리 중 오류", e);
  }

  // 악보 상세정보에 보여줄 총 페이지 수도 함께 알아낸다(실패해도 등록은 계속 진행).
  let pageCount = null;
  try {
    pageCount = await getPdfPageCount(file);
  } catch (e) {
    console.error("[seller] PDF 페이지 수 확인 중 오류", e);
  }

  // 목록/홈 카드에 쓸 "첫 페이지 전체" 썸네일도 함께 만든다(2026-10-21 추가). 미리보기
  // 이미지(42% 크롭)와는 별개 이미지이며, 실패해도 등록은 계속 진행한다(없으면 카드에서
  // 기존 42% 크롭 미리보기 이미지로 대체해서 보여준다).
  showSellerMsg(msgEl, "카드 썸네일을 만드는 중입니다...", false);
  let cardThumbUrl = null;
  try {
    const cardThumbBlob = await generateScoreCardThumbnail(file);
    if (cardThumbBlob) {
      const cardThumbUpload = await uploadScoreCardThumbnail(sellerId, scoreId, cardThumbBlob);
      if (cardThumbUpload.ok && cardThumbUpload.url) cardThumbUrl = cardThumbUpload.url;
    }
  } catch (e) {
    console.error("[seller] 카드 썸네일 처리 중 오류", e);
  }

  const result = submitScore(sellerId, {
    id: scoreId,
    title, artist, instrument, difficulty, price,
    hasVideo,
    videoUrl: hasVideo ? videoUrl : null,
    fileUrl: uploadResult.path,
    previewUrls,
    pageCount,
    cardThumbUrl,
    description,
    tags: SF_TAGS,
    thumbnailUrl
  });

  if (!result.ok) {
    if (submitBtn) submitBtn.disabled = false;
    showSellerMsg(msgEl, result.message || "등록에 실패했습니다.", true);
    return;
  }

  SF_TAGS = [];
  SF_THUMBNAIL_DATA = null;
  SF_SESSION_COUNT += 1;
  SELLER_MYSCORES_PAGE = 1; // 새로 등록한 악보가 맨 위(최신순)라서 1페이지로 돌아가야 바로 보인다
  renderSeller();
  // 등록 성공 안내는 폼 안쪽 인라인 문구 대신 화면 중앙 모달로 표시한다 (2026-10-19 변경).
  // 모달을 닫으면(확인 버튼/배경 클릭/ESC 공통) 그동안 폼으로 스크롤 + 다음 곡 입력을 위해 포커스를 옮긴다.
  showScoreSuccessModal(title, () => {
    document.getElementById("seller-register-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("sf-title")?.focus();
  });
}

function showSellerMsg(el, text, isError) {
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? "var(--danger)" : "var(--primary)";
}

/* ---------- 내 악보 · 심사상태 ---------- */

const SCORE_STATUS_COLOR = {
  "등록": "#625950",
  "심사중": "#8a6420",
  "승인": "var(--primary-dark)",
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

  // 2026-10-20 추가: 10개씩 페이지로 나눠서 보여주고, 그 이상은 buyer.js의 테두리 없는
  // 화살표 페이지네이션(renderPager/pagerArrowIcon, store.pager CSS 재사용)으로 넘겨본다.
  const pages = Math.max(1, Math.ceil(myScores.length / SELLER_MYSCORES_PAGE_SIZE));
  const current = Math.min(Math.max(1, SELLER_MYSCORES_PAGE), pages);
  SELLER_MYSCORES_PAGE = current;
  const shown = myScores.slice((current - 1) * SELLER_MYSCORES_PAGE_SIZE, current * SELLER_MYSCORES_PAGE_SIZE);

  wrap.innerHTML = shown.map(s => {
    const color = SCORE_STATUS_COLOR[s.status] || "#625950";
    const videoBadge = s.hasVideo
      ? `<span style="display:inline-flex;align-items:center;gap:3px;margin-left:6px;padding:2px 6px;border-radius:5px;background:var(--primary-soft);color:var(--primary-dark);font-size:11px;">${videoIconArt(12)} 영상</span>`
      : "";
    const rejectBlock = s.status === "반려"
      ? `<div style="margin-top:8px;padding:10px;background:color-mix(in oklch,var(--danger) 10%,var(--card));border-radius:8px;font-size:12px;color:var(--danger);">
           반려 사유: ${esc(s.rejectReason || "사유 없음")}<br>
           <span style="color:var(--muted);">위 내용을 고쳐서 폼에서 다시 등록해주세요.</span>
         </div>`
      : "";

    /* 2026-10-16 추가: 승인된 악보만 판매자가 직접 할인율·기간을 설정/해제할 수 있다 */
    const discountBlock = s.status === "승인" ? renderDiscountPanel(s) : "";

    return `
      <div style="padding:12px 0;border-top:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-size:14px;font-weight:600;">${esc(s.title)} ${videoBadge}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">
              ${esc(s.artist)} · ${esc(s.instrument)} · ${esc(s.difficulty)} · ${formatPoint(s.price)}
            </div>
          </div>
          <span style="flex-shrink:0;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;color:${color};background:color-mix(in oklch,${color} 14%,var(--card));">
            ${esc(s.status)}
          </span>
        </div>
        ${rejectBlock}
        ${discountBlock}
      </div>
    `;
  }).join("") + (pages > 1 ? renderPager(current, pages) : "");

  wrap.querySelectorAll("[data-page]").forEach(b => b.addEventListener("click", () => {
    SELLER_MYSCORES_PAGE = Number(b.dataset.page);
    renderMyScores(sellerId);
  }));
  wrap.querySelectorAll("[data-page-nav]").forEach(b => b.addEventListener("click", () => {
    if (b.disabled) return;
    SELLER_MYSCORES_PAGE = current + (b.dataset.pageNav === "prev" ? -1 : 1);
    renderMyScores(sellerId);
  }));
  wrap.querySelectorAll("[data-disc-toggle]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.discToggle;
    SELLER_DISCOUNT_OPEN = SELLER_DISCOUNT_OPEN === id ? null : id;
    renderMyScores(sellerId);
  }));
  wrap.querySelectorAll("[data-disc-apply]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.discApply;
    const rateVal = document.getElementById(`disc-rate-${id}`).value;
    const startVal = document.getElementById(`disc-start-${id}`).value;
    const endVal = document.getElementById(`disc-end-${id}`).value;
    const msgEl = document.getElementById(`disc-msg-${id}`);
    if (!startVal || !endVal) {
      showSellerMsg(msgEl, "시작일과 종료일을 모두 선택해주세요.", true);
      return;
    }
    const res = setScoreDiscount(sellerId, id, rateVal, `${startVal}T00:00:00`, `${endVal}T23:59:59`);
    if (!res.ok) { showSellerMsg(msgEl, res.message, true); return; }
    renderAll();
    showSellerMsg(document.getElementById(`disc-msg-${id}`), "할인이 적용되었습니다.", false);
  }));
  wrap.querySelectorAll("[data-disc-clear]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.discClear;
    const res = clearScoreDiscount(sellerId, id);
    const msgEl = document.getElementById(`disc-msg-${id}`);
    if (!res.ok) { showSellerMsg(msgEl, res.message, true); return; }
    renderAll();
    showSellerMsg(document.getElementById(`disc-msg-${id}`), "할인이 해제되었습니다.", false);
  }));
}

/* 2026-10-16 추가: 악보 한 건의 할인 설정 토글 + 입력 패널 */
function renderDiscountPanel(s) {
  const open = SELLER_DISCOUNT_OPEN === s.id;
  const active = activeDiscount(s);
  const d = s.discount;

  let statusLine;
  if (active) {
    statusLine = `<span style="color:var(--primary);">할인 적용 중 · ${Math.round(active.rate * 100)}% · ${formatPoint(effectivePrice(s))} (정가 ${formatPoint(s.price)}) · ~${formatDate(active.endAt)}까지</span>`;
  } else if (d) {
    statusLine = `<span style="color:var(--muted);">할인 예약됨 · ${Math.round(d.rate * 100)}% · ${formatDate(d.startAt)} ~ ${formatDate(d.endAt)}</span>`;
  } else {
    statusLine = `<span style="color:var(--muted);">적용 중인 할인이 없습니다.</span>`;
  }

  const toDateInput = (iso) => iso ? new Date(iso).toISOString().slice(0, 10) : "";

  return `
    <div style="margin-top:8px;">
      <button type="button" data-disc-toggle="${s.id}" style="all:unset;cursor:pointer;font-size:12px;color:var(--primary);text-decoration:underline;">
        ${open ? "할인 설정 닫기 ▲" : "할인 설정 ▾"}
      </button>
      <div style="margin-top:6px;font-size:12px;">${statusLine}</div>
      ${open ? `
        <div style="margin-top:10px;padding:12px;background:var(--bg);border-radius:8px;display:flex;flex-direction:column;gap:8px;">
          <div id="disc-msg-${s.id}" style="font-size:12px;"></div>
          <label style="font-size:12px;">
            할인율 (%)
            <input type="number" id="disc-rate-${s.id}" min="${Math.round(POLICY.discount.minRate * 100)}" max="${Math.round(POLICY.discount.maxRate * 100)}"
              value="${d ? Math.round(d.rate * 100) : ""}" placeholder="예: 30"
              style="width:100%;margin-top:4px;padding:9px;border:1px solid var(--border);border-radius:8px;font-size:13px;">
          </label>
          <div style="display:flex;gap:8px;">
            <label style="font-size:12px;flex:1;">
              시작일
              <input type="date" id="disc-start-${s.id}" value="${toDateInput(d && d.startAt)}"
                style="width:100%;margin-top:4px;padding:9px;border:1px solid var(--border);border-radius:8px;font-size:13px;">
            </label>
            <label style="font-size:12px;flex:1;">
              종료일
              <input type="date" id="disc-end-${s.id}" value="${toDateInput(d && d.endAt)}"
                style="width:100%;margin-top:4px;padding:9px;border:1px solid var(--border);border-radius:8px;font-size:13px;">
            </label>
          </div>
          <div style="display:flex;gap:8px;">
            <button data-disc-apply="${s.id}" class="btn btn-primary btn-small">할인 적용</button>
            ${d ? `<button data-disc-clear="${s.id}" class="btn btn-small" style="background:var(--card);border:1px solid var(--border);">할인 해제</button>` : ""}
          </div>
        </div>
      ` : ""}
    </div>
  `;
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
  "요청": "#8a6420",
  "지급완료": "var(--primary-dark)"
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
    const color = WITHDRAW_STATUS_COLOR[w.status] || "#625950";
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:1px solid var(--border);font-size:13px;">
        <div>
          <div>${formatWon(w.amount)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">
            ${w.paidAt ? `지급일 ${formatDate(w.paidAt)}` : "다음 지급일에 함께 입금 예정"}
          </div>
        </div>
        <span style="padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;color:${color};background:color-mix(in oklch,${color} 14%,var(--card));">
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
    seller.sellerInfo = { bankName: "", bankAccount: "", accountHolder: "", settleBalance: 0, displayName: seller.name };
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

/* ---------- 고객 문의 ---------- */

function renderSellerInquiries(sellerId) {
  const listEl = document.getElementById("seller-inquiry-list");
  if (!listEl) return;

  const list = getSellerInquiries(sellerId);
  if (list.length === 0) {
    listEl.innerHTML = `<p style="font-size:13px;color:var(--muted);margin:0;">아직 들어온 문의가 없습니다.</p>`;
    return;
  }

  listEl.innerHTML = list.map(q => {
    const open = SELLER_INQUIRY_OPEN === q.id;
    const buyer = STATE.users[q.buyerId];
    const score = q.scoreId && STATE.scores[q.scoreId];
    const color = q.status === "답변완료" ? "var(--primary-dark)" : "#8a6420";
    return `
      <div style="padding:12px 0;border-top:1px solid var(--border);">
        <button type="button" data-inq-toggle="${q.id}" style="all:unset;cursor:pointer;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;width:100%;">
          <span style="min-width:0;">
            <b style="font-size:14px;">${esc(q.title)}</b>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">
              ${esc(buyer ? buyer.name : "탈퇴 회원")} · ${esc(q.category)}${score ? ` · ${esc(score.title)}` : ""} · ${formatDate(q.createdAt)}
            </div>
          </span>
          <span style="flex-shrink:0;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;color:${color};background:color-mix(in oklch,${color} 14%,var(--card));">${esc(q.status)}</span>
        </button>
        ${open ? `
          <div style="margin-top:10px;font-size:13px;line-height:1.6;">
            <div style="white-space:pre-wrap;">${esc(q.content)}</div>
            ${q.answer ? `
              <div style="margin-top:10px;padding:10px;border-radius:8px;background:var(--bg);">
                <b style="font-size:12px;color:var(--primary);">${q.answer.by === "seller" ? "내 답변" : "관리자 답변"} · ${formatDate(q.answer.answeredAt)}</b>
                <div style="margin-top:4px;white-space:pre-wrap;">${esc(q.answer.text)}</div>
              </div>` : `
              <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
                <textarea id="inq-answer-${q.id}" rows="3" placeholder="답변을 입력하세요"
                  style="width:100%;padding:9px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;"></textarea>
                <button data-inq-answer="${q.id}" class="btn btn-primary btn-small" style="align-self:flex-start;">답변 등록</button>
              </div>`}
          </div>` : ""}
      </div>`;
  }).join("");

  listEl.querySelectorAll("[data-inq-toggle]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.inqToggle;
    SELLER_INQUIRY_OPEN = SELLER_INQUIRY_OPEN === id ? null : id;
    renderSellerInquiries(sellerId);
  }));
  listEl.querySelectorAll("[data-inq-answer]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.inqAnswer;
    const text = document.getElementById(`inq-answer-${id}`).value;
    const res = answerInquiry(id, "seller", sellerId, text);
    const msgEl = document.getElementById("seller-inquiry-msg");
    if (!res.ok) { showSellerMsg(msgEl, res.message, true); return; }
    renderAll();
    showSellerMsg(document.getElementById("seller-inquiry-msg"), "답변을 등록했습니다.", false);
  }));
}
