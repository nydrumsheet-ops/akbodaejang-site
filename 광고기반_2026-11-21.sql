-- ============================================================
-- 광고기반_2026-11-21.sql — 판매자 광고 "기반" (광고는 꺼진 상태로 시작)
--
-- 실행 방법: Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여 넣고 Run.
--            여러 번 실행해도 안전하다(이미 있으면 건너뜀).
--
-- 만드는 것
--   1) ad_settings   : 광고 온/오프 스위치 (한 줄짜리 설정 표). 누구나 읽고, 관리자만 바꾼다.
--   2) score_events  : 악보 카드의 "목록 노출"·"관심"·"클릭" 기록. 사이트에서 직접 읽고 쓸 수 없고,
--                      아래 서버 함수로만 기록·조회한다.
--   3) 서버 함수 3개
--      - rpc_log_score_events(p_events)        : 노출·관심·클릭 기록 (로그인 안 해도 가능)
--      - rpc_my_score_event_stats(p_days)      : 판매자 본인 악보의 노출·관심·클릭 합계
--      - rpc_admin_score_event_summary(p_days) : 관리자용 전체 합계
--
-- 2026-11-21 같은 날 추가: "관심(interest)" — PC에서 카드에 마우스를 1.5초 이상 올려둠, 또는 카드에서 장바구니·찜을 누름.
--   이미 이 파일을 한 번 실행했어도, 고친 이 파일 전체를 다시 실행하면 그대로 올라간다(기존 기록은 지워지지 않음).
--
-- 돈이 오가는 기능(광고캐시 충전·과금)은 여기에 없다. 기획서 9장 "나중에 만들 것" 참고.
-- 이 파일은 기존 테이블(users, scores 등)을 바꾸지 않는다.
-- ============================================================


-- ---------- 0. 지금 로그인한 회원의 users.id ----------
-- users.supabase_user_id 와 Supabase 로그인 계정(auth.uid())을 맞춰 찾는다.
create or replace function public.akb_ads_my_user_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.id::text
  from public.users u
  where auth.uid() is not null
    and u.supabase_user_id::text = auth.uid()::text
  limit 1
$$;


-- ---------- 1. 광고 스위치 ----------
create table if not exists public.ad_settings (
  id               int primary key default 1 check (id = 1),  -- 항상 한 줄만
  ads_enabled      boolean not null default false,             -- 전체 스위치
  open_instruments text[]  not null default '{}',              -- 광고를 연 악기(카테고리)
  beta_seller_ids  text[]  not null default '{}',              -- 먼저 시험 운영할 판매자 users.id
  new_slot_enabled boolean not null default true,              -- 무료 "신규 악보" 칸
  updated_at       timestamptz not null default now(),
  updated_by       text
);

insert into public.ad_settings (id) values (1) on conflict (id) do nothing;

alter table public.ad_settings enable row level security;

drop policy if exists ad_settings_select_all on public.ad_settings;
create policy ad_settings_select_all on public.ad_settings
  for select to anon, authenticated using (true);

drop policy if exists ad_settings_update_admin on public.ad_settings;
create policy ad_settings_update_admin on public.ad_settings
  for update to authenticated
  using (public.akb_is_admin())
  with check (public.akb_is_admin());
-- insert/delete 정책은 만들지 않는다 → 아무도 줄을 추가하거나 지울 수 없다.


-- ---------- 2. 노출·클릭 기록 ----------
create table if not exists public.score_events (
  id          bigint generated always as identity primary key,
  event_type  text not null check (event_type in ('impression', 'interest', 'click')),
  score_id    text not null,
  seller_id   text not null,
  surface     text not null check (surface in ('search', 'category', 'list', 'home', 'detail', 'artist', 'other')),
  slot_type   text not null default 'organic' check (slot_type in ('organic', 'new', 'ad')),
  query       text,                 -- 검색어 (최대 60자)
  viewer_key  text not null,        -- 브라우저마다 만든 무작위 값. 회원 정보와 연결되지 않는다
  created_at  timestamptz not null default now()
);

create index if not exists score_events_seller_time on public.score_events (seller_id, created_at);
create index if not exists score_events_score_time  on public.score_events (score_id, created_at);
create index if not exists score_events_dedupe      on public.score_events (viewer_key, score_id, event_type, surface, created_at);

alter table public.score_events enable row level security;

-- 예전 버전(노출·클릭만)으로 이미 만들어진 표도 "관심"을 받을 수 있게 검사 조건을 바꾼다.
alter table public.score_events drop constraint if exists score_events_event_type_check;
alter table public.score_events add constraint score_events_event_type_check
  check (event_type in ('impression', 'interest', 'click'));

