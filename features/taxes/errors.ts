export class TaxNotFoundError extends Error {
  constructor(public readonly taxId: string) {
    super(`Tax profile ${taxId} not found`);
    this.name = "TaxNotFoundError";
  }
}
