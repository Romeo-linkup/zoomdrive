# Manual Tests

## Phase 0
- Run `npm run dev` from backend directory
- Open `http://localhost:4000/api/v1/health` and confirm JSON response with ok:true
- Open `http://localhost:4000/api/v1/nope` and confirm JSON error with error.code ZD-SYS-003 and a requestId
- Stop the server, start it twice in two terminals and confirm the second prints the PORT_IN_USE line

## Phase 1
- Run `npm run migrate` from backend directory (expect: 8 SKIPPED, 0 applied, since migrations are already applied)
- Run `npm run schema:audit` from backend directory (expect: SCHEMA AUDIT PASSED with 19 tables)
- Open the Neon dashboard Tables view and confirm 19 tables exist
- Run `npm run dev` from backend directory and confirm the boot table shows:
  - env ........ OK
  - database ... OK (latency <n>ms)
  - migrations . OK (8 applied, 0 pending)
  - cloudinary . SKIPPED (phase 3)
  - listening on :4000
- Open `http://localhost:4000/api/v1/health` and confirm db is 'up' and migrations shows { applied: 8, pending: 0 }

## Phase 2
Precondition: backend/.env has OTP_DRIVER=console and OTP_DEV_ECHO=true, run npm run dev in one terminal and use a second terminal for the commands:

```powershell
$base = "http://localhost:4000/api/v1"
function Show($e) { $e.ErrorDetails.Message }
# 1. Driver: request a code (devCode is echoed in dev)
$r = Invoke-RestMethod -Method Post -Uri "$base/auth/otp/request" -ContentType "application/json" -Body '{"phone":"082 000 0001","app":"driver"}'
$r.data
# 2. Driver: verify and keep the token
$body = @{ phone = "082 000 0001"; code = $r.data.devCode; app = "driver" } | ConvertTo-Json
$v = Invoke-RestMethod -Method Post -Uri "$base/auth/otp/verify" -ContentType "application/json" -Body $body
$v.data
$token = $v.data.token
# 3. Who am I
(Invoke-RestMethod -Uri "$base/auth/me" -Headers @{ Authorization = "Bearer $token" }).data
# 4. Wrong app: the same number in the provider app must fail with ZD-AUTH-004
try { Invoke-RestMethod -Method Post -Uri "$base/auth/otp/request" -ContentType "application/json" -Body '{"phone":"0820000001","app":"provider"}' } catch { Show $_ }
# 5. Provider: a different number works in the provider app
$p = Invoke-RestMethod -Method Post -Uri "$base/auth/otp/request" -ContentType "application/json" -Body '{"phone":"+27 82 000 0002","app":"provider"}'
# 6. Rate limit: request 4 codes for one number within 10 minutes; the 4th must fail with ZD-AUTH-003
1..4 | ForEach-Object { try { Invoke-RestMethod -Method Post -Uri "$base/auth/otp/request" -ContentType "application/json" -Body '{"phone":"082 000 0003","app":"driver"}' | Out-Null; "request $_ ok" } catch { "request $_ " + (Show $_) } }
# 7. Bad phone: must fail with ZD-VAL-001 and field phone
try { Invoke-RestMethod -Method Post -Uri "$base/auth/otp/request" -ContentType "application/json" -Body '{"phone":"12345","app":"driver"}' } catch { Show $_ }
# 8. No token: must fail with ZD-AUTH-001
try { Invoke-RestMethod -Uri "$base/auth/me" } catch { Show $_ }
```
## Phase 3
$base = "http://localhost:4000/api/v1"
$photo = "C:\Users\Romeo\Pictures\test-photo.jpg"
$doc   = "C:\Users\Romeo\Pictures\test-doc.pdf"
function Show($e) { $e.ErrorDetails.Message }
function Login($phone, $app) {
  $r = Invoke-RestMethod -Method Post -Uri "$base/auth/otp/request" -ContentType "application/json" -Body (@{ phone=$phone; app=$app } | ConvertTo-Json)
  $v = Invoke-RestMethod -Method Post -Uri "$base/auth/otp/verify" -ContentType "application/json" -Body (@{ phone=$phone; code=$r.data.devCode; app=$app } | ConvertTo-Json)
  $v.data.token
}
function Api($method, $path, $token, $body) {
  $h = @{ Authorization = "Bearer $token" }
  if ($body) { Invoke-RestMethod -Method $method -Uri "$base$path" -Headers $h -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 5) }
  else { Invoke-RestMethod -Method $method -Uri "$base$path" -Headers $h }
}

# ---------- DRIVER ----------
$d = Login "082 000 0011" "driver"
# 1. No consent: must fail ZD-VAL-001, field consent
try { Api Put "/drivers/me" $d @{ firstName="Sipho"; lastName="Dlamini" } } catch { Show $_ }
# 2. With consent: profileComplete must be true
(Api Put "/drivers/me" $d @{ firstName="Sipho"; lastName="Dlamini"; vehicleMake="Toyota"; vehicleModel="Corolla"; plate="CA 123 456"; hailPlatform="bolt"; consent=$true }).data
# 3. Saved places: create, list, delete
$sp = Api Post "/drivers/me/saved-places" $d @{ label="Home"; address="12 Test Rd, Durban"; lat=-29.85; lng=31.02 }
$sp.data
(Api Get "/drivers/me/saved-places" $d).data
(Api Delete "/drivers/me/saved-places/$($sp.data.place.id)" $d).data
# 4. Photo upload: user.photoUrl must be a Cloudinary URL
curl.exe -s -X POST -H "Authorization: Bearer $d" -F "photo=@$photo" "$base/users/me/photo"
# 5. Text file renamed to .jpg: must fail ZD-UPL-001
"not an image" | Out-File "$env:TEMP\fake.jpg"
curl.exe -s -X POST -H "Authorization: Bearer $d" -F "photo=@$env:TEMP\fake.jpg" "$base/users/me/photo"
# 6. 6 MB file: must fail ZD-UPL-002
[IO.File]::WriteAllBytes("$env:TEMP\big.jpg", (New-Object byte[] 6291456))
curl.exe -s -X POST -H "Authorization: Bearer $d" -F "photo=@$env:TEMP\big.jpg" "$base/users/me/photo"
# 7. Driver token on a provider route: must fail ZD-AUTH-004
try { Api Get "/providers/me/documents" $d } catch { Show $_ }

