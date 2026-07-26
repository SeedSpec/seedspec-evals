export class CommunityUnauthorizedError extends Error {
  constructor() {
    super("actor is not authorized for the captured community state");
    this.name = "CommunityUnauthorizedError";
    this.code = "community-unauthorized";
  }
}

export function createCommunityAccessService(repository, authorizer) {
  const listingLocks = new Map();

  return {
    async viewCommunity({ actorId }) {
      const member = repository.getMember(actorId);
      const allowed = await authorizer.canAccess(actorId);
      if (!allowed || member?.active !== true) {
        throw new CommunityUnauthorizedError();
      }
      return repository.communityView();
    },

    async updateListing({ actorId, listingId, title }) {
      const snapshot = repository.readState();
      const member = snapshot.members[actorId];
      const listing = snapshot.listings[listingId];
      const allowed = await authorizer.canAccess(actorId);
      if (!allowed || member?.active !== true || listing?.ownerId !== actorId) {
        throw new CommunityUnauthorizedError();
      }

      const previous = listingLocks.get(listingId) ?? Promise.resolve();
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const current = previous.then(() => gate);
      listingLocks.set(listingId, current);
      await previous;
      try {
        snapshot.listings[listingId] = { ...listing, title };
        await repository.replaceState(snapshot);
        return { ...snapshot.listings[listingId] };
      } finally {
        release();
        if (listingLocks.get(listingId) === current) listingLocks.delete(listingId);
      }
    },
  };
}
