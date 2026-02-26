import { Router } from "express";
import authRoutes from "../../modules/auth/auth.routes";
import { authenticate, AuthRequest } from "../../middleware/auth.middleware";
import { User } from "../../modules/user/user.model";
import { FriendService } from "../../modules/friend/friend.service";


const router = Router();
const friendService = new FriendService();
router.use("/auth", authRoutes);

router.get("/me", authenticate, async (req: AuthRequest, res) => {

  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = await User
    .findById(req.user.userId)
    .select("-passwordHash");

  res.json({
    success: true,
    data: user
  });
});

router.get("/friends", authenticate, async (req: AuthRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const limit =
    typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
  const listed = await friendService.listFriends(req.user.userId, limit);

  return res.json({
    success: true,
    data: listed,
  });
});

router.patch("/me", authenticate, async (req: AuthRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { username, bio, displayPicture } = req.body as {
    username?: string;
    bio?: string;
    displayPicture?: string;
  };
  const update: Record<string, string> = {};

  if (typeof username === "string") {
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      return res.status(400).json({ success: false, message: "Username is required" });
    }
    if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
      return res.status(400).json({
        success: false,
        message: "Username must be between 3 and 30 characters",
      });
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedUsername)) {
      return res.status(400).json({
        success: false,
        message:
          "Username may only contain letters, numbers, underscores, dots, and hyphens",
      });
    }

    const existing = await User.findOne({
      username: trimmedUsername,
      _id: { $ne: req.user.userId },
    }).select("_id");
    if (existing) {
      return res.status(409).json({ success: false, message: "Username already in use" });
    }

    update.username = trimmedUsername;
  }

  if (typeof bio === "string") {
    update.bio = bio.trim().slice(0, 280);
  }

  if (typeof displayPicture === "string") {
    const trimmedPicture = displayPicture.trim();
    if (!trimmedPicture) {
      update.displayPicture = "";
    } else {
      const isDataImage = /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(
        trimmedPicture
      );
      if (!isDataImage) {
        return res.status(400).json({
          success: false,
          message: "displayPicture must be a PNG, JPG, or WEBP data URL",
        });
      }
      if (trimmedPicture.length > 1_500_000) {
        return res.status(400).json({
          success: false,
          message: "displayPicture is too large",
        });
      }
      update.displayPicture = trimmedPicture;
    }
  }

  const updated = await User.findByIdAndUpdate(
    req.user.userId,
    { $set: update },
    { new: true }
  ).select("-passwordHash");

  return res.json({
    success: true,
    data: updated,
  });
});

export default router;
