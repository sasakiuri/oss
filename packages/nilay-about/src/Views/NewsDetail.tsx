import * as React from 'react'
import { RouteComponentProps } from 'react-router-dom'
import axios from 'axios'
import { Link } from 'react-router-dom';

interface News {
    id: string
    title: string
    datetime: string
    body: string
}

interface Props extends RouteComponentProps<{ id: string }> { }

interface State {
    news: News | null
}

class NewsDetail extends React.Component<Props, State> {


    public constructor(props: Props) {
        super(props)
        this.state = {
            news: null
        }
    }

    public componentDidMount(): void {
        axios
            .get<News>(
                `https://jq9dz9fa6d.execute-api.ap-northeast-1.amazonaws.com/v1/news/${this.props.match.params.id}`
            )
            .then(
                response => {
                    this.setState(
                        {
                            news: response.data
                        }
                    )

                    if (this.state.news !== null) {
                        document.title = `${this.state.news.title}：お知らせ：Nilay/About`
                    }

                }
            )
            .catch(
                error => { alert(error) }
            )
    }

    public render(): React.ReactNode {
        return (
            <div id="NewsDetail" className="text-left">
                {(() => {
                    if (this.state.news !== null) {
                        return (
                            <>
                                <div className="container">
                                    <div className="h1">{this.state.news.title}</div>
                                    <div className="text-right"><small>{this.state.news.datetime}</small></div>
                                    <div dangerouslySetInnerHTML={{ __html: this.state.news.body }}></div>
                                </div>
                            </>
                        )
                    }
                })()}
            </div>
        )
    }
}

export default NewsDetail;