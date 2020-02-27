import InputPort from "./input-port";
import Query from "./query";
import Response from "./response";
import Request from "./request";

class Interactor implements InputPort {
  private _query: Query;

  public constructor(query: Query) {
    this._query = query;
  }

  public async handle(req: Request): Promise<Response> {
    const res: Response = await this._query.write(req);

    if (res.hasError) {
      throw new Error(res.errorMessage);
    }

    return res;
  }
}

export default Interactor;
