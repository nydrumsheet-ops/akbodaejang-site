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
let SELLER_EDIT_OPEN = null;      // 펼쳐서 수정 중인 악보 id (2026-10-30 추가)
let SELLER_DELETE_CONFIRM = null; // "정말 삭제할까요?" 확인 중인 악보 id (2026-10-30 추가)
let SELLER_SCORE_BUSY = null;     // 저장·판매상태 변경·삭제 처리 중인 악보 id (2026-10-30 추가)
let SELLER_MYSCORES_Q = "";       // 내 악보 검색어(제목·가수·태그) (2026-10-30 추가)
let SELLER_MYSCORES_FILTER = "all"; // 내 악보 상태 필터: all | sale | stopped | discount (2026-10-30 추가)
let SELLER_TAB = null;            // 판매자 센터 탭 (2026-10-30 추가): scores | register | sales | trend | inquiries | profile
const SELLER_TABS = [["scores", "내 악보"], ["register", "악보 등록"], ["sales", "판매·정산"], ["trend", "신청곡 트렌드"], ["inquiries", "고객 문의"], ["profile", "프로필"]];
let SELLER_TREND_INST = "";      // 신청곡 트렌드 악기 필터, "" = 전체 (2026-10-16 추가)
let SELLER_TREND_SORT = "requests"; // "requests"(신청 많은 순) | "likes"(좋아요 많은 순) | "latest"(최근 순)
let SELLER_TREND_STATUS = "";    // "" = 전체, 그 외엔 REQUEST_STATUS 값
let SF_SESSION_COUNT = 0;        // 이번 접속(새로고침 전까지)에서 연속으로 등록한 곡 수 (2026-10-18 대량 등록 개선 추가)
let SELLER_MYSCORES_PAGE = 1;    // "내 악보 · 심사상태" 목록 페이지 (2026-10-20 추가)
const SELLER_MYSCORES_PAGE_SIZE = 10; // 한 페이지에 10개씩 (buyer.js의 PAGE_SIZE와는 별개 — 이름 겹치지 않게 분리)
// 2026-10-30: 여러 곡 한꺼번에 등록(일괄 등록) 상태 — 다시 그려져도(renderSeller) 표가 유지되도록 모듈 변수에 둔다
let SB_ROWS = [];          // { key, file, fileName, title, artist, instrument, difficulty, price, include, status, message, dup }
let SB_RUNNING = false;
let SB_STOP = false;
let SB_DEFAULT_INST = "";
let SB_DEFAULT_PRICE = "";
const SB_MAX_FILES = 100;  // 한 번에 고를 수 있는 최대 파일 수
const SB_DIFFICULTY_ORDER = ["매우 쉬움", "쉬움", "보통", "어려움", "매우 어려움"]; // 화면에 보여줄 순서(값은 SCORE_DIFFICULTIES 와 같음)

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

  // 2026-10-30: 한 페이지에 8개 칸이 길게 이어지던 것을 탭으로 나눴다. 칸 내용·id 는 그대로 두고 보이는 칸만 바꾼다.
  if (!SELLER_TAB) SELLER_TAB = Object.values(STATE.scores).some(s => s.sellerId === user.id) ? "scores" : "register";
  const unansweredInq = Object.values(STATE.inquiries).filter(q => q.sellerId === user.id && q.status !== "답변완료").length;
  el.innerHTML = `
    <div class="seller-tabs" role="tablist">
      ${SELLER_TABS.map(([k, l]) => `<button type="button" role="tab" class="seller-tab ${SELLER_TAB === k ? "active" : ""}" data-seller-tab="${k}" aria-selected="${SELLER_TAB === k}">${l}${k === "inquiries" && unansweredInq ? ` <b>${unansweredInq}</b>` : ""}</button>`).join("")}
    </div>
    <div data-seller-sec="profile" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 16px;margin-bottom:16px;">
      <h2 style="margin:0 0 4px;font-size:17px;">아티스트 프로필</h2>
      <p style="margin:0 0 16px;font-size:13px;color:var(--muted);">악보 목록·상세페이지·아티스트 페이지에 구매자가 보는 이름이에요. 가입할 때 적은 이름과 달라도 괜찮아요.</p>
      <div id="seller-profile-msg" style="font-size:13px;margin:0 0 8px;"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <input type="text" id="sp-displayname" placeholder="예: 그루브랩" maxlength="30"
          style="flex:1;min-width:160px;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;">
        <button id="sp-save"
          style="padding:10px 16px;border:1px solid var(--border);border-radius:8px;background:#F5F2EE;font-size:13px;cursor:pointer;"
          onmouseover="this.style.background='#F5F2EE';this.style.borderColor='#B9AFA4';this.style.color='#302D2A'"
          onmouseout="this.style.background='#F5F2EE';this.style.borderColor='var(--border)';this.style.color=''">
          활동명 저장
        </button>
      </div>
    </div>

    <div data-seller-sec="trend" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 16px;margin-bottom:16px;">
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

    <div data-seller-sec="register" id="seller-register-panel" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 16px;margin-bottom:16px;">
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
            ${["매우 쉬움", "쉬움", "보통", "어려움", "매우 어려움"].map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("")}
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

    <div data-seller-sec="register" id="seller-bulk-panel" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 16px;margin-bottom:16px;">
      ${renderBulkPanelHTML()}
    </div>

    <div data-seller-sec="scores" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 16px;margin-bottom:16px;">
      <h2 style="margin:0 0 4px;font-size:17px;">내 악보 관리</h2>
      <p style="margin:0 0 16px;font-size:13px;color:var(--muted);">등록한 악보를 고치거나, 판매를 잠시 멈추거나, 할인을 설정할 수 있어요.
        <button id="seller-store-link" style="margin-left:6px;border:none;background:none;color:var(--primary);font-size:13px;cursor:pointer;padding:0;text-decoration:underline;">구매자에게 보이는 내 아티스트 페이지 ›</button>
      </p>
      <div class="ms-toolbar">
        <input type="search" id="ms-search" class="ms-search" placeholder="제목·가수·태그로 찾기" value="${esc(SELLER_MYSCORES_Q)}" aria-label="내 악보 검색">
        <div class="ms-filters" id="ms-filters">
          ${[["all", "전체"], ["sale", "판매 중"], ["stopped", "판매 중지"], ["discount", "할인 중"]].map(([k, l]) => `<button type="button" class="ms-filter ${SELLER_MYSCORES_FILTER === k ? "active" : ""}" data-ms-filter="${k}">${l}</button>`).join("")}
        </div>
      </div>
      <div id="ms-count" class="ms-count"></div>
      <div id="seller-my-scores"></div>
    </div>

    <div data-seller-sec="sales" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 16px;margin-bottom:16px;">
      <h2 style="margin:0 0 4px;font-size:17px;">판매현황 · 적립금</h2>
      <p style="margin:0 0 16px;font-size:13px;color:var(--muted);">판매된 악보와 정산 대기 적립금입니다.</p>
      <div id="seller-sales-summary"></div>
      <div id="seller-sales-by-score" style="margin-top:16px;"></div>
      <div id="seller-recent-purchases" style="margin-top:16px;"></div>
    </div>

    <div data-seller-sec="sales" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 16px;">
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

    <div data-seller-sec="inquiries" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 16px;margin-top:16px;">
      <h2 style="margin:0 0 4px;font-size:17px;">고객 문의</h2>
      <p style="margin:0 0 16px;font-size:13px;color:var(--muted);">구매자가 내 악보를 골라서 보낸 1:1 문의입니다. 다른 판매자 악보에 대한 문의는 보이지 않아요.</p>
      <div id="seller-inquiry-msg" style="font-size:13px;margin:0 0 10px;"></div>
      <div id="seller-inquiry-list"></div>
    </div>
  `;

  applySellerTab();
  el.querySelectorAll("[data-seller-tab]").forEach(b => b.addEventListener("click", () => {
    SELLER_TAB = b.dataset.sellerTab;
    applySellerTab();
    window.scrollTo({ top: 0 });
  }));

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
  // 2026-10-29 수정: 한글 입력 중(조합 중)에 "," 나 Enter 를 누르면, 입력창을 먼저 비운 뒤 조합 중이던 마지막 글자가
  // 다시 들어가 "침"처럼 앞 단어의 뒷글자가 남던 문제. 이제 ","는 키 입력이 아니라 입력창 내용(input 이벤트)으로 처리하고,
  // 조합 중에 누른 Enter 는 글자 조합이 끝난 뒤(compositionend)에 태그로 추가한다.
  let tagEnterPending = false;
  const splitCommaTags = () => {
    if (!tagInput.value.includes(",")) return;
    const parts = tagInput.value.split(",");
    const rest = parts.pop();
    parts.forEach(part => addTagText(part));
    tagInput.value = rest.replace(/^\s+/, "");
  };
  tagInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (e.isComposing || e.keyCode === 229) { tagEnterPending = true; return; }
    addTagFromInput();
  });
  tagInput.addEventListener("input", (e) => {
    if (e.isComposing) return; // 조합 중이면 조합이 끝난 뒤 compositionend 에서 처리
    splitCommaTags();
  });
  tagInput.addEventListener("compositionend", () => {
    // compositionend 직후에 최종 글자가 입력창에 반영되므로 한 박자 뒤에 처리한다.
    setTimeout(() => {
      splitCommaTags();
      if (tagEnterPending) { tagEnterPending = false; addTagFromInput(); }
    }, 0);
  });
  tagInput.addEventListener("blur", addTagFromInput);

  document.getElementById("sf-submit").addEventListener("click", () => {
    handleSubmitScore(user.id);
  });

  wireBulkPanel(user.id);

  // 2026-10-30: 내 악보 검색·상태 필터 — 입력칸은 다시 그리지 않고 목록만 다시 그려서 타이핑이 끊기지 않게 한다
  document.getElementById("ms-search")?.addEventListener("input", (e) => {
    SELLER_MYSCORES_Q = e.target.value;
    SELLER_MYSCORES_PAGE = 1;
    renderMyScores(user.id);
  });
  document.querySelectorAll("#ms-filters [data-ms-filter]").forEach(b => b.addEventListener("click", () => {
    SELLER_MYSCORES_FILTER = b.dataset.msFilter;
    SELLER_MYSCORES_PAGE = 1;
    document.querySelectorAll("#ms-filters [data-ms-filter]").forEach(x => x.classList.toggle("active", x === b));
    renderMyScores(user.id);
  }));

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

