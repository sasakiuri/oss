import Response from "./response"

interface Query {

    handle(): Promise<Response>;

}

export default Query