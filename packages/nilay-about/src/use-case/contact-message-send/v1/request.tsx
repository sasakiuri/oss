interface Request {
  requiresReply: boolean;
  email: string;
  title: string;
  message: string;
}

export default Request;