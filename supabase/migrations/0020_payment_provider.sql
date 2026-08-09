-- ============================================================================
-- 0020_payment_provider.sql — WHICH PROCESSOR TAKES THE MONEY (Phase 17E)
--
-- No new table. site_settings (0018) already exists for exactly this: a
-- site-wide choice one operator flips, changeable without a deploy.
--
-- DEFAULT IS 'paypal'. That is the operator's decision and it is recorded here
-- rather than in application code, so there is one answer to "what is this
-- deployment set to" and it is a row anyone can read.
--
-- ============================================================================
-- READ THIS BEFORE ASSUMING THE SETTING DOES ANYTHING
-- ============================================================================
--
-- Setting this row to 'paypal' does NOT route payments through PayPal. At the
-- time this migration was written there is no PayPal integration in the
-- codebase — no order creation, no capture, no webhook verification — and the
-- checkout path does not read this value.
--
-- The row exists so the choice is stored and the admin screen can show it.
-- Until checkout branches on it, this is a stated intention rather than a
-- routing rule, and /admin/payments says exactly that on screen.
--
-- The value is constrained by the application (lib/site/payment-provider.ts
-- maps anything unexpected onto the default) rather than by a CHECK here,
-- because site_settings is a generic key/value table and a provider-specific
-- constraint on its shared `value` column would break every other setting.
-- ============================================================================

insert into public.site_settings (key, value)
values ('payment_provider', 'paypal')
on conflict (key) do nothing;
