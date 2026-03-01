declare module "helmet" {
  import type { RequestHandler } from "express";
  function helmet(options?: unknown): RequestHandler;
  export default helmet;
}

declare module "cloudinary" {
  export const v2: {
    utils: {
      api_sign_request(
        paramsToSign: Record<string, string | number>,
        apiSecret: string
      ): string;
    };
  };
}
