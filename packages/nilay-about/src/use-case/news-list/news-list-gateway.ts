import { Response } from "./"

export interface NewsListGateway {

    read(): Promise<Response>;

}