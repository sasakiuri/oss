import Response from "./response";
import Request from "./request";

interface Query {
  handle(request: Request): Promise<Response>;
}

export default Query;
