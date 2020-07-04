import { Request, Response, InputPort, NewsGetGateway } from "."

export class Interactor implements InputPort {
  private _gw: NewsGetGateway

  constructor(gw: NewsGetGateway) {
    this._gw = gw
  }

  async interact(req: Request): Promise<Response> {
    return await this._gw.read(req)
  }
}
