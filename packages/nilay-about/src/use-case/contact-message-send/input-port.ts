import { Request, Response } from "./";

export interface InputPort {
  interact(uReq: Request): Promise<Response>;
}