# ---------- PROVIDER (company) ----------
$p = Login "082 000 0012" "provider"
# 8. Nothing done yet: submit must fail ZD-PROV-001
try { Api Post "/providers/me/submit" $p } catch { Show $_ }
# 9. Photo added, no profile: submit must fail ZD-USR-001
curl.exe -s -X POST -H "Authorization: Bearer $p" -F "photo=@$photo" "$base/users/me/photo" | Out-Null
try { Api Post "/providers/me/submit" $p } catch { Show $_ }
# 10. Company profile saved, no company details: must fail ZD-PROV-004
(Api Put "/providers/me" $p @{ providerType="company"; firstName="Thabo"; lastName="Mokoena"; vehicleDescription="White Hilux bakkie"; plate="CA 482 913"; baseLat=-29.86; baseLng=31.03; serviceRadiusKm=25; consent=$true }).data.profile
try { Api Post "/providers/me/submit" $p } catch { Show $_ }
# 11. Company details added, no services: must fail ZD-PROV-003
(Api Put "/providers/me/organisation" $p @{ name="Mokoena Tyre and Tow"; regNumber="2019/123456/07" }).data.profile
try { Api Post "/providers/me/submit" $p } catch { Show $_ }
# 12. In the Neon SQL editor run: select id, code, active from services order by id;
#     then put the ids of flat_tyre and jump_start here:
$svc = @(1, 2)
try { Api Put "/providers/me/services" $p @{ serviceIds=@(99999) } } catch { Show $_ }   # must fail ZD-REQ-002
(Api Put "/providers/me/services" $p @{ serviceIds=$svc }).data.profile.serviceIds
# 13. No documents: must fail ZD-PROV-002 with all four types in details.missing
try { Api Post "/providers/me/submit" $p } catch { Show $_ }
# 14. Upload the four documents, then list: four rows, status pending, no file URLs
"id_document","drivers_licence","vehicle_insurance","company_registration" | ForEach-Object {
  curl.exe -s -X POST -H "Authorization: Bearer $p" -F "doc_type=$_" -F "file=@$doc" "$base/providers/me/documents" | Out-Null
}
(Api Get "/providers/me/documents" $p).data.documents
# 15. Re-upload one: the list must still have four rows
curl.exe -s -X POST -H "Authorization: Bearer $p" -F "doc_type=id_document" -F "file=@$doc" "$base/providers/me/documents" | Out-Null
(Api Get "/providers/me/documents" $p).data.documents.Count
# 16. Submit: providerStatus must be "pending"
(Api Post "/providers/me/submit" $p).data.providerStatus
# 17. Not approved yet: going online must fail ZD-PROV-005
try { Api Post "/providers/me/online" $p @{ online=$true; lat=-29.86; lng=31.03 } } catch { Show $_ }

## Phase 4
1. Backend running (cd backend; npm run dev). In frontend: npm install (first time only) then npm run dev. Open http://localhost:3100/ (landing: logo, two big buttons), http://localhost:3000/driver/ and http://localhost:3000/provider/. Each welcome screen shows 'Connected to API · v... · database up'.
2. Chrome DevTools > Application > Manifest for each app: names ZoomDrive and ZoomDrive Partner, different ids and scopes, icons load with no warnings. Application > Service Workers: one activated worker per scope (/driver/ and /provider/).
3. In Chrome, install each app from the address-bar install icon: two separate windows with two different icons and names.
4. Stop the backend and reload an app: a red banner appears with 'Code ZD-NET-001 · ref -' and a 'Copy details' button; paste the clipboard into a text editor and confirm it is JSON with app, version, route, code, status, requestId, time.
5. DevTools > Network > Offline, reload: the page still loads from cache and the 'You're offline' bar shows. Switch back to Online and it disappears.
6. DevTools device toolbar at 360px width: no horizontal scrolling on any of the three pages.
7. Phone install (Add to Home Screen) needs HTTPS, so it is tested after the first Vercel deployment, not over the local network.

## Phase 5
1. Guest: open /driver/ > Just looking? > Home shows the guest banner. Tap Flat tyre: you land on the phone screen with the green 'Create a profile to request help' banner.
2. Enter 12345: field error 'Enter a valid South African mobile number'. Enter 082 000 0021: OTP screen shows the dev code; enter a wrong code: red error under the boxes, boxes clear. Enter the right code (or paste it): profile setup opens.
3. Press Create profile empty: errors on first name, surname and the consent box. Fill names, tick consent, add a photo, choose a platform, Create profile: you land on the 'Requesting help arrives in a later update' placeholder (the next route from step 1). Go Home > Account: name, photo and phone are shown.
4. Reload the page: still signed in. Account > Profile: the form is pre-filled, no consent box; change the surname and save.
5. Log out (confirm dialog) returns to welcome. Log in with 082 000 0021: no profile screen, straight to Home.
6. Role mismatch: in the driver app enter 082 000 0012 (a provider from the Phase 3 test): friendly card with the server message and an 'Open ZoomDrive Partner' button that opens /provider/.
7. Rate limit: request a code for 082 000 0022 four times (use Resend and Change number): the 4th shows a red banner with Code ZD-AUTH-003.
8. In Cloudinary the photo is under zoomdrive/development/photos; in Neon: select first_name, last_name, photo_url from users where phone = '+27820000021'; and select consent_at from driver_profiles for that user.
9. 360px width in DevTools: no horizontal scroll on welcome, phone, otp, profile setup, home, account.

