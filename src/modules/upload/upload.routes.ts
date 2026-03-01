import { Router } from "express";
import { authenticate, type AuthRequest } from "../../middleware/auth.middleware";
import { serverConfig } from "../../config";
import { v2 as cloudinary } from "cloudinary";

const router = Router();

router.post(
  "/profile/signature",
  authenticate,
  (req: AuthRequest, res) => {
    if (!req.user?.userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (
      !serverConfig.CLOUDINARY_CLOUD_NAME ||
      !serverConfig.CLOUDINARY_API_KEY ||
      !serverConfig.CLOUDINARY_API_SECRET
    ) {
      return res.status(500).json({
        success: false,
        message: "Cloudinary is not configured on the server",
      });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = serverConfig.CLOUDINARY_UPLOAD_FOLDER;
    const publicId = `user_${req.user.userId}_${timestamp}`;

    const signature = cloudinary.utils.api_sign_request(
      { folder, public_id: publicId, timestamp },
      serverConfig.CLOUDINARY_API_SECRET
    );

    return res.status(200).json({
      success: true,
      data: {
        cloudName: serverConfig.CLOUDINARY_CLOUD_NAME,
        apiKey: serverConfig.CLOUDINARY_API_KEY,
        folder,
        timestamp,
        publicId,
        signature,
      },
    });
  }
);

export default router;
