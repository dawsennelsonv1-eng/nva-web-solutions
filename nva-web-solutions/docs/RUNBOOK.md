# NVA DIGITAL SOLUTIONS — PRODUCTION RUNBOOK

## 1. FIRST-TIME SETUP

### Supabase

1. Go to supabase.com, sign in, create new project.
2. Enter project name: `nva-production`
3. Set database password to: TODO: choose 32-char random password
4. Set region to: `us-east-1`
5. Wait for project initialization (5–10 minutes).
6. Copy Project URL and Anon Key to `.env.local`.
7. Go to SQL Editor, run each migration in order (copy from `migrations/` folder in repo):
   - `001_init_schema.sql` — run, expect no errors.
   - `002_auth_policies.sql` — run, expect no errors.
   - `003_contractor_tables.sql` — run, expect no errors.
   - `004_quotes_and_leads.sql` — run, expect no errors.
   - `005_payments_and_invoices.sql` — run, expect no errors.
   - `006_audit_log.sql` — run, expect no errors.
8. Verify all migrations: go to SQL Editor, run `SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1;` — expect result `006`.
9. Go to Storage, create new bucket: `contractor-photos` — set to private.
10. Go to Storage, create new bucket: `demo-assets` — set to public.
11. Go to Authentication > Providers, enable Email/Password.
12. Go to Authentication > URL Configuration:
    - Redirect URLs: add `https://nva-web-solutions.vercel.app/auth/callback`
    - Redirect URLs: add `https://localhost:3000/auth/callback`
    - Save.
13. Go to Settings > API, copy API Key (anon): store as `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
14. Go to Settings > API, copy API Key (service_role): store as `SUPABASE_SERVICE_ROLE_KEY` (secret).
15. Go to Settings > Database, copy Connection String (URI): store as `DATABASE_URL` (secret).

### Stripe

1. Go to dashboard.stripe.com, sign in to partner account (TODO: which account email).
2. Go to Products, create new product: `NVA Foundation`
   - Description: `$500 setup fee + $250/month for 25 AI analyses`
   - No image.
   - Create.
3. Go to Pricing on that product, create price:
   - Billing model: Standard pricing
   - Amount: $500
   - Billing period: One-time
   - Create price.
   - Copy price ID: store as `STRIPE_FOUNDATION_SETUP_PRICE_ID`.
4. On same product, create second price:
   - Billing model: Standard pricing
   - Amount: $250
   - Billing period: Monthly
   - Recurring: Yes
   - Create price.
   - Copy price ID: store as `STRIPE_FOUNDATION_RECURRING_PRICE_ID`.
5. Create new product: `NVA Operator`
   - Description: `$2,500 setup fee + $500/month, uncapped analyses`
   - No image.
   - Create.
6. Go to Pricing on that product, create price:
   - Billing model: Standard pricing
   - Amount: $2,500
   - Billing period: One-time
   - Create price.
   - Copy price ID: store as `STRIPE_OPERATOR_SETUP_PRICE_ID`.
7. On same product, create second price:
   - Billing model: Standard pricing
   - Amount: $500
   - Billing period: Monthly
   - Recurring: Yes
   - Create price.
   - Copy price ID: store as `STRIPE_OPERATOR_RECURRING_PRICE_ID`.
8. Go to Webhook endpoints, create endpoint:
   - Endpoint URL: `https://nva-web-solutions.vercel.app/api/webhooks/stripe`
   - Events to send: select `charge.failed`, `charge.succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`.
   - Create endpoint.
   - Copy signing secret: store as `STRIPE_WEBHOOK_SECRET` (secret).
9. Go to Settings > API Keys:
   - Copy Publishable key (test mode): store as `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST`.
   - Copy Secret key (test mode): store as `STRIPE_SECRET_KEY_TEST` (secret).
10. Toggle to Live mode (top right).
11. Copy Publishable key (live mode): store as `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (secret).
12. Copy Secret key (live mode): store as `STRIPE_SECRET_KEY` (secret).

### Vercel

1. Go to vercel.com, sign in, import repository `nva-web-solutions`.
2. Framework preset: `Next.js`
3. Root directory: leave blank.
4. Build and Output Settings: auto-detected, confirm.
5. Environment Variables, add each (mark secret ones):
   - `NEXT_PUBLIC_SUPABASE_URL` = value from Supabase Settings > API > Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = value from Supabase Settings > API (anon)
   - `SUPABASE_SERVICE_ROLE_KEY` = secret, value from Supabase Settings > API (service_role)
   - `DATABASE_URL` = secret, value from Supabase Settings > Database (URI)
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST` = Stripe test publishable key
   - `STRIPE_SECRET_KEY_TEST` = secret, Stripe test secret key
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = secret, Stripe live publishable key
   - `STRIPE_SECRET_KEY` = secret, Stripe live secret key
   - `STRIPE_WEBHOOK_SECRET` = secret, webhook signing secret
   - `STRIPE_FOUNDATION_SETUP_PRICE_ID` = Stripe Foundation setup price ID
   - `STRIPE_FOUNDATION_RECURRING_PRICE_ID` = Stripe Foundation recurring price ID
   - `STRIPE_OPERATOR_SETUP_PRICE_ID` = Stripe Operator setup price ID
   - `STRIPE_OPERATOR_RECURRING_PRICE_ID` = Stripe Operator recurring price ID
   - `ANTHROPIC_API_KEY` = secret, Anthropic API key for vision analysis
   - `NEXT_PUBLIC_STRIPE_MODE` = `test` (for now)
   - `NEXT_PUBLIC_PAYMENT_PROVIDER` = `stripe`
