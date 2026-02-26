import { Router } from "express";
import authRoutes from "../../modules/auth/auth.routes";
import { authenticate, AuthRequest } from "../../middleware/auth.middleware";
import { User } from "../../modules/user/user.model";


const router = Router();
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

export default router;
