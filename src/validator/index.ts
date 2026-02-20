import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger.config';
// import { AnyZodObject } from 'zod';

export const validate = (schema: any) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            logger.info('validating request body')
            await schema.parseAsync(req.body); 
            logger.info('request body is valid')
            next();
        } catch (error: any) {
             res.status(400).json({
                success: false,
                message: "Validation Failed",
                data: {},
                error: error.errors
            });
        }
    };
};