6. Deploy.
7. Wait for build to complete (3–5 minutes).
8. Verify deployment: go to Deployments, check for green checkmark on latest.
9. Verify sites respond:
   - `https://nva-web-solutions.vercel.app/` — expect NVA homepage
   - `https://nva-web-solutions.vercel.app/admin` — expect login screen

### Termux — First Clone and Deploy

1. Open Termux.
2. Run: `cd ~/projects && git clone https://github.com/TODO:YOUR_GITHUB/nva-web-solutions.git`
   - Expect: local folder `nva-web-solutions` with all files.
3. Run: `cd ~/projects/nva-web-solutions && git log --oneline | head -1`
   - Expect: latest commit hash.
4. Run: `git branch -a | grep main`
   - Expect: `origin/main` (no local changes yet).
5. Verify `.env.local` exists (you created it in step 2.3 of Supabase setup).
6. Verify no `node_modules` folder exists (do NOT build locally).
7. Go to Vercel dashboard, confirm green deployment on `main`.
8. You are ready to deploy changes.

---

## 2. DEPLOYING A CHANGE

### Branch → Preview → Merge

1. Open Termux in `~/projects/nva-web-solutions`.
2. Run: `git checkout main && git pull origin main`
   - Expect: "Already up to date" or new commits pulled.
3. Create feature branch: `git checkout -b feature/YOUR_FEATURE_NAME`
   - Expect: local branch created, you are on it.
4. Make changes in editor (e.g., `lib/payments.ts`, `app/admin/page.tsx`, etc).
5. Run: `git add -A && git commit -m "describe your change clearly"`
   - Expect: "X files changed" message.
6. Run: `git push -u origin feature/YOUR_FEATURE_NAME`
   - Expect: branch pushed to GitHub, output shows remote tracking branch.
7. Go to Vercel dashboard, wait 30 seconds, check Deployments.
   - Expect: preview deployment on `feature/YOUR_FEATURE_NAME` (link in GitHub PR).
8. Test the preview on mobile: copy preview URL, test in real browser.
9. If preview is good: go to GitHub PR, click "Merge pull request".
10. Vercel automatically deploys to production (`main`).
11. Wait for green checkmark on `main` deployment (2–3 minutes).
12. Run: `git checkout main && git pull origin main` to sync locally.

### Reading a Failed Vercel Build Log on Mobile

1. Go to Vercel dashboard on phone.
2. Click Deployments.
3. Find the failed deployment (red X).
4. Tap the deployment, scroll to Logs.
5. Read from bottom upward. The error is usually the last red line.
6. Common errors (see section 2.3 below).
7. If unclear, take a screenshot and ask for help with the exact error.

### Five Most Common Build Failures

**Failure 1: TypeScript error during build**
- Symptom: Log shows `error TS7006:` or `error TS2345:`.
- Cause: Type mismatch in code (e.g., passing wrong type to function).
- Fix: Open the file shown in error (e.g., `app/payment/checkout.tsx:42`). Compare the type expected vs. provided. Add type annotation or fix argument. Commit and push again.

**Failure 2: Environment variable missing**
- Symptom: Log shows `undefined is not defined` or `Cannot read property X of undefined`.
- Cause: An environment variable is not set in Vercel Settings.
- Fix: Go to Vercel project Settings > Environment Variables. Check if the missing var is listed. If not, add it. Redeploy from Deployments page (three dots, "Redeploy").

**Failure 3: Supabase migration syntax error**
- Symptom: Log shows `PG::SyntaxError` or `ERROR: syntax error at` during migration.
- Cause: A `.sql` file in `migrations/` has invalid PostgreSQL syntax.
- Fix: Go to Supabase > SQL Editor, paste the migration and run it manually. You will see the exact error. Fix the SQL file, commit, and push.

**Failure 4: Module not found**
- Symptom: Log shows `Module not found: Can't resolve 'X'`.
- Cause: A file was deleted or renamed but code still imports it.
- Fix: Search the codebase for the import (grep or Ctrl+Shift+F). Update the import path or restore the file. Commit and push.

**Failure 5: Next.js App Router mismatch**
- Symptom: Log shows `Expected FS-based routing manifest but received serverless function manifest` or similar.
- Cause: A file in `app/` directory has wrong structure (e.g., multiple default exports, missing `page.tsx`).
- Fix: Check that every route has exactly one `page.tsx` or `layout.tsx`. No duplicate exports. Commit and push.

---

## 3. SMOKE TEST

Run this after every production deployment and before starting new ads.

### Part A: Public Hub

1. Go to `https://nva-web-solutions.vercel.app/` on mobile.
   - Expected: NVA homepage loads, logo visible, "Get Started" button visible.
2. Tap "Get Started".
   - Expected: route `/` → page shows hero section, no errors in console.