-- 관리자만 직접 읽을 수 있다. 쓰기 정책은 없다(서버 함수로만 기록).
drop policy if exists score_events_select_admin on public.score_events;
create policy score_events_select_admin on public.score_events
  for select to authenticated using (public.akb_is_admin());


-- ---------- 3-1. 노출·클릭 기록 함수 ----------
-- p_events: [{ "type": "impression"|"interest"|"click", "score_id": "...", "surface": "search", "slot": "organic", "query": "..." , "viewer": "..." }, ...]
-- 지키는 규칙
--   - 한 번에 최대 50건
--   - 판매 중(승인)인 악보만, seller_id 는 서버가 scores 에서 직접 찾는다(보낸 값 무시)
--   - 판매자 본인의 노출·클릭은 기록하지 않는다
--   - 같은 브라우저·같은 악보·같은 종류·같은 위치는 30분에 한 번만 센다(새로고침·반복 클릭 방지)
create or replace function public.rpc_log_score_events(p_events jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  e        jsonb;
  v_type   text;
  v_score  text;
  v_surf   text;
  v_slot   text;
  v_query  text;
  v_viewer text;
  v_seller text;
  v_me     text := public.akb_ads_my_user_id();
  v_count  int := 0;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    return 0;
  end if;

  for e in select value from jsonb_array_elements(p_events) limit 50 loop
    v_type   := e->>'type';
    v_score  := left(coalesce(e->>'score_id', ''), 80);
    v_surf   := coalesce(e->>'surface', 'other');
    v_slot   := coalesce(e->>'slot', 'organic');
    v_query  := nullif(left(btrim(coalesce(e->>'query', '')), 60), '');
    v_viewer := left(coalesce(e->>'viewer', ''), 64);

    continue when v_type is null or v_type not in ('impression', 'interest', 'click');
    continue when v_surf not in ('search', 'category', 'list', 'home', 'detail', 'artist', 'other');
    continue when v_slot not in ('organic', 'new', 'ad');
    continue when length(v_viewer) < 8 or v_score = '';

    select s.seller_id::text into v_seller
    from public.scores s
    where s.id::text = v_score and s.status = '승인';
    continue when v_seller is null;
    continue when v_me is not null and v_me = v_seller;

    continue when exists (
      select 1 from public.score_events x
      where x.viewer_key = v_viewer and x.score_id = v_score
        and x.event_type = v_type and x.surface = v_surf
        and x.created_at > now() - interval '30 minutes'
    );

    insert into public.score_events (event_type, score_id, seller_id, surface, slot_type, query, viewer_key)
    values (v_type, v_score, v_seller, v_surf, v_slot, v_query, v_viewer);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.rpc_log_score_events(jsonb) to anon, authenticated;


-- ---------- 3-2. 판매자 본인 통계 ----------
-- 돌려주는 칸이 바뀌면 create or replace 로는 안 바뀌어서, 먼저 지우고 다시 만든다.
drop function if exists public.rpc_my_score_event_stats(int);
create function public.rpc_my_score_event_stats(p_days int default 30)
returns table (score_id text, surface text, slot_type text, impressions bigint, interests bigint, clicks bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me text := public.akb_ads_my_user_id();
begin
  if v_me is null then
    return;
  end if;
  return query
    select e.score_id, e.surface, e.slot_type,
           count(*) filter (where e.event_type = 'impression') as impressions,
           count(*) filter (where e.event_type = 'interest')   as interests,
           count(*) filter (where e.event_type = 'click')      as clicks
    from public.score_events e
    where e.seller_id = v_me
      and (coalesce(p_days, 0) <= 0 or e.created_at >= now() - make_interval(days => p_days))
    group by e.score_id, e.surface, e.slot_type;
end;
$$;

grant execute on function public.rpc_my_score_event_stats(int) to authenticated;


-- ---------- 3-3. 관리자용 전체 합계 ----------
drop function if exists public.rpc_admin_score_event_summary(int);
create function public.rpc_admin_score_event_summary(p_days int default 7)
returns table (surface text, slot_type text, impressions bigint, interests bigint, clicks bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.akb_is_admin() then
    return;
  end if;
  return query
    select e.surface, e.slot_type,
           count(*) filter (where e.event_type = 'impression'),
           count(*) filter (where e.event_type = 'interest'),
           count(*) filter (where e.event_type = 'click')
    from public.score_events e
    where coalesce(p_days, 0) <= 0 or e.created_at >= now() - make_interval(days => p_days)
    group by e.surface, e.slot_type;
end;
$$;

grant execute on function public.rpc_admin_score_event_summary(int) to authenticated;


-- ---------- (선택) 오래된 기록 정리 ----------
-- 기록은 계속 쌓이므로, 몇 달에 한 번 아래 한 줄을 실행해 180일 넘은 기록을 지운다.
-- delete from public.score_events where created_at < now() - interval '180 days';
