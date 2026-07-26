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
    async transfer({
      assetId,
      fromCustodianId,
      toCustodianId,
      actorId,
      requestId,
      expectedVersion,
      nowMs,
    }) {
      return repository.transactAsset(assetId, async (tx) => {
        const asset = await tx.getAsset();
        if (!(await tx.canTransfer(actorId, asset, toCustodianId))) {
          throw new TransferUnauthorizedError();
        }
        const repeated = await tx.findByRequestId(requestId);
        if (repeated !== undefined) return repeated.asset;
        if (asset.version !== expectedVersion) throw new TransferStaleVersionError();
        if (asset.custodianId !== fromCustodianId) {
          throw new TransferCustodyMismatchError();
        }
        const saved = await tx.saveAsset({
          ...asset,
          custodianId: toCustodianId,
          version: asset.version + 1,
          updatedAt: nowMs,
        });
        await tx.appendTransfer({
          requestId,
          actorId,
          fromCustodianId,
          toCustodianId,
          asset: saved,
          createdAt: nowMs,
        });
        return saved;
      });
    },
  };
}