## Phase 6
1. Open /provider/: welcome with PARTNER badge. Sign up with 082 000 0031, enter the dev code: the type chooser opens. Choose Individual.
2. Press Save without a photo: red 'A profile photo is required' and the circle turns red. Add a photo, leave names empty: field errors. Fill everything, press 'Use my current location' (allow it; or enter coordinates manually, for example -29.8587 and 31.0218), choose Flat tyre and Jump-start, tick consent, Save and continue: the documents page opens.
3. Submit is disabled. Upload ID document, driver's licence and vehicle and insurance (a JPG or PDF each): rows show 'Uploaded ✓ (in review)', the checklist disappears, Submit enables. Submit: the pending screen 'Profile under review' opens.
4. Reload: still on Pending. Log out and log in again with the same number: straight to Pending. Try opening #/documents manually: you are sent back to Pending.
5. Neon: select verification_status, submitted_at from provider_profiles where user_id = (select id from users where phone = '+27820000031'); then select doc_type, status from provider_documents for that user (3 rows). Cloudinary: photo under zoomdrive/development/photos, documents under zoomdrive/development/documents.
6. Rejected flow: in Neon run update provider_profiles set verification_status = 'rejected', rejection_reason = 'Photo is blurry' where user_id = (select id from users where phone = '+27820000031'); and update provider_documents set status = 'rejected', note = 'ID is unreadable' where doc_type = 'id_document' and provider_user_id = (select id from users where phone = '+27820000031'); then press Refresh status: red banner with the reason; 'Fix and resubmit' shows the ID row as 'Rejected: upload again' with the note; re-upload it, Submit: back to Pending.
7. Approved flow: update provider_profiles set verification_status = 'approved' where user_id = (select id from users where phone = '+27820000031'); within 20 seconds (or after Refresh status) the app opens the 'You are approved' placeholder. Reload: still there; manually opening #/profile-setup bounces to home.
8. Company: sign up 082 000 0032, choose Company: the form shows Company name and Registration number (required); the documents page lists FOUR rows including 'Company registration certificate'; Submit stays disabled until all four are uploaded.
9. Role mismatch: in the provider app enter the driver number 082 000 0021: friendly card with an 'Open ZoomDrive' button.
10. 360px width in DevTools: no horizontal scroll on welcome, type, profile, documents, pending.

## Phase 7
Backend and frontend running; frontend at http://localhost:3100; admin created with `node scripts/create-admin.js` from backend, a strong password you do not reuse anywhere else.

1. Open http://localhost:3100/admin/: login screen. A wrong password shows a red banner with Code ZD-ADM-001. The right one opens the Overview with counts. Reload: still signed in; Log out returns to the login screen.
2. Reset the Phase 6 test provider to 'pending' in the Neon SQL editor:
   ```
   update provider_profiles set verification_status='pending', approved_at=null, approved_by=null, rejection_reason=null where user_id=(select id from users where phone='+27820000031');
   update provider_documents set status='pending', note=null, reviewed_at=null, reviewed_by=null where provider_user_id=(select id from users where phone='+27820000031');
   ```
   Overview now shows 1 pending provider.
3. Providers > Pending review lists the provider. Open it: photo, vehicle, services, location link and three document cards with previews (images) or 'Open PDF'. 'Approve provider' is disabled.
4. Reject the ID document with the note 'ID is unreadable': the provider's status becomes Rejected automatically with that reason. In the provider app (signed in as 082 000 0031, press Refresh status) the red banner shows the reason; Fix and resubmit shows the note on the ID row; re-upload and Submit: the admin sees the provider as Pending again.
5. In admin approve the three documents one by one, then 'Approve provider': status Approved. In the provider app the 'You are approved' screen appears within 20 seconds.
6. In Neon:
   ```
   select action, entity, entity_id, actor_type from audit_log order by id desc limit 10;
   ```
   (admin.login, admin.document_review, admin.provider_reject, admin.provider_approve);
   ```
   select kind, title from notifications order by id desc limit 5;
   ```
   (provider_rejected, provider_approved);
   and approved_by is set on provider_profiles.
7. Try to approve the same provider again from PowerShell (copy the token from the login call in the smoke test): expect ZD-ADM-002.
8. Services: set Flat tyre base price to R200 and Save; reload the page: R200.00. http://localhost:4000/api/v1/services shows basePriceCents 20000. Set it back to R180.
9. Settings: set commission to 15 and Save; set it to 80: a red field error 'Must be between 0 and 50'. Neon: select key, value from app_settings; Set commission back to 12.
10. Users: lists drivers and providers; filter by role; search by part of a phone number; click a provider row to open its detail.
11. Security: a driver or provider token on GET /api/v1/admin/overview returns ZD-AUTH-001 (smoke test); the admin token on GET /api/v1/auth/me returns ZD-AUTH-001.

## Phase 8
Preconditions: backend running; provider +27820000031 is approved (Phase 7 test) and offers Flat tyre; run the SQL steps in the Neon SQL editor where marked; admin email and password are entered at the prompts below.

