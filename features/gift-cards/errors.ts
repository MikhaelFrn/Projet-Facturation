export class GiftCardNotFoundError extends Error {
  constructor(public readonly code: string) {
    super(`Gift card ${code} not found`);
    this.name = "GiftCardNotFoundError";
  }
}

export class GiftCardCodeAlreadyExistsError extends Error {
  constructor(public readonly code: string) {
    super(`Gift card code ${code} already exists`);
    this.name = "GiftCardCodeAlreadyExistsError";
  }
}

// Covers both an explicit 'expired'/'depleted' status and the lazy
// expiresAt-in-the-past check (see redeemGiftCard) — the status column can
// be stale since nothing proactively flips it.
export class GiftCardNotActiveError extends Error {
  constructor(
    public readonly code: string,
    public readonly reason: "expired" | "depleted"
  ) {
    super(`Gift card ${code} cannot be redeemed (${reason})`);
    this.name = "GiftCardNotActiveError";
  }
}

export class GiftCardInsufficientBalanceError extends Error {
  constructor(
    public readonly code: string,
    public readonly requestedCents: number,
    public readonly remainingBalanceCents: number
  ) {
    super(
      `Gift card ${code} has a balance of ${remainingBalanceCents} but ${requestedCents} was requested`
    );
    this.name = "GiftCardInsufficientBalanceError";
  }
}