/* ============================================================
   여러 곡 한꺼번에 등록 (2026-10-30 추가)
   관리자 "PDF 일괄 업로드"처럼 PDF 여러 개(또는 폴더)를 한 번에 고르면,
   파일 이름("가수 - 제목_난이도.pdf")으로 제목·가수·난이도를 미리 채운 표를 보여주고
   악기·가격은 한 번에 지정(곡별 수정 가능)한 뒤 한 곡씩 차례로 등록한다.
   등록 과정(파일 업로드 → 미리보기 → 페이지 수 → 카드 썸네일 → submitScore)은
   한 곡 등록(handleSubmitScore)과 같다. 소개·태그·영상·직접 썸네일은 일괄 등록에서 받지 않는다.
   ============================================================ */

let SB_MSG = null; // { text, isError } — 다시 그려져도 남도록 보관

/* 파일 이름 속 난이도 표기 → 저장 값(SCORE_DIFFICULTIES). 예전 이름(초급·중급…)도 받아준다.
   긴 표기부터 확인해야 "초중급"이 "중급"으로, "매우 쉬움"이 "쉬움"으로 잘못 잡히지 않는다. */
const SB_DIFF_ALIASES = [
  ["매우 쉬움", "매우 쉬움"], ["매우쉬움", "매우 쉬움"], ["매우 어려움", "매우 어려움"], ["매우어려움", "매우 어려움"],
  ["초중급", "쉬움"], ["초급", "매우 쉬움"], ["중급", "보통"], ["고급", "어려움"], ["프로", "매우 어려움"],
  ["쉬움", "쉬움"], ["보통", "보통"], ["어려움", "어려움"]
];
function sbFindDifficulty(text) {
  const t = String(text || "");
  for (const [k, v] of SB_DIFF_ALIASES) if (t.includes(k)) return v;
  return "";
}

/* "아이유 - 좋은 날_보통.pdf" → { artist:"아이유", title:"좋은 날", difficulty:"보통" }
   "[고급7] 원위 - FLY.pdf", "... _0001.pdf", "...pdf.pdf" 같은 이름도 정리한다. 못 알아낸 칸은 빈 값. */
function parseScoreFileName(fileName) {
  let base = String(fileName || "").split("/").pop().replace(/(\.pdf)+$/i, "").trim();
  base = base.replace(/[_\s]+0{2,}\d+$/, "").trim();
  let difficulty = "";
  const bracket = base.match(/^\[([^\]]+)\]\s*/);
  if (bracket) {
    const d = sbFindDifficulty(bracket[1]);
    if (d) { difficulty = d; base = base.slice(bracket[0].length).trim(); }
  }
  const us = base.lastIndexOf("_");
  if (us > 0) {
    const d = sbFindDifficulty(base.slice(us + 1));
    if (d) { if (!difficulty) difficulty = d; base = base.slice(0, us).trim(); }
  }
  if (!difficulty) {
    const m = base.match(/\s*[(\[]([^)\]]+)[)\]]\s*$/);
    if (m) {
      const d = sbFindDifficulty(m[1]);
      if (d) { difficulty = d; base = base.slice(0, m.index).trim(); }
    }
  }
  let artist = "", title = base;
  const dash = base.match(/\s+-\s*|\s*-\s+/);
  if (dash) {
    artist = base.slice(0, dash.index).trim();
    title = base.slice(dash.index + dash[0].length).trim();
  }
  return { artist, title, difficulty };
}

function sbNorm(v) { return String(v || "").trim().replace(/\s+/g, " ").toLowerCase(); }

/* 빠진 입력이 있으면 무엇이 빠졌는지 돌려준다(없으면 ""). */
function bulkRowProblem(r) {
  const miss = [];
  if (!String(r.title || "").trim()) miss.push("제목");
  if (!String(r.artist || "").trim()) miss.push("가수");
  if (!INSTRUMENTS.includes(r.instrument)) miss.push("악기");
  if (!SCORE_DIFFICULTIES.includes(r.difficulty)) miss.push("난이도");
  const price = Number(r.price);
  if (r.price === "" || !Number.isFinite(price) || price <= 0) miss.push("가격");
  return miss.length ? `입력 필요: ${miss.join("·")}` : "";
}

