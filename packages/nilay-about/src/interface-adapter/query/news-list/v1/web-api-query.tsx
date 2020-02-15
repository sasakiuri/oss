import Response from "../../../../use-case/news-list/v1/response"
import Query from "../../../../use-case/news-list/v1/query"
import News from "../../../../use-case/news-list/v1/news"
import axios from "axios"

interface ApiNews {
    id: string
    title: string
    datetime: string
    body: string
}

class WebApiQuery implements Query {

    public async handle(): Promise<Response> {
        try {

            const res = await axios.get("https://jq9dz9fa6d.execute-api.ap-northeast-1.amazonaws.com/v1/news/")
            const items: Array<ApiNews> = res.data

            const newsList: Array<News> = items.map((value: ApiNews) => {
                return { id: value.id, title: value.title, date: new Date(value.datetime), summary: value.body }
            });

            return { newsList: newsList }

        } catch (ex) {

            throw ex
        }
    }
}

export default WebApiQuery