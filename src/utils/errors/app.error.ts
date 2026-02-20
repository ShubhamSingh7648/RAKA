export class AppError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class InternalServerError extends AppError {
    constructor(message: string) {
        super(message, 500);
        this.name = "InternalServerError";
    }
}

export class filenotfound extends AppError {
    constructor(message: string) {
        super(message, 404);
        this.name = "filenotFound";
    }
}