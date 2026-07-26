export class TransferUnauthorizedError extends Error {
  constructor() {
    super("actor cannot transfer this asset");
    this.name = "TransferUnauthorizedError";
    this.code = "transfer-unauthorized";
  }
}

export class TransferStaleVersionError extends Error {
  constructor() {
    super("asset version is stale");
    this.name = "TransferStaleVersionError";
    this.code = "transfer-stale-version";
  }
}

export class TransferCustodyMismatchError extends Error {
  constructor() {
    super("asset is not held by the supplied custodian");
    this.name = "TransferCustodyMismatchError";
    this.code = "transfer-custody-mismatch";
  }
}

export function createCustodyTransferService(repository) {
  return {
    async transfer(input) {
      return repository.transactAsset(input.assetId, async (tx) => {
        const asset = await tx.getAsset();
        const saved = await tx.saveAsset({
          ...asset,
          custodianId: input.toCustodianId,
          version: asset.version + 1,
          updatedAt: input.nowMs,
        });
        await tx.appendTransfer({
          requestId: input.requestId,
          actorId: input.actorId,
          fromCustodianId: input.fromCustodianId,
          toCustodianId: input.toCustodianId,
          asset: saved,
          createdAt: input.nowMs,
        });
        return saved;
      });
    },
  };
}
