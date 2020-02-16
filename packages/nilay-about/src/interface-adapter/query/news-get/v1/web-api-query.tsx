import Response from "../../../../use-case/news-get/v1/response";
import Request from "../../../../use-case/news-get/v1/request";
import Query from "../../../../use-case/news-get/v1/query";
import axios from "axios";

interface ApiNews {
  id: string;
  title: string;
  datetime: string;
  body: string;
}

class WebApiQuery implements Query {
  public async handle(request: Request): Promise<Response> {
    try {
      const res = await axios.get(
        `https://jq9dz9fa6d.execute-api.ap-northeast-1.amazonaws.com/v1/news/${request.id}`
      );
      const item: ApiNews = res.data;

      return {
        news: {
          id: item.id,
          title: item.title,
          date: new Date(item.datetime),
          summary: item.body
        }
      };
    } catch (ex) {
      throw ex;
    }
  }
}

export default WebApiQuery;
