import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import * as express from "express";

const allowedOrigins = new Set(
  [
    process.env.FRONTEND_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://localhost:3000",
    "https://softstream.taysirflow.duckdns.org",
    "https://api.taysirflow.duckdns.org",
    "https://taysirflow.duckdns.org",
  ].filter(Boolean) as string[],
);

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // On désactive le bodyParser par défaut pour le personnaliser
    bodyParser: false,
  });

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin) || /https?:\/\/([a-z0-9-]+\.)*duckdns\.org$/.test(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  });

  // ?? CONFIGURATION SPÉCIALE POUR STRIPE
  // On applique express.json() à toutes les routes, SAUF au webhook Stripe
  app.use((req: any, res: any, next: any) => {
    if (req.originalUrl === "/api/webhooks/stripe") {
      // Pour Stripe, on garde le corps brut
      express.raw({ type: "application/json" })(req, res, next);
    } else {
      // Pour le reste, on parse en JSON normalement
      express.json()(req, res, next);
    }
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) => {
        const messages = (errors ?? [])
          .flatMap((err) => {
            const constraints = err.constraints ? Object.values(err.constraints) : [];
            const nested = err.children ?? [];
            const nestedMessages = nested.flatMap((child) =>
              child.constraints ? Object.values(child.constraints) : [],
            );
            return [...constraints, ...nestedMessages];
          })
          .filter(Boolean);

        return new BadRequestException(messages.length ? messages : ["Les données envoyées sont invalides."]);
      },
    }),
  );

  await app.listen(4000, "0.0.0.0");
}

bootstrap();