/* 이미 등록한 내 악보 중 같은 곡(제목·가수, 그리고 정해져 있으면 악기·난이도까지 같은 것)이 있는지 */
function bulkDupScore(sellerId, r) {
  if (!r.title || !r.artist) return null;
  return Object.values(STATE.scores).find(s =>
    s.sellerId === sellerId &&
    sbNorm(s.title) === sbNorm(r.title) && sbNorm(s.artist) === sbNorm(r.artist) &&
    (!r.instrument || s.instrument === r.instrument) &&
    (!r.difficulty || s.difficulty === r.difficulty)
  ) || null;
}

let SB_FILTER = "all";      // 목록 보기 필터: all | need | fail | ready | excluded | done (2026-10-30 표 형식 개편)
let SB_OPEN = new Set();    // 휴대폰에서 펼쳐서 고치는 중인 곡(key)

/* 상태 분류 — 필터·정렬·개수에 같이 쓴다 */
function bulkKind(r) {
  if (r.status === "완료") return "done";
  if (r.status === "등록 중") return "running";
  if (r.status === "실패") return "fail";
  if (!r.include) return "excluded";
  if (bulkRowProblem(r)) return "need";
  return "ready";
}

function bulkStatus(r) {
  const k = bulkKind(r);
  return ({
    done: ["완료", "#2f7d4f"], running: ["등록 중…", "#9a3208"], fail: ["실패", "#c0392b"],
    excluded: ["제외", "#8A847D"], need: ["입력 필요", "#c45a1c"], ready: ["준비됨", "#302D2A"]
  })[k];
}

function bulkTargets() { return SB_ROWS.filter(r => r.include && r.status !== "완료"); }

function bulkCounts() {
  const c = { all: SB_ROWS.length, need: 0, fail: 0, ready: 0, excluded: 0, done: 0, running: 0 };
  for (const r of SB_ROWS) c[bulkKind(r)]++;
  return c;
}

function bulkSummarySub(r) {
  const price = Number(r.price);
  return [r.difficulty || "난이도?", r.instrument || "악기?", r.price !== "" && Number.isFinite(price) && price > 0 ? `${price.toLocaleString()}P` : "가격?"].join(" · ");
}

function bulkHintText(r) {
  if (r.message) return r.message;
  return r.include && r.status === "대기" ? bulkRowProblem(r) : "";
}

/* 안내 글자색: 실패는 빨강, 빠진 입력은 주황, 그 외 안내(같은 곡 알림·진행 단계)는 회색 */
function bulkHintClass(r) {
  if (r.status === "실패") return "is-error";
  if (!r.message && r.include && r.status === "대기" && bulkRowProblem(r)) return "is-need";
  return "";
}

function bulkRowHTML(r, i) {
  const locked = SB_RUNNING || r.status === "완료";
  const [label, color] = bulkStatus(r);
  const hint = bulkHintText(r);
  const dis = locked ? "disabled" : "";
  const open = SB_OPEN.has(r.key);
  return `
    <div class="sb-row ${open ? "open" : ""} ${r.status === "완료" ? "is-done" : ""}" data-sb-row="${i}">
      <input type="checkbox" class="sb-chk" data-sb-field="include" ${r.include ? "checked" : ""} ${dis} aria-label="이 곡 등록하기">
      <button type="button" class="sb-sum" data-sb-toggle aria-expanded="${open}">
        <span class="sb-sum-main">${esc(r.title || "제목 없음")}${r.artist ? ` <span class="sb-sum-artist">· ${esc(r.artist)}</span>` : ""}</span>
        <span class="sb-sum-sub">${esc(bulkSummarySub(r))}</span>
      </button>
      <div class="sb-fields">
        <div class="sb-cell-title">
          <input type="text" class="sb-in" data-sb-field="title" value="${esc(r.title)}" placeholder="곡 제목" aria-label="곡 제목" ${dis}>
          <span class="sb-file" title="${esc(r.fileName)}">${esc(r.fileName)}</span>
        </div>
        <input type="text" class="sb-in" data-sb-field="artist" value="${esc(r.artist)}" placeholder="가수" aria-label="가수" ${dis}>
        <select class="sb-in" data-sb-field="instrument" aria-label="악기" ${dis}>
          <option value="">악기</option>
          ${INSTRUMENTS.map(x => `<option value="${esc(x)}" ${r.instrument === x ? "selected" : ""}>${esc(x)}</option>`).join("")}
        </select>
        <select class="sb-in" data-sb-field="difficulty" aria-label="난이도" ${dis}>
          <option value="">난이도</option>
          ${SB_DIFFICULTY_ORDER.map(x => `<option value="${esc(x)}" ${r.difficulty === x ? "selected" : ""}>${esc(x)}</option>`).join("")}
        </select>
        <input type="number" class="sb-in" data-sb-field="price" value="${esc(r.price)}" min="0" step="100" placeholder="가격(P)" aria-label="가격" ${dis}>
      </div>
      <span class="sb-status" data-sb-status style="color:${color};">${esc(label)}</span>
      <button type="button" class="sb-tg" data-sb-toggle aria-label="펼치기/접기"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
      <div class="sb-hint ${bulkHintClass(r)}" data-sb-hint ${hint ? "" : "hidden"}>${esc(hint)}</div>
    </div>`;
}

function bulkChipsHTML() {
  const c = bulkCounts();
  const items = [["all", "전체"], ["need", "입력 필요"], ["fail", "실패"], ["ready", "준비됨"], ["excluded", "제외"], ["done", "완료"]];
  return items
    .filter(([k]) => k === "all" || c[k] > 0 || SB_FILTER === k)
    .map(([k, l]) => `<button type="button" class="sb-chip ${SB_FILTER === k ? "active" : ""} ${k === "need" || k === "fail" ? "warn" : ""}" data-sb-filter="${k}">${l} <b>${c[k]}</b></button>`)
    .join("");
}

/* 화면에 보일 순서: 등록 중이 아닐 때는 고칠 곡(입력 필요·실패)을 맨 위로 */
function bulkVisibleRows() {
  const rank = { need: 0, fail: 1, running: 2, ready: 3, excluded: 4, done: 5 };
  let rows = SB_ROWS.map((r, i) => ({ r, i }));
  if (SB_FILTER !== "all") rows = rows.filter(({ r }) => bulkKind(r) === SB_FILTER);
  if (!SB_RUNNING) rows.sort((a, b) => (rank[bulkKind(a.r)] - rank[bulkKind(b.r)]) || (a.i - b.i));
  return rows;
}

