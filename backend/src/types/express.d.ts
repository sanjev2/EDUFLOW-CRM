import type { HydratedDocument } from "mongoose";
import type { IUser } from "../models/User.js";
import type { ISession } from "../models/Session.js";

declare global {
  namespace Express {
    interface Request {
      id: string;
      auth?: {
        user: HydratedDocument<IUser>;
        session: HydratedDocument<ISession>;
        rawToken: string;
      };
    }
  }
}

export {};
