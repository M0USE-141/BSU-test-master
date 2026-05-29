"""Asset upload helpers.

Phase 4+ moved file storage out of the filesystem and behind
`api.services.storage_service`. The only thing left here is the short-
ID length constant — the canonical content-hash filename scheme the
upload route uses to dedupe identical assets.
"""

# Short content-hash IDs let the editor reference uploads by a 7-char
# string instead of full filenames. Same file uploaded twice gets the
# same ID (dedup). 16^7 ≈ 268M slots — collision risk negligible for
# per-test asset sets.
SHORT_ID_LEN = 7