```powershell
$base = "http://localhost:4000/api/v1"
function Show($e) { $e.ErrorDetails.Message }
function Login($phone, $app) {
  $r = Invoke-RestMethod -Method Post -Uri "$base/auth/otp/request" -ContentType "application/json" -Body (@{ phone=$phone; app=$app } | ConvertTo-Json)
  $v = Invoke-RestMethod -Method Post -Uri "$base/auth/otp/verify" -ContentType "application/json" -Body (@{ phone=$phone; code=$r.data.devCode; app=$app } | ConvertTo-Json)
  $v.data.token
}
function Api($method, $path, $token, $body) {
  $h = @{ Authorization = "Bearer $token" }
  if ($body) { Invoke-RestMethod -Method $method -Uri "$base$path" -Headers $h -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 5) }
  else { Invoke-RestMethod -Method $method -Uri "$base$path" -Headers $h }
}
$d = Login "082 000 0041" "driver"
Api Put "/drivers/me" $d @{ firstName="Test"; lastName="Driver"; consent=$true } | Out-Null
$p = Login "082 000 0031" "provider"
$tyre = ((Invoke-RestMethod -Uri "$base/services").data.services | Where-Object code -eq "flat_tyre").id
# 1. Provider goes online near the driver; a driver cannot use provider routes (ZD-AUTH-004)
(Api Post "/providers/me/online" $p @{ online=$true; lat=-29.86; lng=31.03 }).data
try { Api Post "/providers/me/online" $d @{ online=$true; lat=-29.86; lng=31.03 } } catch { Show $_ }
# 2. Quote: price, eta, providersNearby = 1
$q = Api Post "/requests/quote" $d @{ serviceId=$tyre; lat=-29.85; lng=31.02 }
$q.data
# 3. Create with the quoted total: status searching, offersSent 1
$r = Api Post "/requests" $d @{ serviceId=$tyre; lat=-29.85; lng=31.02; addressText="12 Test Rd, Durban"; expectedTotalCents=$q.data.totalCents }
$r.data.offersSent
$rid = $r.data.request.id
# 4. A second open request must fail with ZD-REQ-003
try { Api Post "/requests" $d @{ serviceId=$tyre; lat=-29.85; lng=31.02 } } catch { Show $_ }
# 5. Provider sees the offer (no phone or surname), the driver cannot accept (ZD-AUTH-004)
(Api Get "/providers/me/offers" $p).data.offers | ConvertTo-Json -Depth 4
try { Api Post "/requests/$rid/accept" $d } catch { Show $_ }
# 6. Accept; the second accept must fail with ZD-REQ-006
(Api Post "/requests/$rid/accept" $p).data.request.status
try { Api Post "/requests/$rid/accept" $p } catch { Show $_ }
# 7. Driver now sees the provider (phone, rating, vehicle) and an ETA
(Api Get "/requests/$rid" $d).data.request | ConvertTo-Json -Depth 5
# 8. Arrived, completed; then cancelling a completed job must fail with ZD-REQ-005
(Api Post "/requests/$rid/arrived" $p).data.request.status
(Api Post "/requests/$rid/complete" $p).data.request.status
try { Api Post "/requests/$rid/cancel" $d @{ reason="x" } } catch { Show $_ }
(Api Get "/requests" $d).data.requests | Format-Table id, status, totalCents
(Api Get "/providers/me/jobs" $p).data | ConvertTo-Json -Depth 4
# 9. Price protection: a wrong expected total must fail with ZD-REQ-008
try { Api Post "/requests" $d @{ serviceId=$tyre; lat=-29.85; lng=31.02; expectedTotalCents=1 } } catch { Show $_ }
# 10. Cancel while searching: provider's offers disappear
$r2 = Api Post "/requests" $d @{ serviceId=$tyre; lat=-29.85; lng=31.02 }
(Api Post "/requests/$($r2.data.request.id)/cancel" $d @{ reason="Changed my mind" }).data.request.status
(Api Get "/providers/me/offers" $p).data.offers.Count
# 11. Outside the service area must fail with ZD-REQ-004
try { Api Post "/requests/quote" $d @{ serviceId=$tyre; lat=51.5; lng=-0.12 } } catch { Show $_ }
# 12. Expiry: create a request, then in Neon run: update requests set expires_at = now() - interval '1 minute' where status = 'searching'; wait 35 seconds
$r3 = Api Post "/requests" $d @{ serviceId=$tyre; lat=-29.85; lng=31.02 }
$r3.data.request.id
# ... after the wait the status must be "expired":
# (Api Get "/requests/$($r3.data.request.id)" $d).data.request.status
# 13. No providers online: offersSent is 0 and the request still exists for manual dispatch
(Api Post "/providers/me/online" $p @{ online=$false }).data
Start-Sleep -Seconds 35
$r4 = Api Post "/requests" $d @{ serviceId=$tyre; lat=-29.85; lng=31.02 }
$r4.data.offersSent
# 14. Admin: list, detail with candidates, manual assign, and the provider completes it
$adminEmail = Read-Host "Admin email"
$sec = Read-Host "Admin password" -AsSecureString
$pw = [System.Net.NetworkCredential]::new("", $sec).Password
$login = Invoke-RestMethod -Method Post -Uri "$base/admin/auth/login" -ContentType "application/json" -Body (@{ email=$adminEmail; password=$pw } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.data.token)" }
(Invoke-RestMethod -Uri "$base/admin/requests?status=searching" -Headers $h).data.requests | Format-Table id, status, noProvidersOffered
$rid4 = $r4.data.request.id
(Invoke-RestMethod -Uri "$base/admin/requests/$rid4" -Headers $h).data.candidates | Format-Table providerId, firstName, isOnline, isBusy, distanceKm
$provId = (Api Get "/auth/me" $p).data.user.id
(Invoke-RestMethod -Method Post -Uri "$base/admin/requests/$rid4/assign" -Headers $h -ContentType "application/json" -Body (@{ providerId=$provId } | ConvertTo-Json)).data.request | Select-Object status, assignedByAdmin
(Api Get "/providers/me/jobs" $p).data.active.Count
(Api Post "/requests/$rid4/arrived" $p).data.request.status
(Api Post "/requests/$rid4/complete" $p).data.request.status
```

