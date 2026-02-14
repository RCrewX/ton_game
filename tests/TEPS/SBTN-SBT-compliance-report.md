# SBTN SBT Standard Compliance Report

**Date:** 2026-02-14  
**Tests:** `tests/base/SBTN-SBT-compat.spec.ts`

## Summary

The SBTN contracts **pass all SBT standard (TEP-85) compatibility tests**.

## Compliance Matrix

| Requirement | Status | Notes |
|-------------|--------|-------|
| get_nft_data() | Pass | Same tuple as NFT; owner/authority null when destroyed |
| get_authority_address() | Pass | Returns collection when active; addr_none (null) when destroyed |
| get_revoked_time() | Pass | 0 if not revoked |
| prove_ownership | Pass | Owner-only; sends ownership_proof with item_id, owner |
| request_owner | Pass | Anyone can request; sends owner_info; owner=addr_none when destroyed |
| destroy | Pass | Owner-only; owner→addr_none; Excesses sent with balance - MIN_TONS_FOR_STORAGE |
| revoke | Pass | Authority (collection) only; sets revoked_at; rejects second revoke |
| transfer rejected | Pass | AskToChangeOwnership → ERROR_SBTN_TRANSFER_FORBIDDEN (967) |

## Additional Tests

- request_owner after destroy: sends owner_info with owner=addr_none
- get_nft_data after destroy: ownerAddress null, authority null, init true
