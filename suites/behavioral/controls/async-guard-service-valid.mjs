export class CommunityUnauthorizedError extends Error {
  constructor() {
    super("actor is not authorized for the current community state");
    this.name = "CommunityUnauthorizedError";
    this.code = "community-unauthorized";
  }
}

export function createCommunityAccessService(repository, authorizer) {
  return {
    async viewCommunity({ actorId }) {
      const allowed = await authorizer.canAccess(actorId);
      return repository.transactState(async (tx) => {
        const member = await tx.getMember(actorId);
        if (!allowed || member?.active !== true) {
          throw new CommunityUnauthorizedError();
        }
        return tx.communityView();
      });
    },

    async updateListing({ actorId, listingId, title }) {
      const allowed = await authorizer.canAccess(actorId);
      return repository.transactState(async (tx) => {
        const member = await tx.getMember(actorId);
        const listing = await tx.getListing(listingId);
        if (!allowed || member?.active !== true || listing?.ownerId !== actorId) {
          throw new CommunityUnauthorizedError();
        }
        return tx.saveListing({ ...listing, title });
      });
    },
  };
}