3. Scroll to Pricing section.
   - Expected: two tiers visible (Foundation $500+$250/mo, Operator $2500+$500/mo).
4. Scroll to FAQ.
   - Expected: at least 3 questions visible, expand one.
   - Expected: answer text visible, no layout breaks.

### Part B: Demo Page

1. Go to `https://nva-web-solutions.vercel.app/demo`.
   - Expected: demo page loads, example project visible, quote tool UI visible.
2. On demo tool, tap "Take Photo" (or use uploaded demo image).
   - Expected: image preview shows, no errors.
3. On demo tool, tap "Analyze".
   - Expected: spinner appears, AI processes image, quote appears (2–10 seconds).
4. Verify quote shows: square footage, material cost, labor cost, total.
   - Expected: all fields populated with numbers.

### Part C: Mobile Camera Path (Real Mobile Data, Not WiFi)

1. Disconnect from WiFi, use cellular data.
2. Go to `https://nva-web-solutions.vercel.app/demo`.
3. Tap camera icon to take new photo.
   - Expected: camera app opens, you take a photo, returns to browser.
4. Tap "Analyze".
   - Expected: image uploads without stalling, quote returns (verify cellular icon in status bar is active during upload).
5. If upload is slow, note the time. Expected: under 15 seconds for typical 2MB photo.

### Part D: Prototype Link (Client-Facing Quote)

1. Go to `/admin`, log in (TODO: use contractor test account).
   - Expected: admin dashboard loads, contractor name visible.
2. Find a prototype in the list (or create one for testing).
3. Copy the prototype link (e.g., `https://nva-web-solutions.vercel.app/s/abc123def456`).
4. Open link in new private/incognito tab.
   - Expected: quote page loads, NO login required, homeowner sees the company branding and quote tool.
5. Tap "Take Photo", take a photo, tap "Analyze".
   - Expected: quote appears.
6. Verify homeowner does NOT see any contractor admin controls.

### Part E: Quote Link (Shareable Quote)

1. From `/admin`, create or find a quote.
2. Copy the quote link (e.g., `https://nva-web-solutions.vercel.app/q/quote-id-123`).
3. Open link in new private tab.
   - Expected: quote displays, no login required.
4. Scroll down to CTA.
   - Expected: "Request More Information" or "Schedule Inspection" button visible.
5. Tap button.
   - Expected: lead capture form appears (email, phone, name).

### Part F: Degraded Mode (Cap Reached)

1. Go to `/admin`, navigate to contractor settings.
2. Manually set analysis cap to 0 (or run SQL: `UPDATE contractors SET analyses_remaining = 0 WHERE id = TODO:contractor_id;`).
3. Go to prototype link.
   - Expected: page loads, "Instant Quote" button is DISABLED or hidden.
   - Expected: "Call us: [contractor phone number]" is DISPLAYED in place of quote tool.
4. Verify homeowner DOES NOT see "Your limit reached" or billing language.
   - Expected: only contractor number visible.
5. Restore cap: `UPDATE contractors SET analyses_remaining = TODO:original_count WHERE id = TODO:contractor_id;`

### Part G: Test-Mode Checkout

1. Go to `/admin`, navigate to Billing or Upgrade section.
2. Tap "Upgrade to Operator" (or equivalent tier upgrade button).
   - Expected: redirects to Stripe Checkout.
3. Verify URL shows `?session_id=` and test key is active.
   - Expected: Stripe test badge visible in top-left of form.
4. Fill checkout:
   - Email: `test@nva-demo.com`
   - Card: `4242 4242 4242 4242`
   - Expiry: `12/25`
   - CVC: `123`
   - ZIP: `12345`
   - Tap "Pay".
5. Expected: success page or redirect to `/admin`.
6. Go back to `/admin`, check Billing section.
   - Expected: subscription shows active, new tier reflected.
7. Check Supabase > contractor record:
   - Expected: `plan` field = `operator`, `next_billing_date` is set to 30 days from now.
8. Check Supabase > audit_log:
   - Expected: new entry with `event_type = 'subscription_upgraded'`, `plan_changed_to = 'operator'`.

### Part H: Webhook Verification

1. From previous checkout, go to Stripe dashboard > test mode > Webhooks.
2. Find the endpoint created in section 1.
3. Tap it, scroll to recent events.
   - Expected: `charge.succeeded` and `customer.subscription.updated` events show "Sent" status (green checkmark).
4. If any show red X (failed), expand to see error.
   - Expected: all recent events are green.

---

## 4. ONBOARDING A NEW CONTRACTOR — COLD-CALL SEQUENCE

### Phase 1: Qualify

1. Contractor calls or emails.
2. Ask: What is your primary service? (epoxy floors, painting, etc.)
3. Ask: What is your annual revenue from quoting? (to gauge tier).
4. Ask: Do you have photos of recent projects?
   - Expected answer: Yes.
5. Ask: Are you willing to try a 30-day free trial before committing?
   - Expected answer: Yes or "Maybe, but show me it works."

### Phase 2: Stage the Environment

