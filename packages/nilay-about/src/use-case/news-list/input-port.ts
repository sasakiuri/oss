import { Response } from "./response";

export interface InputPort {
  interact(): Promise<Response>;
}