Neon checks:

```sql
select action, entity, entity_id, actor_type from audit_log where entity = 'requests' order by id desc limit 20;
select status, count(*) from request_offers group by status;
select request_id, method, status, amount_cents from payments order by id desc limit 3;
select user_id, jobs_completed from provider_profiles where jobs_completed > 0;
select indexname from pg_indexes where indexname = 'uq_requests_one_active_job_per_provider';
```

Confirm audit rows for each exercised transition (`request.create`, `request.accept`, `request.arrived`, `request.complete`, `request.cancel`, `request.expire`, `admin.request_assign`).

## Phase 9

1. Open /driver/ signed out, tap 'Just looking?': Home shows 4 service tiles from the API plus a 'Schedule' tile marked Soon; tap Flat tyre: you are sent to the phone screen with the 'Create a profile to request help' banner.
2. Sign in as the Phase 5 driver: tap Flat tyre; Request opens with a map, a draggable pin, the price card showing service price, distance fee and fixed total, and 'About N min away' (provider online) or the 'No providers nearby' text (none online).
3. Drag the pin: the price re-quotes (loading state, then new numbers). Drag it outside South Africa: red message and the Request button disabled; drag it back.
4. Deny location permission and reload: the pin starts at Durban with 'Drag the pin to your exact spot'.
5. With the provider app open in another browser (or private window) and online: tap Request help; the provider sees the offer; the driver sees Searching with a countdown.
6. Cancel while searching: back on Home with a toast; the provider's offer disappears.
7. Request again; provider accepts: the driver moves to Track automatically with the provider card (name, rating or 'New', vehicle, plate, verified badge), an ETA and a Call link (tel:).
8. Share trip: the share sheet or a clipboard toast; confirm no phone number is in the shared text.
9. Provider marks Arrived: Track header changes; provider completes: the driver lands on Rate; choose stars and Submit: thank-you toast and Home (ratings API is Phase 12).
10. Activity: the finished job shows under Past with a status badge and total; tap it for the detail modal.
11. No providers: set the provider offline, request: Searching shows 'No providers nearby right now'; wait for expiry (3 minutes) or use the SQL from Phase 8 test step 12: the Expired card appears with Try again and Home.
12. In admin, manually assign that kind of request to the provider while the driver sits on Searching: the driver moves to Track within about 5 seconds.
13. Request, then have the provider cancel the job from the API: Track shows 'Request cancelled' with the reason and Request again.
14. Start a request, close the tab, reopen /driver/: Home shows 'You have a request in progress' with Resume. Try to create a second request: the 'already in progress' modal with Resume.
15. Account: every row opens its page (Payment, Support, Safety, Saved places, Settings, Profile); add a saved place with 'Add current location' and see it on Home; delete it.
16. Narrow the window to 360px: no horizontal scroll on any screen; tap targets comfortable; the bottom nav never covers a button.
17. In DevTools Network, leave Track open 30 seconds: one request roughly every 5 seconds; navigate away: polling stops.

## Phase 10

### Governance

1. PUT /admin/settings with commission_pct (REST client): ZD-ADM-005. The Settings page shows protected values read-only.
2. Admin > Pricing: shows 15%, fee R150 'Not charged (pilot)', Plus Off, green 'You can change pricing now'.
3. Change pricing: wrong password -> red message (ZD-ADM-006) and the admin stays logged in. Correct password -> the 6-digit code appears in the backend terminal (EMAIL_DRIVER=console) and in the Dev only box.
4. Wrong code -> ZD-ADM-008; five wrong codes -> ZD-ADM-009 and back to step 1. Correct code -> step 3 with the countdown.
5. Set commission to 16 and apply (tick the checkbox): success, locked banner. Starting a second change shows ZD-ADM-007 right after the password and NO email/code is produced.
6. Out-of-range values (commission 40, fee R900) are rejected with a clear message and nothing is saved.
7. Neon: select * from pricing_change_log; select action, meta from audit_log where action = 'admin.pricing_change'. Create a request as the driver: select commission_pct, commission_cents from requests order by id desc limit 3; older rows still show 15.
8. To test another change within the lock, in Neon run: update pricing_change_log set created_at = now() - interval '31 days'; then change commission back to 15.

### Registration fee (Paystack test keys go in backend/.env as PAYSTACK_SECRET_KEY and PAYSTACK_PUBLIC_KEY)

9. Without keys: a pending provider that is approved sees the fee screen only if the fee is enabled; Pay returns the friendly 'not switched on' message (ZD-PAY-003).
10. Enable the fee (needs an unlocked change). Check Neon: select user_id, registration_waived from provider_profiles; every provider approved before the change is waived.
11. Register a NEW provider, approve them in admin: Go Online in the provider app sends them to #/registration-fee (ZD-PROV-006). Pay with a Paystack TEST card from Paystack's documentation; after returning to /provider/ the app verifies and shows 'Registration fee received'. Go Online now works.
12. Reload the return URL (same reference) again: still paid, no second charge (select * from platform_charges).
13. Webhook: only testable once the backend has a public URL (deployment, or a tunnel). Then set the Paystack dashboard webhook to <API>/api/v1/payments/paystack/webhook and replay a charge.success: still one paid row.
14. Admin > Provider detail of an unpaid provider shows Unpaid and a Waive fee button; after waiving, that provider can go online with no payment.

### Provider app

