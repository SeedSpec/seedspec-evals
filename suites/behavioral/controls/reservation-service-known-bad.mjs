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
      return repository.transactItem(itemId, (tx) => tx.insert({
        itemId,
        requestId,
        actorId,
        createdAt: nowMs,
        expiresAt: nowMs + ttlMs,
      }));
    },
  };
}
