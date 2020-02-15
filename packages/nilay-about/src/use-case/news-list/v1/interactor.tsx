import InputPort from "./input-port"
import Query from "./query"
import Response from "./response"

class Interactor implements InputPort {

    private _query: Query

    public constructor(query: Query) {

        this._query = query
    }

    public async handle(): Promise<Response> {

        return await this._query.handle();
    }

}

export default Interactor