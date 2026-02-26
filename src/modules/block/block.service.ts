import mongoose from "mongoose";
import { AppError } from "../../utils/errors/app.error";
import { User } from "../user/user.model";
import { UserBlock } from "./userBlock.model";
import { Friend } from "../friend/friend.model";
import { buildParticipantsKey, FriendRequest } from "../friend/friendRequest.model";

export class BlockService {
  async isBlockedEitherDirection(userA: string, userB: string): Promise<boolean> {
    const exists = await UserBlock.exists({
      $or: [
        { blocker: userA, blocked: userB },
        { blocker: userB, blocked: userA },
      ],
    });

    return Boolean(exists);
  }

  async blockUser(blockerId: string, blockedId: string) {
    if (!mongoose.Types.ObjectId.isValid(blockerId)) {
      throw new AppError("Invalid blocker id", 400);
    }
    if (!mongoose.Types.ObjectId.isValid(blockedId)) {
      throw new AppError("Invalid blocked user id", 400);
    }
    if (blockerId === blockedId) {
      throw new AppError("Cannot block yourself", 400);
    }

    const blockedUserExists = await User.exists({ _id: blockedId });
    if (!blockedUserExists) {
      throw new AppError("User not found", 404);
    }

    const block = await UserBlock.findOneAndUpdate(
      { blocker: blockerId, blocked: blockedId },
      {
        $setOnInsert: {
          blocker: blockerId,
          blocked: blockedId,
        },
      },
      {
        upsert: true,
        new: true,
      }
    ).lean();

    const participantsKey = buildParticipantsKey(blockerId, blockedId);
    await Promise.all([
      Friend.deleteMany({
        $or: [
          { user: blockerId, friend: blockedId },
          { user: blockedId, friend: blockerId },
        ],
      }),
      FriendRequest.updateMany(
        {
          participantsKey,
          status: "pending",
        },
        {
          $set: { status: "cancelled" },
          $unset: { expiresAt: 1 },
        }
      ),
    ]);

    return {
      blockerId,
      blockedId,
      createdAt: block?.createdAt ? new Date(block.createdAt).getTime() : Date.now(),
    };
  }

  async unblockUser(blockerId: string, blockedId: string) {
    if (!mongoose.Types.ObjectId.isValid(blockerId)) {
      throw new AppError("Invalid blocker id", 400);
    }
    if (!mongoose.Types.ObjectId.isValid(blockedId)) {
      throw new AppError("Invalid blocked user id", 400);
    }
    if (blockerId === blockedId) {
      throw new AppError("Cannot unblock yourself", 400);
    }

    const result = await UserBlock.deleteOne({
      blocker: blockerId,
      blocked: blockedId,
    });

    if (result.deletedCount === 0) {
      throw new AppError("Block relation not found", 404);
    }

    return {
      blockerId,
      blockedId,
    };
  }

  async listBlockedUsers(blockerId: string, limit?: number) {
    const safeLimit = Math.min(Math.max(limit ?? 50, 1), 100);

    const blocks = await UserBlock.find({ blocker: blockerId })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .populate("blocked", "_id username")
      .lean();

    const users = blocks.map((block) => {
      const blockedUserId =
        block.blocked && typeof block.blocked === "object" && "_id" in block.blocked
          ? block.blocked._id.toString()
          : String(block.blocked);
      const blockedUsername =
        block.blocked && typeof block.blocked === "object" && "username" in block.blocked
          ? String(block.blocked.username)
          : "Unknown";

      return {
        userId: blockedUserId,
        username: blockedUsername,
        blockedAt: new Date(block.createdAt).getTime(),
      };
    });

    return { users };
  }
}
