import dotenv from "dotenv";
import http from "http";
import { app } from "./app.js";
import { initializeSocketServer } from "./realtime/socketServer.js";

dotenv.config();

const port = Number(process.env.PORT || 3000);
const server = http.createServer(app);

initializeSocketServer(server);

server.listen(port, () => {
  console.log(`API Pizzaria China rodando na porta ${port}`);
});