15. Go Online (allow location): headline changes, heartbeat visible in the Network tab every 15 s; the driver's request appears as an offer with area, distance and 'You earn'. No driver phone or surname before accepting.
16. Decline one offer, accept another: you land on the Job page; the driver app moves to Track. A second provider accepting the same request gets 'Someone else took this job'.
17. Navigate opens Google Maps with the pin; Call is a tel: link; 'I have arrived' then 'Complete job' work in order; the driver sees each change within about 5 s.
18. Earnings shows today's total and the week bars; Menu rows open Vehicle, Services offered (change and save), Documents, Registration fee, Payout methods (placeholder).
19. Leave the tab hidden for more than 5 minutes: heartbeats stop and on return you see the offline message; the database shows is_online false. Log out: no further heartbeats in the Network tab.
20. Close the tab while on a job and reopen /provider/: Home shows 'Job in progress' with Resume.

### Plus (optional)

21. Enable Plus in Pricing (needs an unlocked change). The driver Account page shows ZoomDrive Plus; Start free trial shows the trial end date; a new request's audit row has plus true (select action, meta from audit_log where action = 'request.create' order by id desc limit 3) and offers up to max + extra providers.
22. Switch Plus off again: the Account row disappears and the next request meta no longer has plus true.

Neon checks:

```sql
select purpose, status, amount_cents, paystack_ref from platform_charges order by id desc limit 5;
select user_id, trial_ends_at, paid_until from driver_memberships;
select indexname from pg_indexes where indexname = 'uq_requests_one_active_job_per_provider';
```

## Phase 11

### Cash path (works with no Paystack keys)

1. Complete a job end to end. Neon: `select request_id, method, status, amount_cents from payments order by id desc limit 3;` shows pending/unpaid. `select * from provider_ledger order by id desc limit 3;` shows no row for that job.
2. Driver lands on the Pay screen. With no keys: 'Card payments are not switched on yet' and Continue goes to Rate.
3. Provider Job-complete card: 'Waiting for payment' and 'Cash or EFT received'. Record Cash: payments is paid/cash; ledger has ONE commission row of minus commission_cents; Earnings shows 'You owe ZoomDrive R...'.
4. Record again: ZD-PAY-008. In Neon set cash_payments_enabled to false (same value style as the seed) and a new job's record attempt gives ZD-PAY-009 and a friendly message; set it back to true.
5. Admin > Requests: open another completed unpaid job > Mark as paid (Driver paid ZoomDrive, EFT): payments paid/eft and a ledger 'earning' row of +provider_earning_cents.

### Card path (Paystack test keys in backend/.env)

6. Complete a job; Driver > Pay with card, use a Paystack test card from their documentation; after returning to /driver/ the app verifies and shows 'Payment received'. Neon: payments paid/card; one ledger earning row equal to provider_earning_cents.
7. Reload the return URL: still one ledger row (`select count(*) from provider_ledger where request_id = <id>`) = 1.
8. Complete another job and do NOT pay. Request again: ZD-PAY-006 modal; Home shows 'Payment due'; pay it; requesting works again. (With the keys removed, the block does not apply.)
9. Try to record cash on a card-paid job: ZD-PAY-008.
10. Webhook: only testable with a public backend URL (deployment or a tunnel). Set the Paystack dashboard webhook to `<API>/api/v1/payments/paystack/webhook` and replay charge.success: still one paid row, one ledger row.

### Provider money screens and payouts

11. Provider Earnings: balance equals `select provider_user_id, sum(amount_cents) from provider_ledger group by provider_user_id;` today and week bars match the completed jobs.
12. Payout methods: save bank details; the page shows 'Account ending ####'. Neon: `select account_last4, left(account_number_enc, 3) from provider_bank_details;` the encrypted column starts with v1: and never holds the digits. Editing creates a notification row for the provider.
13. Admin > Payouts: balances list, filters and search work. Open the provider: bank card is masked; 'Show account number' reveals it for 30 s; Neon: `select action, meta from audit_log where action = 'admin.view_bank_details';` meta has no number.
14. Just after changing bank details, the amber 'recently changed' banner is shown.
15. Record a payout larger than the balance: ZD-PAY-007. Record a valid payout: balance drops, ledger shows a negative 'payout' row, the provider's Earnings shows it under Payouts. Reusing the reference is rejected on the reference field.
16. Adjustment without a note is rejected; with a note it appears in the ledger.
17. Export CSV opens in Excel; add an adjustment note beginning with = and confirm it is exported as text (leading quote), not a formula.

### Admin request dispatch

18. Admin > Requests: filters, detail with candidates, Assign on a no-provider request, Cancel with a reason.
19. Remove DATA_ENCRYPTION_KEY from backend/.env: the backend refuses to boot and names the variable. Restore it.

Reconciliation queries:

```sql
select p.method, count(*), sum(r.provider_earning_cents) as owed_to_providers, sum(r.commission_cents) as platform_commission from payments p join requests r on r.id = p.request_id where p.status = 'paid' group by p.method;
select entry_type, count(*), sum(amount_cents) from provider_ledger group by entry_type;
select indexname from pg_indexes where indexname in ('uq_provider_ledger_request_entry','uq_payments_paystack_ref','uq_payouts_reference');
```

## Phase 12

Ratings:
1. Complete a job and pay it. Driver lands on Rate: submit 4 stars with a comment. Neon: select * from ratings order by id desc limit 3; one row, rater_role driver. select rating_avg, rating_count from provider_profiles where user_id = <provider>; matches.
2. Change the same rating to 5 stars immediately: still one row, updated_at set, provider average recalculated.
3. In Neon set that rating's created_at to 25 hours ago: submitting again shows the locked state (ZD-RAT-002). Set it back if you want to retest.
4. Driver uses 'Pay later' then rates before paying: works.
5. Rating a job that is not completed is refused (ZD-RAT-001). A third user cannot rate it (ZD-REQ-007).
6. Provider rates the driver from the Job complete card. The provider offer card on the next request shows the driver's average, or 'New' with no ratings. The driver never sees the provider's comment.