function bulkRunBarHTML() {
  const targets = bulkTargets();
  const done = SB_ROWS.filter(r => r.status === "완료").length;
  if (SB_RUNNING) {
    const total = SB_RUN_TOTAL || 1;
    const pct = Math.round((SB_RUN_DONE / total) * 100);
    return `
      <div class="sb-progress"><span style="width:${pct}%;"></span></div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span style="flex:1;font-size:13px;font-weight:600;">등록 중… ${SB_RUN_DONE}/${total}곡</span>
        <button id="sb-stop-btn" class="btn admin-stop-btn" style="border-radius:12px;background:#ffffff;" ${SB_STOP ? "disabled" : ""}>${SB_STOP ? "중단하는 중…" : "중단"}</button>
      </div>`;
  }
  return `
    <div style="display:flex;gap:8px;align-items:center;">
      <span style="flex:1;font-size:12px;color:var(--muted);">${SB_ROWS.length}개 파일 · 완료 ${done}곡</span>
      <button id="sb-run-btn" class="btn btn-primary admin-dark-btn" style="border-radius:12px;min-width:180px;" ${targets.length ? "" : "disabled"}>선택한 ${targets.length}곡 등록하기</button>
    </div>`;
}

let SB_RUN_TOTAL = 0;
let SB_RUN_DONE = 0;

function renderBulkPanelHTML() {
  const n = SB_ROWS.length;
  const dis = SB_RUNNING ? "disabled" : "";
  const field = `style="padding:8px 10px;border:1px solid #D5D0CA;border-radius:8px;font-size:13px;background:#ffffff;"`;
  const visible = bulkVisibleRows();
  return `
    <div id="sb-body">
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
        <h2 style="margin:0;font-size:17px;flex:1;">여러 곡 한꺼번에 등록</h2>
        ${n && !SB_RUNNING ? `<button id="sb-clear-btn" type="button" class="sb-link">목록 비우기</button>` : ""}
      </div>
      <p style="margin:0 0 14px;font-size:13px;color:var(--muted);line-height:1.6;">
        파일 이름을 <b style="color:var(--text);">가수 - 제목_난이도.pdf</b>로 맞춰 두면 제목·가수·난이도가 자동으로 채워져요.<br>
        미리보기·카드 썸네일·페이지 수는 등록할 때 한 곡씩 자동으로 만들어져요. (한 번에 최대 ${SB_MAX_FILES}곡)
      </p>
      <input type="file" id="sb-files-input" accept="application/pdf,.pdf" multiple style="display:none;">
      <input type="file" id="sb-folder-input" webkitdirectory directory multiple style="display:none;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="sb-pick-files-btn" class="btn btn-primary admin-dark-btn" style="border-radius:12px;" ${dis}>PDF 파일 여러 개 선택</button>
        <button id="sb-pick-folder-btn" class="btn admin-stop-btn" style="border-radius:12px;background:#ffffff;" ${dis}>폴더 선택</button>
      </div>
      <div id="sb-msg" style="font-size:13px;margin-top:10px;color:${SB_MSG && SB_MSG.isError ? "#c0392b" : "var(--text)"};${SB_MSG ? "" : "display:none;"}">${SB_MSG ? esc(SB_MSG.text) : ""}</div>
      ${n ? `
      <div style="margin-top:14px;padding:10px 12px;border:1px solid #D5D0CA;border-radius:10px;background:#F5F2EE;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
        <span style="font-size:13px;font-weight:600;margin-right:4px;">모든 곡에 한 번에 적용</span>
        <select id="sb-def-inst" aria-label="악기 한 번에 적용" ${dis} ${field}>
          <option value="">악기 선택</option>
          ${INSTRUMENTS.map(x => `<option value="${esc(x)}" ${SB_DEFAULT_INST === x ? "selected" : ""}>${esc(x)}</option>`).join("")}
        </select>
        <input type="number" id="sb-def-price" value="${esc(SB_DEFAULT_PRICE)}" min="0" step="100" placeholder="가격(포인트)" aria-label="가격 한 번에 적용" ${dis} style="width:130px;padding:8px 10px;border:1px solid #D5D0CA;border-radius:8px;font-size:13px;background:#ffffff;">
        <button id="sb-apply-defaults" class="btn admin-stop-btn" style="border-radius:10px;background:#ffffff;" ${dis}>적용</button>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:14px;">
        <div id="sb-chips" style="display:flex;gap:6px;flex-wrap:wrap;flex:1;">${bulkChipsHTML()}</div>
        ${SB_RUNNING ? "" : `<span style="font-size:12px;"><button id="sb-check-all" type="button" class="sb-link">모두 선택</button> · <button id="sb-uncheck-all" type="button" class="sb-link">모두 해제</button></span>`}
      </div>
      <div class="sb-table">
        <div class="sb-head" aria-hidden="true"><span></span><span>제목</span><span>가수</span><span>악기</span><span>난이도</span><span>가격(P)</span><span>상태</span></div>
        <div id="sb-list">
          ${visible.length ? visible.map(({ r, i }) => bulkRowHTML(r, i)).join("") : `<div style="padding:18px;text-align:center;font-size:13px;color:var(--muted);">이 조건의 곡이 없어요.</div>`}
        </div>
      </div>
      <div class="sb-runbar" id="sb-runbar">${bulkRunBarHTML()}</div>` : ""}
    </div>`;
}

function rerenderBulkPanel(sellerId) {
  const panel = document.getElementById("seller-bulk-panel");
  if (!panel) return;
  panel.innerHTML = renderBulkPanelHTML();
  wireBulkPanel(sellerId);
}

function setBulkMsg(sellerId, text, isError) {
  SB_MSG = text ? { text, isError: !!isError } : null;
  const el = document.getElementById("sb-msg");
  if (!el) return;
  el.textContent = text || "";
  el.style.display = text ? "" : "none";
  el.style.color = isError ? "#c0392b" : "var(--text)";
}

/* 입력할 때마다 표 전체를 다시 그리면 커서가 빠지므로, 그 줄의 상태·요약·안내와 개수·등록 버튼만 고친다
   (필터에 안 맞게 된 줄도 고치는 동안은 그대로 둔다 — 다음에 다시 그릴 때 정리됨). */
function updateBulkRowStatus(i, sellerId) {
  const r = SB_ROWS[i];
  const row = document.querySelector(`[data-sb-row="${i}"]`);
  if (r && row) {
    const [label, color] = bulkStatus(r);
    const st = row.querySelector("[data-sb-status]");
    if (st) { st.textContent = label; st.style.color = color; }
    const hint = row.querySelector("[data-sb-hint]");
    if (hint) {
      const text = bulkHintText(r);
      hint.textContent = text;
      hint.hidden = !text;
      hint.className = `sb-hint ${bulkHintClass(r)}`;
    }
    const main = row.querySelector(".sb-sum-main");
    if (main) main.innerHTML = `${esc(r.title || "제목 없음")}${r.artist ? ` <span class="sb-sum-artist">· ${esc(r.artist)}</span>` : ""}`;
    const sub = row.querySelector(".sb-sum-sub");
    if (sub) sub.textContent = bulkSummarySub(r);
  }
  const chips = document.getElementById("sb-chips");
  if (chips) {
    chips.innerHTML = bulkChipsHTML();
    wireBulkChips(sellerId);
  }
  const bar = document.getElementById("sb-runbar");
  if (bar && !SB_RUNNING) {
    bar.innerHTML = bulkRunBarHTML();
    document.getElementById("sb-run-btn")?.addEventListener("click", () => runBulkRegister(sellerId));
  }
}

