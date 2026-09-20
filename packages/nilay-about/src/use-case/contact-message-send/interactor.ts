import { Request, Response, InputPort, ContactMessageGateway } from "./"

export class Interactor implements InputPort {
  private _gw: ContactMessageGateway

  public constructor(gw: ContactMessageGateway) {
    this._gw = gw
  }

  async interact(uReq: Request): Promise<Response> {
    const gwRes: Response = await this._gw.write(uReq)

    if (gwRes.hasError) {
      throw new Error(gwRes.errorMessage)
    }

    return gwRes
  }
}
