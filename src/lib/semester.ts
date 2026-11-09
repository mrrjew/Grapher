import "server-only";

/** Approved Phase 2 placeholders. Confirm every value before any live release. */
const settings = {
  plan: "semester-2026-test",
  amountMinor: 5000,
  currency: "GHS",
  expiresAt: "2026-12-31T23:59:59.000Z",
  testMode: true,
};
export const semester = Object.freeze({
  ...settings,
  priceLabel: `${settings.currency} ${settings.amountMinor / 100}`,
});
