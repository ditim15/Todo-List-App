import express from "express";
import dotenv from "dotenv";
import errorHandler from "./middleware/errorhandler.js";
import helmet from 'helmet';
import cors from 'cors';

dotenv.config({
    path: './.env'
});

const app = express();

app.use(helmet());
app.use(express.json());
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
}));

import authRouter from "./routes/auth.js";
import todosRouter from "./routes/todos.js";

app.use("/auth", authRouter);
app.use("/todos", todosRouter);

app.use(errorHandler);

const startServer = async () => {
    try {
        app.on("error", (err) => {
            console.log("Error", err);
            throw err;
        });

        app.listen(process.env.PORT || 8000, () => {
            console.log(`Server is running on port ${process.env.PORT}`);
        });
    } catch (err) {
        console.log("Error starting server: ", err);
    }
} 

startServer();

export default app;