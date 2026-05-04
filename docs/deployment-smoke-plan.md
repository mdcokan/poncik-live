# Poncik Live Deployment Smoke Plan

Structured pre-release checks: documentation, Supabase, build, targeted E2E, and manual smoke. Complements [production-checklist.md](./production-checklist.md).

## A) Pre-deploy checklist

- [ ] **Git clean?** No unintended local changes; branch matches what you intend to deploy.
- [ ] **`npm run build` passed?** Production build completes without errors (see [D](#d-build-command)).
- [ ] **Supabase migrations pushed to remote?** Migrations applied on the target project before or with the app rollout (see [C](#c-supabase-deployment-steps)).
- [ ] **Admin system health page loads?** `/admin/system-health` reachable for staff with appropriate access.
- [ ] **Production env gaps reviewed?** Required vars present in hosting; no secrets committed (see [B](#b-required-env-variables)).
- [ ] **Test-only routes return 404 in production?** `/api/test/*` must not be usable when `NODE_ENV=production` (see production checklist).

## B) Required env variables

| Variable | Role |
|----------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (browser + server). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key; RLS applies. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-side only.** Privileged API paths; never expose via `NEXT_PUBLIC_*`. |
| `TEST_FIXTURE_SECRET` | When set, required for non-production `/api/test/*` calls; production still returns 404 for those routes. |
| `NEXT_PUBLIC_RTC_ICE_SERVERS` | Optional JSON `RTCIceServer[]` for WebRTC; invalid/empty → STUN fallback in app. |
| Cron / backup / SMS (if used) | Document placeholders per provider: e.g. `CRON_SECRET`, webhook `*_SECRET` — set in hosting only. |

**Notes**

- `SUPABASE_SERVICE_ROLE_KEY` must remain server-side only.
- `NEXT_PUBLIC_RTC_ICE_SERVERS` is shipped to the client. For TURN, prefer **short-lived credentials** (e.g. REST/ephemeral) in production rather than long-lived static passwords in public env.
- Even if `TEST_FIXTURE_SECRET` is set in production, `/api/test/*` routes return **404** when `NODE_ENV=production`.

## C) Supabase deployment steps

1. Review pending migrations: `npx supabase migration list`
2. Apply to remote database: `npx supabase db push`

After migrations, spot-check that critical tables exist and match expectations (names may vary slightly by migration history; align with your project):

- `private_room_sessions`
- `private_room_signals`
- `dm_conversations`
- `dm_messages`
- `streamer_withdrawal_requests`
- `admin_action_logs`

## D) Build command

```bash
npm run build
```

## E) Recommended E2E smoke commands

Specs that use live/private room fixtures or heavy realtime should run with **`--workers=1`** to avoid cross-test interference.

```bash
npx playwright test tests/e2e/auth-smoke.spec.ts --workers=1 --trace=off
npx playwright test tests/e2e/member-panel-navigation.spec.ts --workers=1 --trace=off
npx playwright test tests/e2e/streamer-panel-navigation.spec.ts --workers=1 --trace=off
npx playwright test tests/e2e/private-room-session.spec.ts --workers=1 --trace=off
npx playwright test tests/e2e/private-room-signaling.spec.ts --workers=1 --trace=off
npx playwright test tests/e2e/private-room-webrtc-foundation.spec.ts --workers=1 --trace=off
npx playwright test tests/e2e/dm-messaging.spec.ts --workers=1 --trace=off
npx playwright test tests/e2e/admin-system-health.spec.ts --workers=1 --trace=off
npx playwright test tests/e2e/admin-private-room-reports.spec.ts --workers=1 --trace=off
```

**Note:** Live/private room fixture flows require `workers=1`.

Optional shortcut (subset): `npm run test:e2e:smoke` — see `package.json`.

## F) Manual smoke test checklist

**Admin**

- [ ] `/admin/system-health` opens
- [ ] `/admin/private-rooms` opens
- [ ] `/admin/finance` opens
- [ ] `/admin/users` — user detail opens

**Member**

- [ ] `/member` opens
- [ ] Minute balance visible
- [ ] Minute packages open
- [ ] Online streamer card visible
- [ ] “Mesajlarım” / messages opens

**Streamer**

- [ ] `/streamer` opens
- [ ] “Yayına Git” (or equivalent) works
- [ ] Messages opens
- [ ] “Özel Oda Kazançlarım” (or equivalent) opens

**Studio / live**

- [ ] Streamer starts broadcast from `/streamer` studio
- [ ] Member joins from live card
- [ ] DM overlay opens
- [ ] Private room request sent
- [ ] Streamer accepts
- [ ] Private room session panel opens
- [ ] Ready state visible on both sides
- [ ] Signaling debug shows `ready_ping` / offer / answer as expected
- [ ] Session ended
- [ ] Minutes deducted
- [ ] Streamer earnings updated
- [ ] Admin private room report reflects the session

## G) Known limitations

- Without TURN, WebRTC may fail on some networks (strict NAT).
- Remote video is not guaranteed on every network path.
- DM is text-only (no file/image messages).
- Follow system is placeholder.
- Profile edit may be placeholder.
- Advanced stream analytics placeholder.
- No file/image messaging in DM.

## H) Rollback notes

- **Application:** revert the deployed commit (e.g. git revert / redeploy previous revision) per your host’s workflow.
- **Supabase:** automatic “down” migration is not assumed; prefer a **forward-fix migration** if schema/data must be corrected.
- After rollback or hotfix, re-check **admin system health**, **`npm run build`**, and critical E2E smoke commands before calling the release stable.