1. Open Termux or SSH to server (or use Vercel UI if needed).
2. Create contractor record in Supabase (via SQL or admin UI):
   ```
   INSERT INTO contractors (
     business_name,
     email,
     phone,
     plan,
     analyses_remaining,
     created_at
   ) VALUES (
     'TODO:Contractor Name',
     'TODO:contractor@email.com',
     'TODO:+1-555-123-4567',
     'foundation',
     25,
     NOW()
   );
   ```
3. Note the returned `contractor_id`.
4. Create a prototype environment (demo workspace):
   ```
   INSERT INTO prototypes (
     contractor_id,
     slug,
     name,
     created_at
   ) VALUES (
     TODO:contractor_id,
     'TODO:unique-slug-name',
     'TODO:Contractor Name Demo',
     NOW()
   );
   ```
5. Verify prototype created: go to Supabase > prototypes table, search for slug.
   - Expected: one row with contractor_id and slug.

### Phase 3: Send the Link

1. Compose email (or message) to contractor with:
   - Subject: "Your NVA Demo Link"
   - Body:
     ```
     Hi [Contractor Name],

     Here's your demo link to test NVA:
     https://nva-web-solutions.vercel.app/s/[slug-from-previous-step]

     You have 25 free analyses this month. Try taking a photo of one of your recent projects and let's see the quote.

     I'll call you in 10 minutes to walk through it.

     — NVA Team
     ```
2. Send.

### Phase 4: Watch Admin During Call

1. Open `/admin` in a separate tab (logged in as you).
2. During the call:
   - Watch the contractor use the demo link.
   - Refresh `/admin` every 30 seconds.
   - You should see `analyses_used` incrementing in the contractor record.
   - If analysis fails, check audit_log for errors.
3. Guide contractor through uploading a photo.
4. Expected: quote appears within 10 seconds.
5. Ask contractor: "Does the price match your experience?" or "Is the footage reasonable?"
   - Expected answer: Yes or minor adjustment request.

### Phase 5: Send Payment Link

1. After demo approval:
2. Say: "Let's get you set up on the plan. I'll send you a payment link."
3. In `/admin`, find or generate the upgrade payment link for contractor's chosen tier.
4. Send link via email/SMS.
5. Contractor opens link, enters card, completes Stripe checkout.
   - Expected: Stripe sends webhook to your endpoint.

### Phase 6: Confirm Webhook Landed

1. In terminal, check webhook log (or Stripe dashboard):
   ```
   # If using local logging:
   grep "charge.succeeded" /var/log/nva-webhooks.log | tail -5
   ```
   Or:
   - Go to Stripe dashboard > Webhooks > recent events.
   - Verify `charge.succeeded` and `customer.subscription.updated` both show green.
2. Expected: webhook timestamp within 1 minute of checkout.
3. If webhook is missing: check `/api/webhooks/stripe` logs in Vercel.
   - Go to Vercel > Deployments > Logs > Filter for `webhook`.
   - Expected: incoming POST request with status 200.

### Phase 7: Check First 48 Hours

1. Day 1 (same day as signup):
   - Check admin: contractor plan field = `foundation` or `operator`.
   - Check admin: `payment_status` = `active`.
   - Check Supabase audit_log: entry for `subscription_created`.
2. Day 2:
   - Message contractor: "How are the quotes looking? Any questions?"
   - Contractor should have used at least 1–2 analyses.
   - If 0 analyses used, follow up: "Do you have any projects to quote?"
3. Watch for payment failure (see section 5.1 for handling).

---

## 5. INCIDENT PLAYBOOK

### Incident 5.1: Payment Failed

**Symptom:**
- Stripe webhook shows `charge.failed` event.
- Contractor message: "My payment was declined."
- `/admin` shows `payment_status` = `failed`.

**Steps:**

1. Go to Stripe dashboard > Customers, search for contractor email.
2. Find the failed charge (red X next to amount).
3. Click charge, read the failure reason (e.g., "Insufficient funds", "Card expired", "Fraud blocked").
4. Determine if contractor can retry:
   - If "Insufficient funds" or "Try again": message contractor with retry link.
   - If "Card expired": ask for new card.
   - If "Fraud blocked": Stripe holds it; contact Stripe support (or use manual provider).
5. Contractor updates card and retries checkout.
6. Verify webhook lands: check Stripe dashboard, expect `charge.succeeded` within 1 minute.
7. Verify in `/admin`: `payment_status` should flip to `active`.
8. If still failing after 3 attempts, move to **Incident 5.6 (Manual Provider)**.

---

### Incident 5.2: Stripe Webhook Never Arrived

**Symptom:**
- Stripe checkout showed "Success" or "Processing".
- `/admin` still shows `payment_status` = `pending` or `failed`.
- Stripe dashboard shows `charge.succeeded` (green), but no subscription triggered.
- 1+ hour has passed since checkout.

**Steps:**

1. Go to Stripe dashboard > Webhooks > select your endpoint.
2. Find the webhook timestamp (search for contractor email or timestamp near checkout time).
3. If webhook shows in list but status is "Failed" (red X):
   - Click it, view error.
   - Common causes: Timeout, 500 error from your server, wrong path.
   - Action: Go to Vercel > Logs, search for `/api/webhooks/stripe` around that timestamp.
   - If error is "500": check for recent deploy issues. Rollback if needed (see section 7).
   - If timeout: check Supabase connectivity. Supabase may have been down.
