import mongoose from "mongoose";
import { AppError } from "../../utils/errors/app.error";
import {
  buildParticipantsKey,
  FriendRequest,
  IFriendRequest,
} from "./friendRequest.model";
import { Friend } from "./friend.model";
import { BlockService } from "../block/block.service";

export class FriendService {
  private blockService = new BlockService();

  async areFriends(userId: string, otherUserId: string): Promise<boolean> {
    const relation = await Friend.exists({
      $or: [
        { user: userId, friend: otherUserId },
        { user: otherUserId, friend: userId },
      ],
    });

    return Boolean(relation);
  }

  async sendRequest(fromUserId: string, toUserId: string) {
    if (fromUserId === toUserId) {
      throw new AppError("Cannot send request to yourself", 400);
    }

    const isBlocked = await this.blockService.isBlockedEitherDirection(
      fromUserId,
      toUserId
    );
    if (isBlocked) {
      throw new AppError("Cannot send request while one user is blocked", 403);
    }

    const alreadyFriends = await this.areFriends(fromUserId, toUserId);
    if (alreadyFriends) {
      throw new AppError("Users are already friends", 409);
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

  async listPendingRequests(userId: string, limit?: number) {
    const safeLimit = Math.min(Math.max(limit ?? 50, 1), 100);

    const pending = await FriendRequest.find({
      status: "pending",
      $or: [{ fromUser: userId }, { toUser: userId }],
    })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .populate("fromUser", "username")
      .populate("toUser", "username")
      .lean();

    const mapped = pending.map((request) => {
      const fromUserId = request.fromUser?._id?.toString() ?? String(request.fromUser);
      const toUserId = request.toUser?._id?.toString() ?? String(request.toUser);
      const fromUsername =
        request.fromUser &&
        typeof request.fromUser === "object" &&
        "username" in request.fromUser
          ? String(request.fromUser.username)
          : "Unknown";
      const toUsername =
        request.toUser &&
        typeof request.toUser === "object" &&
        "username" in request.toUser
          ? String(request.toUser.username)
          : "Unknown";

      return {
        requestId: request._id.toString(),
        fromUserId,
        toUserId,
        fromUsername,
        toUsername,
        createdAt: new Date(request.createdAt).getTime(),
        expiresAt: request.expiresAt ? new Date(request.expiresAt).getTime() : null,
      };
    });

    return {
      incoming: mapped.filter((request) => request.toUserId === userId),
      outgoing: mapped.filter((request) => request.fromUserId === userId),
    };
  }

  async cancelRequest(requestId: string, userId: string) {
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      throw new AppError("Invalid request id", 400);
    }

    const cancelled = await FriendRequest.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(requestId),
        fromUser: userId,
        status: "pending",
      },
      {
        $set: {
          status: "cancelled",
        },
        $unset: {
          expiresAt: 1,
        },
      },
      { new: true }
    ).lean();

    if (!cancelled) {
      throw new AppError("Pending request not found", 404);
    }

    return {
      requestId: cancelled._id.toString(),
      fromUserId: String(cancelled.fromUser),
      toUserId: String(cancelled.toUser),
    };
  }

  async rejectRequest(requestId: string, userId: string) {
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      throw new AppError("Invalid request id", 400);
    }

    const rejected = await FriendRequest.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(requestId),
        toUser: userId,
        status: "pending",
      },
      {
        $set: {
          status: "rejected",
        },
        $unset: {
          expiresAt: 1,
        },
      },
      { new: true }
    ).lean();

    if (!rejected) {
      throw new AppError("Pending request not found", 404);
    }

    return {
      requestId: rejected._id.toString(),
      fromUserId: String(rejected.fromUser),
      toUserId: String(rejected.toUser),
    };
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

    const isBlocked = await this.blockService.isBlockedEitherDirection(
      request.fromUser.toString(),
      request.toUser.toString()
    );
    if (isBlocked) {
      throw new AppError("Cannot accept request while one user is blocked", 403);
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
