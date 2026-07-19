-- eliteOS Digital Estimate — reusable staff-recoverable customer links (v1)
-- Additive / idempotent. Apply manually.
--
-- WHY THIS MIGRATION IS REQUIRED:
-- Access tokens are validated by SHA-256 hash only (correct for public security).
-- Hashes are one-way, so Studio cannot rebuild customerUrl after refresh without
-- storing a server-side recoverable form of the raw token.
-- token_wrapped holds AES-256-GCM ciphertext (iv||tag||ciphertext, base64url),
-- unwrapped only by Brain with DIGITAL_ESTIMATE_LINK_WRAP_KEY for authorized staff.
-- Public routes never read or return token_wrapped.

alter table public.quote_publication_access_tokens
  add column if not exists token_wrapped text;

comment on column public.quote_publication_access_tokens.token_wrapped is
  'AES-GCM wrapped raw access token for authorized Studio recovery of stable customerUrl. Never exposed on public APIs. Null for legacy one-shot links until Replace Link.';
