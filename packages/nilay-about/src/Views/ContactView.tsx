import * as React from 'react';

class ContactView extends React.Component {

    public componentDidMount(): void {
        document.title = "お問い合わせ：Nilay/Knowledge";
    }

    public render(): React.ReactNode {
        return (
            <div id="ContactView">
                お問い合わせページです。
            </div>
        );
    }
}

export default ContactView;