function wireBulkChips(sellerId) {
  document.querySelectorAll("#sb-chips [data-sb-filter]").forEach(b => b.addEventListener("click", () => {
    SB_FILTER = b.dataset.sbFilter;
    rerenderBulkPanel(sellerId);
  }));
}

function addBulkFiles(sellerId, files) {
  const pdfs = files
    .filter(f => !String(f.name).startsWith("."))
    .filter(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name || ""))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"));
  const notPdf = files.filter(f => !String(f.name).startsWith(".")).length - pdfs.length;
  // 2026-10-30: 다음 파일을 넣을 때 지난번에 등록을 끝낸(완료) 곡은 목록에서 자동으로 뺀다.
  // 끝난 직후에는 결과 확인용으로 남겨 두고, 실패·제외한 곡은 다시 시도할 수 있게 그대로 둔다.
  const doneBefore = SB_ROWS.filter(r => r.status === "완료").length;
  if (doneBefore) {
    SB_ROWS = SB_ROWS.filter(r => r.status !== "완료");
    for (const k of [...SB_OPEN]) if (!SB_ROWS.some(r => r.key === k)) SB_OPEN.delete(k);
  }
  // 처음 고를 때 악기 기본값은 내가 가장 많이 올린 악기로 미리 맞춰 둔다(바꿀 수 있음)
  if (!SB_ROWS.length && !SB_DEFAULT_INST) {
    const cnt = {};
    for (const s of Object.values(STATE.scores)) if (s.sellerId === sellerId) cnt[s.instrument] = (cnt[s.instrument] || 0) + 1;
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    if (top && INSTRUMENTS.includes(top[0])) SB_DEFAULT_INST = top[0];
  }
  const keys = new Set(SB_ROWS.map(r => r.key));
  let added = 0, sameFile = 0, over = 0, dup = 0;
  for (const f of pdfs) {
    const key = `${f.name}|${f.size}`;
    if (keys.has(key)) { sameFile++; continue; }
    if (SB_ROWS.length >= SB_MAX_FILES) { over++; continue; }
    const p = parseScoreFileName(f.name);
    const tooBig = f.size > 30 * 1024 * 1024;
    const row = {
      key, file: f, fileName: f.name,
      title: p.title, artist: p.artist, difficulty: p.difficulty,
      instrument: SB_DEFAULT_INST, price: SB_DEFAULT_PRICE,
      include: !tooBig, status: tooBig ? "실패" : "대기",
      message: tooBig ? "30MB를 넘는 파일은 올릴 수 없어요." : ""
    };
    // 이미 등록한 내 악보와 같은 곡이면 기본으로 체크를 빼 둔다(실수로 두 번 올리는 것 방지)
    if (!tooBig && bulkDupScore(sellerId, row)) {
      row.include = false;
      row.message = "이미 등록한 악보와 같은 곡이에요. 그래도 올리려면 체크하세요.";
      dup++;
    }
    SB_ROWS.push(row);
    keys.add(key);
    added++;
  }
  const parts = [];
  if (doneBefore) parts.push(`지난번에 등록을 마친 ${doneBefore}곡은 목록에서 정리했어요.`);
  if (added) parts.push(`${added}개 파일을 목록에 넣었어요.`);
  if (!added && !pdfs.length) parts.push("PDF 파일이 없어요.");
  if (dup) parts.push(`이미 등록한 곡 ${dup}개는 체크를 빼 두었어요.`);
  if (sameFile) parts.push(`이미 목록에 있는 파일 ${sameFile}개는 건너뛰었어요.`);
  if (notPdf > 0) parts.push(`PDF가 아닌 파일 ${notPdf}개는 제외했어요.`);
  if (over) parts.push(`한 번에 ${SB_MAX_FILES}개까지라 ${over}개는 넣지 못했어요.`);
  SB_MSG = { text: parts.join(" "), isError: !added };
  SB_FILTER = "all";
  rerenderBulkPanel(sellerId);
}

function wireBulkPanel(sellerId) {
  const body = document.getElementById("sb-body");
  if (!body) return;
  const filesInput = document.getElementById("sb-files-input");
  const folderInput = document.getElementById("sb-folder-input");
  document.getElementById("sb-pick-files-btn")?.addEventListener("click", () => filesInput?.click());
  document.getElementById("sb-pick-folder-btn")?.addEventListener("click", () => folderInput?.click());
  for (const input of [filesInput, folderInput]) {
    input?.addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = "";
      if (files.length) addBulkFiles(sellerId, files);
    });
  }
  document.getElementById("sb-clear-btn")?.addEventListener("click", () => {
    SB_ROWS = [];
    SB_MSG = null;
    SB_FILTER = "all";
    SB_OPEN.clear();
    rerenderBulkPanel(sellerId);
  });
  document.getElementById("sb-def-inst")?.addEventListener("change", (e) => { SB_DEFAULT_INST = e.target.value; });
  document.getElementById("sb-def-price")?.addEventListener("input", (e) => { SB_DEFAULT_PRICE = e.target.value; });
  document.getElementById("sb-apply-defaults")?.addEventListener("click", () => {
    if (!SB_DEFAULT_INST && SB_DEFAULT_PRICE === "") {
      setBulkMsg(sellerId, "적용할 악기나 가격을 먼저 정해주세요.", true);
      return;
    }
    let count = 0;
    for (const r of SB_ROWS) {
      if (r.status === "완료" || r.status === "등록 중") continue;
      if (SB_DEFAULT_INST) r.instrument = SB_DEFAULT_INST;
      if (SB_DEFAULT_PRICE !== "") r.price = SB_DEFAULT_PRICE;
      count++;
    }
    SB_MSG = { text: `${count}곡에 적용했어요.`, isError: false };
    rerenderBulkPanel(sellerId);
  });
  const setAll = (v) => {
    for (const r of SB_ROWS) if (r.status !== "완료" && r.status !== "등록 중") r.include = v;
    rerenderBulkPanel(sellerId);
  };
  document.getElementById("sb-check-all")?.addEventListener("click", () => setAll(true));
  document.getElementById("sb-uncheck-all")?.addEventListener("click", () => setAll(false));

  const onField = (e) => {
    const field = e.target.dataset && e.target.dataset.sbField;
    const rowEl = e.target.closest && e.target.closest("[data-sb-row]");
    if (!field || !rowEl) return;
    const i = Number(rowEl.dataset.sbRow);
    const r = SB_ROWS[i];
    if (!r || r.status === "완료" || SB_RUNNING) return;
    if (field === "include") r.include = e.target.checked;
    else r[field] = e.target.value;
    if (r.status === "실패" && field !== "include") { r.status = "대기"; r.message = ""; }
    else if (field === "include" && r.status === "대기") r.message = "";
    updateBulkRowStatus(i, sellerId);
  };
  body.addEventListener("input", onField);
  body.addEventListener("change", onField);
  // 휴대폰: 요약 줄이나 화살표를 누르면 그 곡을 펼쳐서 고친다
  body.addEventListener("click", (e) => {
    const tg = e.target.closest && e.target.closest("[data-sb-toggle]");
    if (!tg) return;
    const rowEl = tg.closest("[data-sb-row]");
    const r = rowEl && SB_ROWS[Number(rowEl.dataset.sbRow)];
    if (!r) return;
    const open = !rowEl.classList.contains("open");
    rowEl.classList.toggle("open", open);
    rowEl.querySelector(".sb-sum")?.setAttribute("aria-expanded", String(open));
    if (open) SB_OPEN.add(r.key); else SB_OPEN.delete(r.key);
  });
  wireBulkChips(sellerId);

  document.getElementById("sb-run-btn")?.addEventListener("click", () => runBulkRegister(sellerId));
  document.getElementById("sb-stop-btn")?.addEventListener("click", (e) => {
    SB_STOP = true;
    e.target.disabled = true;
    e.target.textContent = "중단하는 중…";
  });
}

