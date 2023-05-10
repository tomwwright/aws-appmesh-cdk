import * as express from "express";
import type { ErrorRequestHandler } from "express";
import fetch from "node-fetch";

export const createApp = (service: string, version: string) => {
  const app = express();
  app.use(express.json());

  app.use("/downstream/:service", async (req, res, next) => {
    const { service: downstreamService } = req.params;
    try {
      console.log(`Fetching downstream: ${downstreamService}`);
      const response = await fetch(`http://${downstreamService}`);
      res.json({
        message: "fetched!",
        service,
        response: await response.json(),
      });
    } catch (err) {
      next(err);
    }
  });

  app.use("/", (req, res) => {
    res.json({
      message: "ok",
      service,
      version,
    });
  });

  app.use(((err, req, res, next) => {
    res.status(500).json({
      message: "error",
      service,
      error: err,
    });
  }) as ErrorRequestHandler);

  return app;
};
