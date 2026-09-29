export class PackageNotFoundError extends Error {
  constructor(public readonly packageId: string) {
    super(`Package ${packageId} not found`);
    this.name = "PackageNotFoundError";
  }
}

// Covers an explicit 'expired'/'completed' status and the lazy
// expiresAt-in-the-past check (status can be stale, same reasoning as
// GiftCardNotActiveError).
export class PackageNotActiveError extends Error {
  constructor(
    public readonly packageId: string,
    public readonly reason: "expired" | "completed"
  ) {
    super(`Package ${packageId} cannot be redeemed (${reason})`);
    this.name = "PackageNotActiveError";
  }
}

export class PackageCustomerMismatchError extends Error {
  constructor(
    public readonly packageId: string,
    public readonly invoiceId: string
  ) {
    super(`Package ${packageId} does not belong to invoice ${invoiceId}'s customer`);
    this.name = "PackageCustomerMismatchError";
  }
}

export class PackageItemNotFoundError extends Error {
  constructor(
    public readonly packageId: string,
    public readonly catalogItemId: string
  ) {
    super(`Package ${packageId} does not include catalog item ${catalogItemId}`);
    this.name = "PackageItemNotFoundError";
  }
}

export class PackageInsufficientQuantityError extends Error {
  constructor(
    public readonly packageId: string,
    public readonly catalogItemId: string,
    public readonly requestedQuantity: number,
    public readonly remainingQuantity: number
  ) {
    super(
      `Package ${packageId} has ${remainingQuantity} of catalog item ${catalogItemId} remaining but ${requestedQuantity} was requested`
    );
    this.name = "PackageInsufficientQuantityError";
  }
}
