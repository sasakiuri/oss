import * as React from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

interface News {
    id: string
    title: string
    datetime: string
    body: string
}

interface Props { }

interface State {
    newsCollection: Array<News>
}

class NewsView extends React.Component<Props, State> {


    public constructor(props: Props) {
        super(props);
        this.state = {
            newsCollection: new Array<News>()
        };
    }

    public componentDidMount(): void {
        document.title = "お知らせ：Nilay/Knowledge";
        axios
            .get(
                'https://jq9dz9fa6d.execute-api.ap-northeast-1.amazonaws.com/v1/news/'
            )
            .then(
                response => {
                    this.setState({
                        newsCollection: response.data as Array<News>
                    });
                }
            )
            .catch(
                error => { alert(error) }
            )
    }

    public render(): React.ReactNode {
        return (
            <div id="NewsView">
                <div className="h1">お知らせ</div>
                <div className="container">

                    <div className="list-group text-left">

                        {this.state.newsCollection.map((news) => {
                            return (
                                <Link to={`news/${news.id}`} key={news.id} className="list-group-item list-group-item-action flex-column align-items-start">
                                    <div className="d-flex w-100 justify-content-between">
                                        <h5 className="mb-1">{news.title}</h5>
                                        <small>{news.datetime}</small>
                                    </div>
                                    <p className="mb-1 mt-2">{news.body.replace(/<("[^"]*"|'[^']*'|[^'">])*>/g, '')}</p>
                                    <small>詳しく見る</small>
                                </Link>
                            )
                        })}
                    </div>
                </div>
            </div>
        );
    }
}

export default NewsView;