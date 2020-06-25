import { InputPort, Response, NewsListGateway } from "./"

export class Interactor implements InputPort {

    private gw: NewsListGateway

    constructor(gw: NewsListGateway) {

        this.gw = gw
    }

    async interact(): Promise<Response> {

        return await this.gw.read();
    }

}
