import { Request, Response } from "./";

export interface ContactMessageGateway {
  write(gwReq: Request): Promise<Response>;
}
