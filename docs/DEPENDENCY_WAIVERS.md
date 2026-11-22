# Dependency waivers

## Next.js nested PostCSS advisories

- Package: `postcss` nested under `next@15.5.29`
- Severity: high
- Advisories: `GHSA-qx2v-qp2m-jg93`, `GHSA-6g55-p6wh-862q`, `GHSA-fxqj-rqcc-2cmp`, `GHSA-r28c-9q8g-f849`
- Current fix: `next@16.4.6`, a breaking major framework upgrade
- Waiver scope: production `npm audit --omit=dev --audit-level=high` gate
- Status: approved
- Approved: 2026-11-23
- Expires: 2026-12-31
- Required action: review and complete a Next.js 16 compatibility upgrade before the waiver expires

The CI audit script only waives these exact advisories on the nested Next.js PostCSS dependency. Any new high or critical production advisory fails the gate.
