import Response from "./response";
import Request from "./request";

interface Query {
  write(request: Request): Promise<Response>;
}

export default Query;
