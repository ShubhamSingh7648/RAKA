import mongoose from "mongoose";
import { AppError } from "../../utils/errors/app.error";
import {
  buildParticipantsKey,
  FriendRequest,
  IFriendRequest,
} from "./friendRequest.model";
import { Friend } from "./friend.model";

export class FriendService {
  async sendRequest(fromUserId: string, toUserId: string) {
    if (fromUserId === toUserId) {
      throw new AppError("Cannot send request to yourself", 400);
    }

    const participantsKey = buildParticipantsKey(fromUserId, toUserId);

    const existingPending = await FriendRequest.findOne({
      participantsKey,
      status: "pending",
    });

    if (existingPending) {
      throw new AppError("Friend request already pending", 409);
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    try {
      const request = await FriendRequest.create({
        fromUser: fromUserId,
        toUser: toUserId,
        participantsKey,
        expiresAt,
      });

      return request;
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new AppError("Friend request already pending", 409);
      }
      throw err;
    }
  }

  async acceptRequest(requestId: string, userId: string) {
    const session = await mongoose.startSession();

    try {
      let acceptedRequest: IFriendRequest | null = null;

      await session.withTransaction(async () => {
        const request = await this.acceptRequestCore(requestId, userId, session);
        acceptedRequest = request;
      });

      if (!acceptedRequest) {
        throw new AppError("Request not found", 404);
      }

      return acceptedRequest;
    } catch (err: any) {
      // Local standalone MongoDB often doesn't support transactions.
      if (this.isTransactionUnsupported(err)) {
        return this.acceptRequestCore(requestId, userId);
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }

  private async acceptRequestCore(
    requestId: string,
    userId: string,
    session?: mongoose.ClientSession
  ) {
    const requestQuery = FriendRequest.findById(requestId);
    if (session) requestQuery.session(session);
    const request = await requestQuery;

    if (!request) {
      throw new AppError("Request not found", 404);
    }

    if (request.toUser.toString() !== userId) {
      throw new AppError("Not authorized to accept this request", 403);
    }

    if (request.status !== "pending") {
      throw new AppError("Request already handled", 409);
    }

    request.status = "accepted";
    request.expiresAt = undefined;
    if (session) {
      await request.save({ session });
    } else {
      await request.save();
    }

    const fromUser = request.fromUser;
    const toUser = request.toUser;

    const ops = [
      {
        updateOne: {
          filter: { user: fromUser, friend: toUser },
          update: { $setOnInsert: { user: fromUser, friend: toUser } },
          upsert: true,
        },
      },
      {
        updateOne: {
          filter: { user: toUser, friend: fromUser },
          update: { $setOnInsert: { user: toUser, friend: fromUser } },
          upsert: true,
        },
      },
    ];

    if (session) {
      await Friend.bulkWrite(ops, { session });
    } else {
      await Friend.bulkWrite(ops);
    }

    return request;
  }

  private isTransactionUnsupported(err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    return (
      msg.includes("Transaction numbers are only allowed") ||
      msg.includes("replica set member or mongos")
    );
  }
}
