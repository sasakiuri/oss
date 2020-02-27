import Response from "./response";
import Request from "./request";

interface InputPort {
  handle(request: Request): Promise<Response>;
}

export default InputPort;
