import { Request, Response } from "."

export interface NewsGetGateway {
  read(req: Request): Promise<Response>
}