4. If webhook is not in list at all (no entry, no attempt):
   - Go to Stripe API docs > Webhooks > Test endpoint.
   - Send a test `charge.succeeded` event to your endpoint.
   - Expected: receives 200 OK in Vercel logs.
   - If fails: you have a URL or signing-secret mismatch. Go to Vercel > Environment Variables, confirm `STRIPE_WEBHOOK_SECRET` is correct. Redeploy.
5. If webhook was sent and succeeded but data didn't sync:
   - Go to Supabase > run query:
     ```
     SELECT * FROM contractor_subscriptions 
     WHERE stripe_charge_id = 'TODO:charge_id_from_stripe_dashboard' 
     LIMIT 1;
     ```
   - If row exists: contractor is set up correctly. Problem is UI caching. Refresh `/admin` hard (Ctrl+Shift+R).
   - If row does NOT exist: check Supabase audit_log for errors around the webhook timestamp.
6. Manual fix: insert subscription record:
   ```
   INSERT INTO contractor_subscriptions (
     contractor_id,
     stripe_customer_id,
     stripe_subscription_id,
     status,
     current_period_end
   ) VALUES (
     TODO:contractor_id,
     'cus_XXXXXX',
     'sub_XXXXXX',
     'active',
     NOW() + INTERVAL '1 month'
   );
   ```

---

### Incident 5.3: Customer Disputes a Charge

**Symptom:**
- Contractor or their cardholder filed a chargeback/dispute with their bank.
- Stripe shows `charge.dispute.created` or `charge.dispute.closed` event.
- Payment was 5–30 days ago.

**Steps:**

1. Go to Stripe dashboard, search for the disputed charge.
2. View the dispute details (reason code, evidence window).
3. Check if contractor ever used the service:
   - Go to `/admin`, search for contractor, check `analyses_used` count.
   - If count > 0: service was delivered.
4. Go to Stripe dispute, upload evidence:
   - Screenshot of `/admin` showing contractor used the service.
   - Screenshot of audit_log showing analyses were performed.
   - Message or email from contractor (if any) confirming satisfaction.
5. Submit evidence before deadline (usually 7 days).
6. Stripe reviews. If you win: charge restored to account.
7. If you lose: charge reversed, funds returned to customer's bank.
   - Action: Suspend contractor's account until they pay via alternative method (manual provider or cash).
   - Message: "Your charge was disputed and reversed. To continue, please pay by [alternative method]."

---

### Incident 5.4: Customer Wants Refund Under 30-Day Guarantee

**Symptom:**
- Contractor (within 30 days of signup) says: "This didn't work for me. I want my setup fee back."

**Steps:**

1. Check signup date:
   ```
   SELECT created_at FROM contractors WHERE id = TODO:contractor_id;
   ```
   - If > 30 days ago: refund is NOT guaranteed. Offer as goodwill or decline.
   - If ≤ 30 days ago: proceed.
2. Check if contractor used service:
   - If `analyses_used` = 0: refund is justified.
   - If `analyses_used` > 0: they received value. Offer partial refund or decline.
3. In Stripe, find the setup charge (usually a one-time charge at start).
4. Issue refund:
   - Stripe dashboard > click charge > "Refund" button.
   - Amount: full setup fee (e.g., $500 for Foundation, $2,500 for Operator).
   - Reason: "Per customer request, within 30-day guarantee."
   - Confirm.
5. Stripe immediately reverses charge. Contractor's bank receives credit within 3–5 business days.
6. Cancel subscription:
   - Go to contractor record in Supabase, set `plan` = `free` (or delete subscription record).
   - Message contractor: "Refund issued. Your subscription is canceled."

---

### Incident 5.5: Stripe Account Restricted or Frozen

**Symptom:**
- Stripe dashboard shows warning: "Account review in progress" or "Account restricted."
- New charges fail with `account_invalid` error.
- Email from Stripe Support asking for additional documentation.

**Steps:**

1. Check Stripe email for the reason (usually: high chargeback rate, suspected fraud, unusual activity).
2. Gather requested documentation (business license, ID, bank statement, etc.).
3. Submit to Stripe Support within their deadline.
4. Stripe reviews (1–3 business days).
5. **While awaiting review: switch to manual provider** to keep business running.
6. Go to Vercel > Environment Variables.
7. Change `NEXT_PUBLIC_PAYMENT_PROVIDER` from `stripe` to `manual`.
8. Redeploy.
9. In `/admin`, when contractors choose to pay:
   - Instead of Stripe checkout, they see: "Transfer $XXX to [bank account details]. Reply with proof of transfer."
   - You manually verify transfer in your bank.
   - You run:
      ```
      UPDATE contractor_subscriptions 
      SET status = 'active', current_period_end = NOW() + INTERVAL '1 month' 
      WHERE contractor_id = TODO:contractor_id;
      ```
   - Contractor's account activates.
10. Once Stripe re-enables your account:
    - Go to Vercel > Environment Variables.
    - Change `NEXT_PUBLIC_PAYMENT_PROVIDER` back to `stripe`.
    - Redeploy.

---

### Incident 5.6: AI Provider Down