/* 한 곡 등록 과정(한 곡 등록 폼의 handleSubmitScore 와 같은 순서). 실패하면 { ok:false, message } */
async function registerScoreFromFile(sellerId, data, file, onStep) {
  const scoreId = uid("score");
  onStep && onStep("파일 업로드 중…");
  const up = await uploadScoreFile(sellerId, scoreId, file);
  if (!up.ok) return { ok: false, message: up.message || "파일 업로드에 실패했습니다." };

  onStep && onStep("미리보기 이미지 만드는 중…");
  let previewUrls = null;
  try {
    const blobs = await generateScorePreviewImages(file, 5);
    if (blobs && blobs.length) {
      const res = await uploadScorePreviewImages(sellerId, scoreId, blobs);
      if (res.ok && res.urls.length) previewUrls = res.urls;
    }
  } catch (e) {
    console.error("[seller] 일괄 등록 — 미리보기 이미지 오류", e);
  }

  let pageCount = null;
  try {
    pageCount = await getPdfPageCount(file);
  } catch (e) {
    console.error("[seller] 일괄 등록 — 페이지 수 확인 오류", e);
  }

  onStep && onStep("카드 썸네일 만드는 중…");
  let cardThumbUrl = null;
  try {
    const blob = await generateScoreCardThumbnail(file);
    if (blob) {
      const res = await uploadScoreCardThumbnail(sellerId, scoreId, blob);
      if (res.ok && res.url) cardThumbUrl = res.url;
    }
  } catch (e) {
    console.error("[seller] 일괄 등록 — 카드 썸네일 오류", e);
  }

  return submitScore(sellerId, {
    id: scoreId,
    title: data.title, artist: data.artist, instrument: data.instrument,
    difficulty: data.difficulty, price: data.price,
    hasVideo: false, videoUrl: null,
    fileUrl: up.path, previewUrls, pageCount, cardThumbUrl,
    description: "", tags: [], thumbnailUrl: null
  });
}

async function runBulkRegister(sellerId) {
  if (SB_RUNNING) return;
  const targets = bulkTargets();
  if (!targets.length) return;
  const bad = targets.filter(r => bulkRowProblem(r));
  if (bad.length) {
    // 고칠 곡만 보이게 필터를 바꾸고, 휴대폰에서도 바로 고칠 수 있게 펼쳐 둔다
    SB_MSG = { text: `입력이 빠진 곡이 ${bad.length}곡 있어요. 채우거나 체크를 빼 주세요.`, isError: true };
    SB_FILTER = bad.some(r => bulkKind(r) === "need") ? "need" : "all";
    for (const r of bad) SB_OPEN.add(r.key);
    rerenderBulkPanel(sellerId);
    document.getElementById("sb-chips")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }

  SB_RUNNING = true;
  SB_STOP = false;
  SB_MSG = { text: "한 곡씩 차례로 등록하고 있어요. 다 끝날 때까지 이 페이지를 닫거나 새로고침하지 마세요.", isError: false };
  for (const r of targets) { r.status = "대기"; r.message = ""; }
  SB_RUN_TOTAL = targets.length;
  SB_RUN_DONE = 0;
  SB_FILTER = "all";
  rerenderBulkPanel(sellerId);

  let ok = 0, fail = 0;
  for (const r of targets) {
    if (SB_STOP) break;
    r.status = "등록 중";
    r.message = "";
    rerenderBulkPanel(sellerId);
    let res;
    try {
      res = await registerScoreFromFile(sellerId, {
        title: r.title.trim(), artist: r.artist.trim(), instrument: r.instrument,
        difficulty: r.difficulty, price: Number(r.price)
      }, r.file, (step) => {
        r.message = step;
        const i = SB_ROWS.indexOf(r);
        updateBulkRowStatus(i, sellerId);
      });
    } catch (e) {
      console.error("[seller] 일괄 등록 오류", e);
      res = { ok: false, message: "등록 중 문제가 생겼어요. 잠시 후 다시 시도해주세요." };
    }
    if (res && res.ok) {
      r.status = "완료"; r.message = ""; r.include = false; ok++;
      SF_SESSION_COUNT += 1;
      SELLER_MYSCORES_PAGE = 1;
      renderMyScores(sellerId);
    } else {
      r.status = "실패"; r.message = (res && res.message) || "등록에 실패했어요."; fail++;
    }
    SB_RUN_DONE += 1;
  }
  const stopped = SB_STOP;
  SB_RUNNING = false;
  SB_STOP = false;
  const left = bulkTargets().filter(r => r.status === "대기").length;
  SB_MSG = {
    text: `${ok}곡 등록했어요.` + (fail ? ` ${fail}곡은 실패했어요 — 빨간 안내를 확인하고 다시 눌러주세요.` : "") + (stopped && left ? ` 중단해서 ${left}곡은 등록하지 않았어요.` : "") + (ok ? " 다음 파일을 넣으면 완료된 곡은 목록에서 빠져요." : ""),
    isError: !!fail
  };
  rerenderBulkPanel(sellerId);
}

/* 등록 중에 창을 닫으려 하면 한 번 물어본다 */
window.addEventListener("beforeunload", (e) => {
  if (SB_RUNNING) { e.preventDefault(); e.returnValue = ""; }
});

/* 판매자 센터 탭: 지금 탭의 칸만 보이게 하고 탭 버튼 상태를 맞춘다 (2026-10-30 추가) */
function applySellerTab() {
  const view = document.getElementById("view-seller");
  if (!view) return;
  view.querySelectorAll("[data-seller-sec]").forEach(sec => sec.classList.toggle("is-active", sec.dataset.sellerSec === SELLER_TAB));
  view.querySelectorAll("[data-seller-tab]").forEach(b => {
    const on = b.dataset.sellerTab === SELLER_TAB;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  });
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
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">${esc(requestSubLine(r))}</div>
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
    if (artistInput) artistInput.value = r.singer || r.composer || "";
    if (instSelect) instSelect.value = r.instrument;
    SELLER_TAB = "register"; // 2026-10-30: 탭으로 나뉘어서, 채워 넣은 등록 폼이 보이도록 "악보 등록" 탭으로 옮긴다
    applySellerTab();
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
  const text = input.value;
  input.value = "";
  // 쉼표가 섞여 있으면(붙여넣기 등) 쉼표마다 나눠서 각각 태그로 추가한다.
  text.split(",").forEach(part => addTagText(part));
}

