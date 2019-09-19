import * as React from 'react';

class NewsView extends React.Component {

    public componentDidMount(): void {
        document.title = "お知らせ：Nilay/Knowledge";
    }

    public render(): React.ReactNode {
        return (
            <div id="NewsView">
                お知らせページです。
            </div>
        );
    }
}

export default NewsView;