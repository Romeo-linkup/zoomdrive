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