**Symptom:**
- Contractor taps "Analyze" on a photo.
- 30+ seconds pass, then error: "Could not analyze image."
- Check: is Anthropic API down?

**Steps:**

1. Go to status.anthropic.com (or your AI provider's status page).
2. Check for active incidents.
   - If incident active: nothing to do. API is down. Message contractors: "Temporarily unavailable. Please retry in 15 minutes."
3. If no active incident:
   - Go to Vercel > Logs.
   - Filter for `/api/analyze` or `/api/vision`.
   - Check recent errors (last 5 minutes).
   - Expected error: `401 Unauthorized`, `429 Rate Limit`, `503 Service Unavailable`, or timeout.
4. If `401 Unauthorized`:
   - Go to Vercel > Environment Variables.
   - Confirm `ANTHROPIC_API_KEY` is set and is not empty.
   - Redeploy.
5. If `429 Rate Limit`:
   - See section 5.7.
6. If `503` or timeout:
   - Wait 30 seconds.
   - Retry manually from `/demo`.
   - If still fails: API is down. Wait for status page to clear. Monitor Anthropic status page.

---

### Incident 5.7: Anthropic Balance Exhausted

**Symptom:**
- Analyses that were working yesterday now fail.
- Error in Vercel logs: `insufficient_quota` or similar.

**Steps:**

1. Go to Anthropic console (console.anthropic.com).
2. Check Billing > Usage.
3. If balance is $0.00 or negative:
   - Add credit card or increase credit limit.
   - Add funds: click "Add to balance".
   - Wait 1–2 minutes for balance to update.
4. After balance is positive, retry analysis.
   - Expected: success.
5. If balance shows plenty but errors persist:
   - Check your API key in Vercel:
     ```
     echo $ANTHROPIC_API_KEY
     ```
   - Verify key starts with `sk-ant-`.
   - If key is invalid, regenerate it in Anthropic console and update Vercel.

---

### Incident 5.8: Contractor Calls — Quoting Tool Is Broken

**Diagnostic Order:**

1. **Ask contractor: "What error do you see?"**
   - Error message? Blank screen? Slow? Photo won't upload?
   - This determines the next step.

2. **Check contractor's prototype is live:**
   - Go to `/admin`, find contractor.
   - Tap their prototype link.
   - Does page load?
   - If not: check Vercel deployment status. (See section 2.3.)

3. **Check contractor's analysis cap:**
   - In `/admin`, view contractor record.
   - Is `analyses_remaining > 0`?
   - If = 0: they are in degraded mode. This is expected. Say: "You've used your 25 analyses for this month. Upgrade to Operator for unlimited."
   - If < 0: set to 0. SQL: `UPDATE contractors SET analyses_remaining = 0 WHERE id = TODO:id;`

4. **Check contractor's subscription status:**
   - In `/admin`, view contractor record.
   - Is `payment_status` = `active`?
   - If `failed`: they have a payment problem. See section 5.1.
   - If `pending`: payment was never confirmed. See section 5.2.

5. **Check Anthropic balance:**
   - See section 5.7.

6. **Check Vercel logs:**
   - Go to Vercel > Deployments > Logs.
   - Filter for contractor's prototype slug or their email.
   - Do you see errors?
   - If yes: fix the code, redeploy, retry.
   - If no: problem is likely on contractor's phone (app cache, old browser, WiFi issue).
   - Ask contractor: "Try clearing your browser cache (Settings > History > Clear). Then reload the page."

7. **If still broken after all above:**
   - Ask contractor: "What browser are you using?" (Safari, Chrome, etc.)
   - Try the same prototype on your phone in that browser.
   - If works for you but not them: likely a device-specific issue (old OS, memory, cache corruption).
   - Solution: "Try on a different device or browser."
   - If broken for you too: see section 2.3 to find and fix the bug.

---

### Incident 5.9: Supabase Down

**Symptom:**
- All features fail: login, quote tool, admin panel.
- Error: "Failed to fetch" or "Connection timeout."

**Steps:**

1. Go to status.supabase.com.
2. Check for active incident.
   - If incident is listed and marked "Investigating": Supabase is down. Nothing to do. Notify contractors: "We're experiencing a temporary outage. Back online in 15 minutes."
3. If no incident listed:
   - Go to Vercel > Logs.
   - Search for Supabase connection errors.
   - Expected: `connect ECONNREFUSED` or `ENOTFOUND`.
   - Go to Supabase dashboard.
   - Check if your project is still active (green status light).
   - If red or offline: project may have been suspended. Check Supabase > Settings > Database.
   - If suspended: contact Supabase support or check if auto-pause is enabled.
4. If Supabase is confirmed up:
   - Check Vercel > Environment Variables.
   - Confirm `NEXT_PUBLIC_SUPABASE_URL` and `DATABASE_URL` are set.
   - If missing: add them and redeploy.
   - If present: redeploy to refresh connection.
5. After redeploy, wait 2 minutes.
6. Retry from `/demo` or `/admin`.
   - Expected: connection restored.

---

## 6. MANUAL OPERATIONS — PHONE-BASED

### Operation 6.1: Stage a Prototype by Direct SQL Insert

Use this when you need to create a demo or test contractor without using the admin UI.

1. Open Termux.
2. Connect to Supabase:
   ```
   psql "postgresql://TODO:username:TODO:password@TODO:host:TODO:port/postgres"
   ```
   (Find credentials in Supabase > Settings > Database.)
3. Insert contractor:
   ```
   INSERT INTO contractors (
     business_name,
     email,
     phone,
     plan,
     analyses_remaining,
     created_at
   ) VALUES (
     'Test Contractor Name',
     'test@example.com',
     '+1-555-000-1234',
     'foundation',
     25,
     NOW()
   ) RETURNING id;
   ```
   - Copy the returned `id`.
4. Insert prototype:
   ```
   INSERT INTO prototypes (
     contractor_id,
     slug,
     name,
     created_at
   ) VALUES (
     TODO:id_from_above,
     'test-slug-' || EXTRACT(EPOCH FROM NOW())::bigint,
     'Test Prototype',
     NOW()
   ) RETURNING slug;
   ```
   - Copy the returned `slug`.
5. Test link: `https://nva-web-solutions.vercel.app/s/[slug]`
   - Expected: prototype loads, quote tool works.
6. Exit: `\q`

---

### Operation 6.2: Mark a Customer Paid Using Manual Provider

Use this when a contractor transfers payment by bank transfer (manual provider mode) and you need to activate them.

1. Verify transfer landed in your bank account.
2. Open Termux, connect to Supabase (as in 6.1).
3. Find the contractor:
   ```
   SELECT id, email, plan FROM contractors WHERE email = 'TODO:contractor_email';
   ```
4. Create or update subscription record:
   ```
   INSERT INTO contractor_subscriptions (
     contractor_id,
     plan,
     status,
     current_period_end,
     payment_method,
     created_at
   ) VALUES (
     TODO:contractor_id,
     'foundation',  -- or 'operator'
     'active',
     NOW() + INTERVAL '1 month',
     'manual',
     NOW()
   )
   ON CONFLICT (contractor_id) 
   DO UPDATE SET status = 'active', current_period_end = NOW() + INTERVAL '1 month';
   ```
5. Verify:
   ```
   SELECT * FROM contractor_subscriptions WHERE contractor_id = TODO:contractor_id;
   ```
   - Expected: status = `active`, current_period_end is 30 days in future.
6. Exit: `\q`
7. Message contractor: "Payment received. Your account is now active."

---

### Operation 6.3: Extend a Grace Period

Use this when a contractor's payment failed but they are on day 3 of dunning, and you want to give them more time.

1. Open Termux, connect to Supabase (as in 6.1).
2. Find the contractor:
   ```
   SELECT id, email, grace_period_end FROM contractors WHERE email = 'TODO:contractor_email';
   ```
3. Extend grace by 7 days:
   ```
   UPDATE contractors 
   SET grace_period_end = grace_period_end + INTERVAL '7 days'
   WHERE id = TODO:contractor_id;
   ```
4. Verify:
   ```
   SELECT grace_period_end FROM contractors WHERE id = TODO:contractor_id;
   ```
   - Expected: date is 7 days later than before.
5. Exit: `\q`
6. Message contractor: "We've extended your deadline. Your payment is due by [new date]. Reply with your updated card details and we'll retry."

---

### Operation 6.4: Revoke a Prototype Link

Use this when a contractor's demo has expired or they are past their 30-day trial.

1. Open Termux, connect to Supabase (as in 6.1).
2. Find the prototype:
   ```
   SELECT id, slug FROM prototypes WHERE slug = 'TODO:slug';
   ```
3. Mark as inactive:
   ```
   UPDATE prototypes SET is_active = false WHERE slug = 'TODO:slug';
   ```
4. Verify:
   ```
   SELECT is_active FROM prototypes WHERE slug = 'TODO:slug';
   ```
   - Expected: `false`.
5. Exit: `\q`
6. Test the link: `https://nva-web-solutions.vercel.app/s/[slug]`
   - Expected: page shows "This link is no longer active" or 404.
7. Message contractor: "Your demo link has expired. To continue, please upgrade to a plan."

---

## 7. ROLLBACK

How to revert to the last production-ready state in under 5 minutes from a phone.

### Step 1: Identify the Last Good Deployment

1. Go to GitHub.com on phone.
2. Open nva-web-solutions repo.
3. Go to Tags (find via repo menu or search bar).
4. Look for the latest tag (e.g., `v1.0.5`).
   - Expected: tag marked with 🏷️, date shown.

### Step 2: Checkout the Tag Locally

1. Open Termux.
2. Run: `cd ~/projects/nva-web-solutions && git fetch --tags`
   - Expected: tags synced from GitHub.
3. Run: `git checkout TODO:latest_tag_name`
   - Expected: "You are in 'detached HEAD' state at [tag]".
4. Verify code is old: `git log --oneline | head -3`
   - Expected: commit messages from days/weeks ago, not recent ones.

### Step 3: Force Deploy

1. Create a temporary branch from the tag:
   ```
   git checkout -b rollback/emergency
   ```
   - Expected: local branch created.
2. Push to GitHub:
   ```
   git push -u origin rollback/emergency
   ```
   - Expected: branch pushed.
3. Go to GitHub, open a Pull Request from `rollback/emergency` to `main`.
4. Go to Vercel dashboard > Deployments.
5. Wait 30 seconds, you will see preview deployment on the PR.
   - Expected: green checkmark = good.
6. Go back to GitHub PR, click "Merge pull request".
   - Expected: merged, Vercel auto-deploys to `main`.
7. Wait 2–3 minutes for production deployment to finish.
   - Expected: green checkmark on `main` in Vercel.

### Step 4: Verify Rollback Worked

1. Go to `https://nva-web-solutions.vercel.app/`.
   - Expected: site loads, old version is live.
2. Test one critical path (e.g., demo analysis, admin login).
   - Expected: works without error.

### Step 5: Clean Up

1. In Termux: `git checkout main && git pull origin main`
2. Delete rollback branch (GitHub > Branches > Delete, or local: `git branch -d rollback/emergency`).

**Result:** Production is back to last good state. Total time: 4–5 minutes.

---

## 8. QUICK REFERENCE TABLES

### Stripe Product IDs (Test Mode)

| Product | Setup Price ID | Recurring Price ID |
|---------|----------------|--------------------|
| Foundation | `TODO:prod_foundation_setup_test` | `TODO:prod_foundation_recurring_test` |
| Operator | `TODO:prod_operator_setup_test` | `TODO:prod_operator_recurring_test` |

### Stripe Product IDs (Live Mode)

| Product | Setup Price ID | Recurring Price ID |
|---------|----------------|--------------------|
| Foundation | `TODO:prod_foundation_setup_live` | `TODO:prod_foundation_recurring_live` |
| Operator | `TODO:prod_operator_setup_live` | `TODO:prod_operator_recurring_live` |

### Supabase Table Quick Lookup

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `contractors` | Main contractor record | `id`, `business_name`, `email`, `plan`, `analyses_remaining`, `payment_status`, `grace_period_end` |
| `prototypes` | Demo links for contractors | `id`, `contractor_id`, `slug`, `is_active` |
| `quotes` | Generated quotes (homeowner-facing) | `id`, `prototype_id`, `image_url`, `estimated_price`, `created_at` |
| `leads` | Homeowner inquiries | `id`, `quote_id`, `homeowner_name`, `homeowner_email`, `homeowner_phone`, `captured_at` |
| `contractor_subscriptions` | Billing state | `id`, `contractor_id`, `status`, `current_period_end`, `stripe_subscription_id` |
| `audit_log` | Event log for debugging | `id`, `event_type`, `contractor_id`, `metadata`, `created_at` |

### Common SQL Queries (Copy/Paste Ready)

**Check contractor status:**
```
SELECT id, business_name, email, plan, payment_status, analyses_remaining 
FROM contractors 
WHERE email = 'TODO:email@example.com';
```

**Reset analyses count:**
```
UPDATE contractors SET analyses_remaining = 25 WHERE id = TODO:id;
```

**List all active subscriptions:**
```
SELECT c.business_name, cs.status, cs.current_period_end 
FROM contractors c 
JOIN contractor_subscriptions cs ON c.id = cs.contractor_id 
WHERE cs.status = 'active';
```

**Find recent failed payments:**
```
SELECT c.business_name, al.metadata, al.created_at 
FROM audit_log al 
JOIN contractors c ON al.contractor_id = c.id 
WHERE al.event_type = 'payment_failed' 
AND al.created_at > NOW() - INTERVAL '24 hours' 
ORDER BY al.created_at DESC;
```

---

## 9. GLOSSARY

| Term | Definition |
|------|-----------|
| **Prototype** | A personalized demo link (slug) for a contractor; homeowner-facing quote tool |
| **Quote** | A generated estimate for a specific project (photo + analysis) |
| **Lead** | A homeowner inquiry from a quote (captured via form) |
| **Degraded Mode** | Limited functionality when analysis cap reached or payment failed (CTA becomes "Call us") |
| **Dunning** | Automated reminders/retries when payment fails (days 1, 3, 5, 7, then grace period) |
| **Grace Period** | Extra time before account is fully suspended (default 10 days after final dunning attempt) |
| **Webhook** | Stripe's HTTP callback to your `/api/webhooks/stripe` endpoint |
| **Anon Key** | Supabase public key (safe to expose in browser; limited by RLS) |
| **Service Role Key** | Supabase admin key (secret; must never expose; bypasses RLS) |
| **RLS** | Row-Level Security in Postgres (controls who sees what data) |

---

=== PHASE 12B COMPLETE ===
TODO ITEMS I MUST FILL IN: 18

- Supabase project creation password
- GitHub org/repo for clone command
- Stripe partner account email
- Stripe test mode Publishable Key
- Stripe test mode Secret Key
- Stripe live mode Publishable Key
- Stripe live mode Secret Key
- Stripe webhook signing secret
- All four Stripe price IDs (Foundation/Operator × Setup/Recurring)
- Anthropic API key
- Contractor ID (for testing)
- Contractor email for testing
- Contractor phone number for testing
- Contractor name for testing
- Contractor SQL insert test values
- Supabase connection credentials (username, password, host, port)
- Stripe charge ID (for dispute example)
- Tag name for last good deployment

NEXT: SHIP. Merge to main, run the smoke test, start advertising.
=== END ===
