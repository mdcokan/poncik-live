# Poncik Live Production Checklist

Short deploy gate for env, security-sensitive routes, Supabase realtime/RPC, WebRTC config, and E2E smoke.

## Required environment variables

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (RLS applies). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only.** Used by API routes that must bypass RLS (e.g. busy streamers list, test fixture maintenance). Never `NEXT_PUBLIC_*`. |
| `TEST_FIXTURE_SECRET` | If set, required as header `x-test-fixture-secret` for `/api/test/*`. In `NODE_ENV=production`, those routes return **404** regardless. |
| `NEXT_PUBLIC_RTC_ICE_SERVERS` | Optional JSON array of `RTCIceServer` objects. Invalid or empty → app falls back to public Google STUN. |

Optional / product-specific:

- Cron or backup webhooks: document any `*_SECRET` or `CRON_SECRET` your hosting uses and keep them out of client bundles.

There is no committed `.env.example` in this repo; copy vars from your Supabase dashboard and hosting provider.

## Supabase realtime tables

These tables are in `supabase_realtime` with **`replica identity full`** (required for filtered subscriptions / old row payloads where applicable):

- `rooms`
- `room_messages`
- `room_presence`
- `gift_transactions`
- `wallets`
- `private_room_requests`
- `private_room_sessions`
- `private_room_signals`
- `dm_messages`
- `dm_conversations`
- `room_mutes`, `room_bans`, `room_kicks`

Publication adds use `pg_publication_tables` checks (idempotent) except legacy `room_messages` migration, which runs once in order.

**RLS:** Realtime delivery respects RLS `SELECT` for the subscriber JWT. Admin/owner policies on sensitive tables (e.g. `private_room_sessions`) allow staff visibility by design.

**Sensitive data:** `private_room_signals.payload` may carry WebRTC SDP/ICE (required for signaling). Subscribers are session participants (and admins per policies).

## Test-only route safety

Routes under `src/app/api/test/**`:

- Return **404** when `NODE_ENV === "production"` (message does not reveal existence).
- When `TEST_FIXTURE_SECRET` is set, require header `x-test-fixture-secret`.
- Service role is used only on the server inside these routes; responses avoid tokens and emails (fixture snapshot uses ids, roles, ban flags, display names, wallet balance, cleanup counters).

## Admin / RPC security

Security-definer RPCs used in production should set `search_path = public`, revoke execute from `public`/`anon` where applicable, grant to `authenticated`, and enforce `auth.uid()` / role checks inside the function.

Spot-checked RPCs (including migrations and fixes): `send_private_room_signal`, `set_private_room_ready`, `start_private_room_session`, `end_private_room_session`, `send_direct_message`, `mark_dm_conversation_read`, `create_streamer_withdrawal_request`, `decide_streamer_withdrawal_request`, `admin_manage_profile`, `admin_close_live_room`, `moderate_room_user` — follow this pattern.

Migration `20260504120000_revoke_anon_admin_adjust_wallet.sql` revokes `anon` execute on `admin_adjust_wallet` and `admin_close_live_room` (authorization remains enforced inside each RPC).

Next.js `/api/admin/*` routes use the caller’s Bearer JWT and Supabase anon client; privileged actions go through RPCs that check admin/owner on the database side.

## RTC / TURN notes

- `NEXT_PUBLIC_RTC_ICE_SERVERS` is parsed in `src/lib/rtc/ice-servers.ts`: invalid JSON or bad entries → **fallback STUN** (`stun:stun.l.google.com:19302`).
- **TURN credentials are exposed to the browser** when placed in `NEXT_PUBLIC_*` JSON. For production, prefer **short-lived TURN credentials** (REST / ephemeral) issued by your backend instead of static username/password in env.

## E2E recommended commands

Use **`--workers=1`** for specs that share live rooms, private sessions, or realtime-heavy flows to avoid cross-test interference. CI: run critical private-room / live suites **serially** or in separate jobs with one worker.

```bash
npm run test:e2e
npm run test:e2e:ui
```

Examples (match local smoke):

```bash
npx playwright test tests/e2e/auth-smoke.spec.ts --workers=1 --trace=off
npx playwright test tests/e2e/member-panel-navigation.spec.ts --workers=1 --trace=off
npx playwright test tests/e2e/streamer-panel-navigation.spec.ts --workers=1 --trace=off
npx playwright test tests/e2e/private-room-session.spec.ts --workers=1 --trace=off
npx playwright test tests/e2e/private-room-signaling.spec.ts --workers=1 --trace=off
npx playwright test tests/e2e/admin-private-room-reports.spec.ts --workers=1 --trace=off
```

Fixture emails/passwords are duplicated across spec files; `tests/e2e/helpers/normalize-fixtures.ts` centralizes the normalize API call.

## Deployment smoke checklist

1. `npm run build`
2. `auth-smoke` (Playwright, workers=1)
3. `member-panel-navigation`
4. `streamer-panel-navigation`
5. `private-room-session`
6. `private-room-signaling`
7. `admin-private-room-reports`

## Private room pricing

- Özel oda dakika fiyatı ve yayıncı payı `Admin > Sistem Ayarları > Özel Oda Ayarları` üzerinden yönetilir.
- Bu ayar `platform_settings.private_room_pricing` içinde tutulur ve özel oda ücretlendirmesi genel oda dakikasından bağımsızdır.

## Known limitations

- Without TURN, WebRTC may fail on strict NATs / symmetric NAT (STUN-only).
- DM attachments (files/images) are not implemented.
- Profile editing UI may be placeholder.
- Follow system is placeholder.
- Advanced stream analytics are placeholder.
