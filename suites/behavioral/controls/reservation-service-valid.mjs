export class ReservationConflictError extends Error {
  constructor() {
    super("item already has an active reservation");
    this.name = "ReservationConflictError";
    this.code = "reservation-conflict";
  }
}

export class ReservationUnauthorizedError extends Error {
  constructor() {
    super("actor cannot reserve this item");
    this.name = "ReservationUnauthorizedError";
    this.code = "reservation-unauthorized";
  }
}

export function createReservationService(repository) {
  return {
    async reserve({ itemId, requestId, actorId, nowMs, ttlMs }) {
      return repository.transactItem(itemId, async (tx) => {
        if (!(await tx.canReserve(actorId, itemId))) {
          throw new ReservationUnauthorizedError();
        }
        const repeated = await tx.findByRequestId(requestId);
        if (repeated !== undefined) return repeated;
        const active = await tx.findActive(itemId, nowMs);
        if (active !== undefined) throw new ReservationConflictError();
        return tx.insert({
          itemId,
          requestId,
          actorId,
          createdAt: nowMs,
          expiresAt: nowMs + ttlMs,
        });
      });
    },
  };
}
