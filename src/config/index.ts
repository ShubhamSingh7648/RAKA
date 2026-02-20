import dotenv from 'dotenv';

type ServerConfig = {
    PORT: number | string;
    JWT_SECRET: string;
    MONGO_URL:string;
};

function loadEnv() {
    dotenv.config();
    console.log("Env variables loaded");
}

loadEnv();

export const serverConfig: ServerConfig = {
    PORT: process.env.PORT || 3001,
    JWT_SECRET: process.env.JWT_SECRET as string,
    MONGO_URL:process.env.MONGO_URL as string
};