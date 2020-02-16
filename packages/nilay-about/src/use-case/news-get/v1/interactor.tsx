import InputPort from "./input-port";
import Query from "./query";
import Response from "./response";
import Request from "./request";

class Interactor implements InputPort {
  private _query: Query;

  public constructor(query: Query) {
    this._query = query;
  }

  public async handle(request: Request): Promise<Response> {
    return await this._query.handle(request);
  }
}

export default Interactor;