Notifications:
7. Run one full job. Driver inbox shows: accepted, arrived, completed. Provider inbox shows: offer received, payment received, new rating. Unread dots and the Account badge appear; tapping a row opens the right screen and marks it read; Mark all read clears the badge.
8. Cancel a request from each side and let one expire: the other party gets 'cancelled' and the driver gets 'expired'.
9. Approve and reject a provider from admin: the provider inbox shows both.
10. Break notifications on purpose (Neon: rename the notifications table, run a job, rename it back): the job still completes and the backend logs a WARN.

Audit and timeline:
11. Admin > Audit log: filter by action prefix 'request.', by entity, by date, and by an Error ref copied from a driver error banner; details modal shows meta with no phone numbers or comments.
12. Admin > Requests > open a completed job: Timeline shows created, offers, accepted, arrived, completed, payment, ledger and rating events in order. Copy timeline pastes plain text.
13. Run the audit-coverage query from the end of this section: it returns no rows.

```sql
SELECT r.id, r.status
FROM requests r
WHERE (r.status = 'completed' AND NOT EXISTS (
         SELECT 1 FROM audit_log a
         WHERE a.entity = 'requests' AND a.entity_id = r.id AND a.action = 'request.complete'
       ))
   OR (r.status = 'cancelled' AND NOT EXISTS (
         SELECT 1 FROM audit_log a
         WHERE a.entity = 'requests' AND a.entity_id = r.id AND a.action = 'request.cancel'
       ))
   OR (r.status = 'accepted' AND NOT EXISTS (
         SELECT 1 FROM audit_log a
         WHERE a.entity = 'requests' AND a.entity_id = r.id
           AND a.action IN ('request.accept', 'admin.request_assign')
       ));

select status, count(*) from users group by status;
select count(*) from notifications where read_at is null;
```

Moderation:
14. Suspend a driver who has no active request: their next API call shows the not-active message and login is refused. Unsuspend: works again.
15. Try to suspend a user with an active request: ZD-ADM-009. Suspend an online provider with no job: they go offline (Neon is_online false).
16. Delete a driver with a completed job: phone becomes deleted-<id>, name 'Deleted User', saved places gone, but the request, payment and ledger rows remain. Their old token is refused.
17. Delete a provider with a non-zero balance: refused (ZD-ADM-010). Record a payout or adjustment to zero, then delete: documents and bank details are gone, ledger and payouts remain.
18. Deleting without typing DELETE is impossible in the UI.

## Phase 13

Environment and security:
1. Start the backend with NODE_ENV=production and FRONTEND_ORIGINS=http://localhost:3000: it refuses to boot and names FRONTEND_ORIGINS. Try FRONTEND_ORIGINS=* and https://example.com/ (trailing slash): both refused.
2. With NODE_ENV=production and OTP_DRIVER=console and no override: refuses and names OTP_DRIVER. With OTP_ALLOW_CONSOLE_IN_PRODUCTION=true it boots and prints the WARN line. With OTP_DRIVER=bulksms and no SMS_API_KEY it refuses naming SMS_API_KEY.
3. CORS: Invoke-WebRequest -Uri <API>/api/v1/health -Headers @{Origin='https://evil.example'} -UseBasicParsing | Select-Object -ExpandProperty Headers: no Access-Control-Allow-Origin header. Repeat with an allowed origin: the header is present and exact.
4. In production mode /api/v1/health shows no list of missing env names.
5. Run git log --all --oneline -- backend/.env: prints nothing. Check Render's dashboard: JWT_SECRET is a real random 32+ character value (Romeo, deployment step).
6. npm audit --omit=dev in backend and frontend: note the counts; fix 'high' or 'critical' findings in a separate commit.

Rate limits and input limits:
7. Request an OTP 4 times for one phone within 10 minutes: the 4th returns ZD-AUTH-003.
8. Fire 70 quick authenticated writes (for example repeated saved-place creates or notification read-all) in one minute: a 429 with ZD-SYS-004 appears; normal use never hits it. The provider heartbeat and request polling are not blocked while online for 10 minutes.
9. Upload 21 photos within an hour: the 21st returns ZD-SYS-004. A 6 MB file returns ZD-UPL-002; a .exe renamed .jpg returns ZD-UPL-001.
10. Submit a 5000-character comment or note: rejected with ZD-VAL-001 naming the field.
11. Create 11 requests in an hour as one driver (cancel each): the 11th returns ZD-SYS-004.

SMS (skip until a provider is chosen):
12. With OTP_DRIVER=bulksms and valid credentials, a real number receives the code; a deliberately wrong secret returns ZD-SMS-001 and no code is shown anywhere, even with OTP_DEV_ECHO=true; that OTP cannot be verified.

Responsive and PWA (browser devtools, device toolbar at 360x640 and 390x844):
13. On phone widths, for each driver and provider screen (welcome, email, otp, profile setup, home, request, searching, track, pay, rate, activity, account, inbox; provider: type, documents, pending, home, job, earnings, inbox, menu, payout methods, registration fee) and each admin page: no horizontal scroll, nothing hidden behind the bottom nav or the notch area, all buttons at least 44px tall, typing in an input does not zoom the page.
14. On tablet and desktop widths the apps fill the screen with a side rail, never a narrow column.
15. Install: on Android Chrome (after deployment over HTTPS) the Install app button appears and installs; on iPhone Safari the Add to Home Screen card appears once; neither shows inside the installed app.
16. Offline: switch devtools to Offline: the offline banner appears; reload shows the offline message, not a blank page; back online the banner disappears.
17. Update toast: change the cache version string in driver/sw.js, reload twice: the 'Update available' toast appears; Reload applies it once.
18. Open the browser console on each app: no CSP violation messages while using the map, photo upload and Paystack redirect (after deployment, because CSP only applies on Vercel).
19. Errors: switch devtools to Offline and tap an action that calls the API: a visible coded banner or offline message appears, never a silent failure.