function addTagText(text) {
  const raw = String(text || "").trim();
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
  "반려": "var(--danger)",
  "판매중지": "#8A847D"
};
// 화면에 보이는 상태 이름 (2026-10-30: 심사가 없어져 "승인" 대신 "판매 중"으로 보여준다)
const SCORE_STATUS_LABEL = { "승인": "판매 중", "판매중지": "판매 중지" };

function renderMyScores(sellerId) {
  const wrap = document.getElementById("seller-my-scores");
  if (!wrap) return;

  const allMine = Object.values(STATE.scores)
    .filter(s => s.sellerId === sellerId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const countEl = document.getElementById("ms-count");

  if (allMine.length === 0) {
    if (countEl) countEl.textContent = "";
    wrap.innerHTML = `<p style="font-size:13px;color:var(--muted);margin:0;">아직 등록한 악보가 없습니다. "악보 등록" 탭에서 첫 악보를 등록해보세요.</p>`;
    return;
  }

  // 2026-10-30: 검색어(제목·가수·태그)와 상태 필터를 적용한다
  const q = String(SELLER_MYSCORES_Q || "").trim().toLowerCase();
  const myScores = allMine.filter(s => {
    if (SELLER_MYSCORES_FILTER === "sale" && s.status !== "승인") return false;
    if (SELLER_MYSCORES_FILTER === "stopped" && s.status !== "판매중지") return false;
    if (SELLER_MYSCORES_FILTER === "discount" && !(s.status === "승인" && activeDiscount(s))) return false;
    if (!q) return true;
    return [s.title, s.artist, ...(s.tags || [])].some(t => String(t || "").toLowerCase().includes(q));
  });
  if (countEl) countEl.textContent = myScores.length === allMine.length ? `전체 ${allMine.length}곡` : `${allMine.length}곡 중 ${myScores.length}곡`;
  if (myScores.length === 0) {
    wrap.innerHTML = `<p style="font-size:13px;color:var(--muted);margin:12px 0 0;">조건에 맞는 악보가 없어요.</p>`;
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
    const discountBlock = s.status === "승인" && SELLER_EDIT_OPEN !== s.id ? renderDiscountPanel(s) : "";

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
            ${esc(SCORE_STATUS_LABEL[s.status] || s.status)}
          </span>
        </div>
        ${rejectBlock}
        ${renderScoreManageBar(s)}
        ${SELLER_EDIT_OPEN === s.id ? renderScoreEditPanel(s) : ""}
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
  wireScoreManage(wrap, sellerId);
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

/* ---------- 내 악보 수정 · 판매 중지 · 삭제 (2026-10-30 추가) ---------- */
const SM_DIFFICULTY_ORDER = ["매우 쉬움", "쉬움", "보통", "어려움", "매우 어려움"];

function renderScoreManageBar(s) {
  if (s.status !== "승인" && s.status !== "판매중지") return "";
  const busy = SELLER_SCORE_BUSY === s.id;
  const dis = busy ? "disabled" : "";
  const sold = scorePurchaseCount(s.id);
  const canDel = canDeleteScore(s.id).ok;
  const confirming = SELLER_DELETE_CONFIRM === s.id;
  return `
    <div class="sm-bar">
      <button type="button" class="sm-btn" data-sm-edit="${s.id}" ${dis}>${SELLER_EDIT_OPEN === s.id ? "수정 닫기" : "수정"}</button>
      ${s.status === "승인"
        ? `<button type="button" class="sm-btn" data-sm-sale="${s.id}" data-on="0" ${dis}>판매 중지</button>`
        : `<button type="button" class="sm-btn sm-btn-dark" data-sm-sale="${s.id}" data-on="1" ${dis}>다시 판매</button>`}
      ${canDel
        ? (confirming
            ? `<span class="sm-confirm">정말 삭제할까요? 되돌릴 수 없어요.
                 <button type="button" class="sm-btn sm-btn-danger" data-sm-del-yes="${s.id}" ${dis}>삭제</button>
                 <button type="button" class="sm-btn" data-sm-del-no="${s.id}" ${dis}>취소</button></span>`
            : `<button type="button" class="sm-link" data-sm-del="${s.id}" ${dis}>삭제</button>`)
        : `<span class="sm-note">${sold ? `구매 ${sold}건 · 삭제 대신 판매 중지만 할 수 있어요` : ""}</span>`}
    </div>
    <div class="sm-msg" id="sm-msg-${s.id}" hidden></div>`;
}

function renderScoreEditPanel(s) {
  const busy = SELLER_SCORE_BUSY === s.id;
  const dis = busy ? "disabled" : "";
  const sold = scorePurchaseCount(s.id);
  return `
    <div class="sm-edit" data-sm-panel="${s.id}">
      <div class="sm-grid">
        <label>곡 제목<input type="text" class="sm-in" id="sm-title-${s.id}" value="${esc(s.title)}" ${dis}></label>
        <label>가수<input type="text" class="sm-in" id="sm-artist-${s.id}" value="${esc(s.artist)}" ${dis}></label>
        <label>악기<select class="sm-in" id="sm-inst-${s.id}" ${dis}>
          ${INSTRUMENTS.map(x => `<option value="${esc(x)}" ${s.instrument === x ? "selected" : ""}>${esc(x)}</option>`).join("")}
        </select></label>
        <label>난이도<select class="sm-in" id="sm-diff-${s.id}" ${dis}>
          ${SM_DIFFICULTY_ORDER.map(x => `<option value="${esc(x)}" ${s.difficulty === x ? "selected" : ""}>${esc(x)}</option>`).join("")}
        </select></label>
        <label>가격 (포인트)<input type="number" class="sm-in" id="sm-price-${s.id}" min="0" step="100" value="${esc(s.price)}" ${dis}></label>
        <label><span>태그 <span class="sm-sub">(쉼표로 구분, 최대 5개)</span></span><input type="text" class="sm-in" id="sm-tags-${s.id}" value="${esc((s.tags || []).join(", "))}" placeholder="예: IU, 아이유, 좋은날" ${dis}></label>
      </div>
      <label class="sm-full"><span>악보 소개 <span class="sm-sub">(선택)</span></span>
        <textarea class="sm-in" id="sm-desc-${s.id}" rows="3" placeholder="예: 사용된 테크닉, 연습 팁, 원곡과 다른 점" ${dis}>${esc(s.description || "")}</textarea>
      </label>
      <label class="sm-check"><input type="checkbox" id="sm-hasvideo-${s.id}" ${s.hasVideo ? "checked" : ""} ${dis}> 연주 영상이 있습니다</label>
      <label class="sm-full" id="sm-video-wrap-${s.id}" ${s.hasVideo ? "" : "hidden"}>영상 링크
        <input type="text" class="sm-in" id="sm-videourl-${s.id}" value="${esc(s.videoUrl || "")}" placeholder="유튜브 링크 등" ${dis}>
      </label>
      <label class="sm-full"><span>PDF 파일 바꾸기 <span class="sm-sub">(선택 — 고르면 미리보기·카드 썸네일·페이지 수도 새로 만들어요${sold ? `. 이미 산 ${sold}명도 새 파일을 받게 돼요` : ""})</span></span>
        <input type="file" id="sm-file-${s.id}" accept="application/pdf,.pdf" class="file-input" style="margin-top:4px;font-size:13px;" ${dis}>
      </label>
      <div class="sm-actions">
        <button type="button" class="btn btn-primary admin-dark-btn" data-sm-save="${s.id}" style="border-radius:10px;" ${dis}>${busy ? "저장하는 중…" : "저장"}</button>
        <button type="button" class="btn admin-stop-btn" data-sm-cancel="${s.id}" style="border-radius:10px;background:#ffffff;" ${dis}>취소</button>
      </div>
    </div>`;
}

function smShowMsg(id, text, isError) {
  const el = document.getElementById(`sm-msg-${id}`);
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
  el.classList.toggle("is-error", !!isError);
}

function wireScoreManage(wrap, sellerId) {
  wrap.querySelectorAll("[data-sm-edit]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.smEdit;
    SELLER_EDIT_OPEN = SELLER_EDIT_OPEN === id ? null : id;
    SELLER_DELETE_CONFIRM = null;
    if (SELLER_EDIT_OPEN) SELLER_DISCOUNT_OPEN = null;
    renderMyScores(sellerId);
  }));
  wrap.querySelectorAll("[data-sm-cancel]").forEach(b => b.addEventListener("click", () => {
    SELLER_EDIT_OPEN = null;
    renderMyScores(sellerId);
  }));
  wrap.querySelectorAll("[id^='sm-hasvideo-']").forEach(c => c.addEventListener("change", () => {
    const id = c.id.replace("sm-hasvideo-", "");
    const w = document.getElementById(`sm-video-wrap-${id}`);
    if (w) w.hidden = !c.checked;
  }));
  wrap.querySelectorAll("[data-sm-save]").forEach(b => b.addEventListener("click", () => handleSaveScoreEdit(sellerId, b.dataset.smSave)));
  wrap.querySelectorAll("[data-sm-sale]").forEach(b => b.addEventListener("click", async () => {
    const id = b.dataset.smSale;
    const onSale = b.dataset.on === "1";
    SELLER_SCORE_BUSY = id;
    renderMyScores(sellerId);
    const res = await setScoreOnSale(sellerId, id, onSale);
    SELLER_SCORE_BUSY = null;
    renderMyScores(sellerId);
    smShowMsg(id, res.ok
      ? (onSale ? "다시 판매를 시작했어요. 목록·검색에 다시 보여요." : "판매를 중지했어요. 목록·검색에서 빠지고, 이미 산 회원은 계속 받을 수 있어요.")
      : res.message, !res.ok);
  }));
  wrap.querySelectorAll("[data-sm-del]").forEach(b => b.addEventListener("click", () => {
    SELLER_DELETE_CONFIRM = b.dataset.smDel;
    renderMyScores(sellerId);
  }));
  wrap.querySelectorAll("[data-sm-del-no]").forEach(b => b.addEventListener("click", () => {
    SELLER_DELETE_CONFIRM = null;
    renderMyScores(sellerId);
  }));
  wrap.querySelectorAll("[data-sm-del-yes]").forEach(b => b.addEventListener("click", async () => {
    const id = b.dataset.smDelYes;
    const title = STATE.scores[id] ? STATE.scores[id].title : "";
    SELLER_SCORE_BUSY = id;
    renderMyScores(sellerId);
    const res = await deleteScoreBySeller(sellerId, id);
    SELLER_SCORE_BUSY = null;
    SELLER_DELETE_CONFIRM = null;
    if (SELLER_EDIT_OPEN === id) SELLER_EDIT_OPEN = null;
    renderMyScores(sellerId);
    if (res.ok) toast(`"${title}" 악보를 삭제했어요.`);
    else smShowMsg(id, res.message, true);
  }));
}

async function handleSaveScoreEdit(sellerId, id) {
  const s = STATE.scores[id];
  if (!s) return;
  const val = (k) => (document.getElementById(`sm-${k}-${id}`) || {}).value || "";
  const data = {
    title: val("title"), artist: val("artist"), instrument: val("inst"), difficulty: val("diff"),
    price: val("price"), description: val("desc"),
    tags: val("tags").split(/[,，]/).map(t => t.trim()).filter(Boolean),
    hasVideo: !!(document.getElementById(`sm-hasvideo-${id}`) || {}).checked,
    videoUrl: val("videourl")
  };
  const fileInput = document.getElementById(`sm-file-${id}`);
  const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

  // 먼저 입력값만 검사(파일을 올리기 전에 막을 수 있는 건 막는다)
  const check = updateScoreBySellerCheck(data);
  if (check) { smShowMsg(id, check, true); return; }

  SELLER_SCORE_BUSY = id;
  renderMyScores(sellerId);
  if (file) {
    smShowMsg(id, "새 PDF를 올리는 중이에요…", false);
    const up = await uploadScoreFile(sellerId, id, file); // 같은 경로에 덮어쓴다
    if (!up.ok) {
      SELLER_SCORE_BUSY = null;
      renderMyScores(sellerId);
      smShowMsg(id, up.message || "파일 업로드에 실패했어요.", true);
      return;
    }
    data.fileUrl = up.path;
    const bust = `?v=${Date.now()}`; // 같은 주소라 예전 그림이 캐시로 보이지 않도록
    try {
      const blobs = await generateScorePreviewImages(file, 5);
      if (blobs && blobs.length) {
        const r = await uploadScorePreviewImages(sellerId, id, blobs);
        if (r.ok && r.urls.length) data.previewUrls = r.urls.map(u => u + bust);
      }
    } catch (e) { console.error("[seller] 수정 — 미리보기 이미지 오류", e); }
    try { data.pageCount = await getPdfPageCount(file); } catch (e) { console.error("[seller] 수정 — 페이지 수 오류", e); }
    try {
      const blob = await generateScoreCardThumbnail(file);
      if (blob) {
        const r = await uploadScoreCardThumbnail(sellerId, id, blob);
        if (r.ok && r.url) data.cardThumbUrl = r.url + bust;
      }
    } catch (e) { console.error("[seller] 수정 — 카드 썸네일 오류", e); }
  }
  const res = updateScoreBySeller(sellerId, id, data);
  SELLER_SCORE_BUSY = null;
  if (res.ok) SELLER_EDIT_OPEN = null;
  renderMyScores(sellerId);
  smShowMsg(id, res.ok ? (file ? "저장했어요. 새 PDF와 미리보기로 바뀌었어요." : "저장했어요.") : res.message, !res.ok);
}

/* 파일 업로드 전에 쓰는 입력값 검사(updateScoreBySeller 와 같은 기준) — 문제 없으면 "" */
function updateScoreBySellerCheck(d) {
  if (!String(d.title).trim() || !String(d.artist).trim()) return "곡 제목과 가수를 입력해주세요.";
  if (!INSTRUMENTS.includes(d.instrument)) return "악기를 선택해주세요.";
  if (!SCORE_DIFFICULTIES.includes(d.difficulty)) return "난이도를 선택해주세요.";
  const price = Number(d.price);
  if (!Number.isFinite(price) || price <= 0) return "가격을 올바르게 입력해주세요.";
  if (d.hasVideo && !String(d.videoUrl).trim()) return "영상이 있다고 체크했으면 영상 링크도 입력해주세요.";
  return "";
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
