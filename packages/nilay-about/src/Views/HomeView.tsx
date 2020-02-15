import * as React from 'react';
import Query from "../interface-adapter/query/news-list/v1/web-api-query"
import tanuki from '../Resources/0db7cad9ab39158b8ca1e2c3dd3e144dfa67c852.26a46334.png';
import HomeScene from "../scene/home/v1/container"
class HomeView extends React.Component {

    public componentDidMount(): void {
        document.title = "Nilay/About";
        const query: Query = new Query();
        
        (async () => {
            await query.handle();

        })();
    }

    public render(): React.ReactNode {
        return (
            <div className="home">
                <HomeScene />
            </div>
        );
    }
}

export default HomeView;