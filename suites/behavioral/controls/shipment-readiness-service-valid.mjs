export class ShipmentUnauthorizedError extends Error {
  constructor() {
    super("actor cannot mark this order ready");
    this.name = "ShipmentUnauthorizedError";
    this.code = "shipment-unauthorized";
  }
}

export class ShipmentInvalidTransitionError extends Error {
  constructor() {
    super("order cannot transition to ready-to-ship");
    this.name = "ShipmentInvalidTransitionError";
    this.code = "shipment-invalid-transition";
  }
}

export function createShipmentReadinessService(repository) {
  return {
    async markReady({ orderId, actorId, requestId, nowMs }) {
      return repository.transactOrder(orderId, async (tx) => {
        const order = await tx.getOrder();
        if (!(await tx.canMarkReady(actorId, order))) {
          throw new ShipmentUnauthorizedError();
        }
        const repeated = await tx.findByRequestId(requestId);
        if (repeated !== undefined) return repeated.result;
        if (order.status !== "paid") throw new ShipmentInvalidTransitionError();
        const saved = await tx.saveOrder({
          ...order,
          status: "ready-to-ship",
          version: order.version + 1,
          updatedAt: nowMs,
        });
        const outbox = await tx.enqueueOutbox({
          dedupeKey: `shipment:${orderId}`,
          type: "shipment-requested",
          payload: { orderId, version: saved.version },
          createdAt: nowMs,
        });
        const result = { order: saved, outbox };
        await tx.recordOperation({ requestId, result });
        return result;
      });
    },
  };
}
