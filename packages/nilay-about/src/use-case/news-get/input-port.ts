import { Request, Response } from "./"

export interface InputPort {
  interact(req: Request): Promise<Response>
}