Full regression (run in this order, record failures with the ZD- code and ref):
20. Phase 5 and 6: sign up as a driver and as a company provider; try the wrong app (ZD-AUTH-004).
21. Phase 7: approve the provider; reject another.
22. Phase 8 to 10: request, accept, arrive, complete, cancel from each side; go online and offline.
23. Phase 11: one card job and one cash job; record a payout; reconcile with the queries in the Phase 11 section.
24. Phase 12: rate, inbox on both apps, audit page, request timeline, suspend and unsuspend a throwaway user.

select action, count(*) from audit_log where created_at > now() - interval '1 day' group by action order by 2 desc;

## Phase 13B

Email login:
1. Sign up as a driver with a new email: the code arrives (check spam), the screen shows 6 boxes and 'Code sent to <masked email>'. After verifying, profile setup asks for a mobile phone number; saving without a phone shows a field error.
2. Log out and log in again with the same email and code; confirm /auth/me shows the same user id.
3. Use the wrong 6-digit code: the box shakes or an error appears, the code is not consumed (a correct code still works).
4. Wait for the code to expire (5 minutes): verify returns an error, resend sends a fresh code.
5. Use the same email in the provider app: ZD-AUTH-004 with the role shown; the driver app shows the mismatch screen with a link to the provider app.
6. OTP rate limit: request 4 codes for one email in 10 minutes; the 4th returns ZD-AUTH-003. Request 11 codes for different emails from one IP in one hour: the 11th returns ZD-SYS-004.
7. Profile setup: phone field accepts 082 123 4567, 0821234567, +27821234567 (all saved as +27821234567); a 5-digit number is rejected with ZD-VAL-001 field phone.
8. Account page shows the signed-in email (read-only) and the phone number (editable via profile edit).
9. Provider app: repeat steps 1–4 with a new email; after verifying, profile setup includes a required phone and all the provider-specific fields.

Layout:
10. Open the driver and provider apps at 360×640 (Chrome devtools device toolbar): no horizontal scroll, all tap targets at least 44 px tall, no content hidden behind the bottom nav or notch.
11. Open at 900 px or wider: the side rail appears on the left, the bottom nav is gone, content fills the screen.
12. Open the admin panel at 360 px: no horizontal scroll; tables scroll horizontally within their container; all buttons are reachable.
13. Open each admin page at 1200 px: content fills available width up to the max content width; filters wrap naturally.

Audit trail:
14. In admin, open Audit log. Filter by Type = 'API calls': only rows with an action starting 'api.' appear. Filter by Type = 'Changes': only event rows appear. Filter by Type = 'Denied or failed': only denied/error rows appear. Reset returns all.
15. For an api. row, the Result column shows a coloured badge: green for ok, amber for denied or rejected, red for error.
16. Export CSV with a date range: a .csv file downloads containing only rows in that range; opening in a spreadsheet shows no formula injection (cells starting with = are quoted).
17. In the Users page, search by email address: the matching user appears. Click Activity for a user row: the Audit log page opens filtered to that user's events.
18. Email column appears in the Users table; partial emails are masked (first character + *** + @domain).

Revenue:
19. Open the Revenue page, Summary tab, This month preset: KPI cards show Net revenue, Gross bookings, Commission earned, Registration and Plus fees, Gateway fees, Payouts made, Owed to providers, Owed by providers; all values are formatted as ZAR (R 0.00 for zero). The daily table shows one row per day including zero-activity days; the Trend column shows CSS bars proportional to net revenue.
20. Switch to Last month and Last 7 days presets: dates update and data reloads; selecting Custom and entering a from/to date then clicking Apply range reloads with those dates.
21. Transactions tab: filter by type 'Ride payment': only ride_payment rows show. Search 'test': rows with matching reference, request id or name appear. The amount column is green for positive, red for negative. A request link navigates to the Requests page for that request. Export CSV downloads a CSV for the current date range.
22. Reconcile tab: click 'Run check'; if all records agree a green 'All records agree' message appears with the checked timestamp. If issues exist they are listed with their code, a request link and the detail; UNPAID_OLD issues appear in amber as informational, other issues in red.
23. Revenue backend SQL checks:

```sql
-- Net revenue = sum of commissions + reg fees + plus fees - gateway fees + adjustments
SELECT
  SUM(CASE WHEN p.settled_at IS NOT NULL THEN p.commission_cents ELSE 0 END) AS commission,
  SUM(CASE WHEN pc.purpose = 'provider_registration' AND pc.status = 'paid' THEN pc.amount_cents - COALESCE(pc.gateway_fee_cents, 0) ELSE 0 END) AS reg_fees_net,
  SUM(CASE WHEN pc.purpose = 'driver_plus' AND pc.status = 'paid' THEN pc.amount_cents - COALESCE(pc.gateway_fee_cents, 0) ELSE 0 END) AS plus_fees_net
FROM payments p
LEFT JOIN platform_charges pc ON true
WHERE p.settled_at > now() - interval '30 days'
   OR pc.paid_at > now() - interval '30 days';

-- Reconcile: every settled payment should have a provider ledger earning entry
SELECT p.id, p.status, p.settled_at
FROM payments p
WHERE p.settled_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM provider_ledger pl
    WHERE pl.request_id = p.request_id AND pl.entry_type = 'earning'
  );

-- Audit log: every settlement should have an audit row
SELECT p.id, p.request_id
FROM payments p
WHERE p.settled_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM audit_log a
    WHERE a.entity = 'payments' AND a.entity_id::text = p.id::text
  );
```
