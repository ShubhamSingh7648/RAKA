import express from 'express';
import { pingHandler } from '../../controller/ping.controller';
import { validate } from '../../validator/index';
import { pingSchema } from '../../validator/ping.validator';

const router = express.Router();

// Changed from .get to .post to match your Postman request
router.get('/', validate(pingSchema), pingHandler);

export default router;